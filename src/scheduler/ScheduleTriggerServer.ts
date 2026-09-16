import express, { Express, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { Server } from 'node:http';

import { logger } from '../logger';
import { SlotContext } from './SlotCoordinator';
import { TriggerSource } from './OccurrenceResolver';

/**
 * Authenticated HTTP schedule trigger — a DISPATCH endpoint, not a run endpoint.
 *
 * A dumb external clock (Cloudflare cron worker, cron-job.org, GitHub Actions)
 * POSTs a schedule id; this server verifies a bearer token, resolves the
 * canonical occurrence from the schedule's OWN cron + timezone (never a
 * client-supplied date), durably records the slot and returns immediately with a
 * business disposition. Execution happens in the in-process scheduler behind a
 * short renewable lease, so the response no longer has to stay open for the
 * whole 10-40 minute run.
 *
 * That distinction matters: holding the request open assumed the connection was
 * an activity lease, but a 10-40 min run cannot survive the router/proxy/client
 * timeouts that assumption ignored, and a run that outlived them was frozen or
 * reported as failed while work was still owed. Durable state plus a background
 * worker means a dropped connection is now recoverable instead of fatal.
 *
 * All business state lives in the Slot ledger; the handler only authenticates,
 * validates, resolves and delegates. It never queries Pixiv, loops targets, or
 * touches the Slot DB itself.
 *
 * Mounting is independent of `schedulerRuntime.mode`: external mode mounts it as
 * the primary clock; always-on/internal mode may also mount it for manual ops.
 */
/**
 * What the trigger adapter actually did with the request. This is the contract
 * an external clock must judge, because HTTP status alone cannot distinguish
 * "the run was admitted and is executing" from "the occurrence is finished".
 */
export type TriggerDisposition =
  /** Accepted now; the slot is durably recorded and executes in the background. */
  | 'accepted'
  /** Another worker owns the slot; this trigger converged onto it. */
  | 'already_running'
  /** The occurrence reached a terminal state (success/partial) earlier. */
  | 'already_completed'
  /** Not admitted (unknown/disabled schedule, budget exhausted, bad state). */
  | 'rejected';

export interface TriggerRunResult {
  scheduleId: string;
  slotId: string;
  disposition: TriggerDisposition;
  status: string;
  alreadyCompleted?: boolean;
  cells?: Array<{ targetId: string; status: string; workId: string | null; error?: string | null }>;
}

/**
 * The ONE place a disposition is bound to both its HTTP status and its log
 * event. The response write and the `trigger.*` log line both read this table,
 * so the status an external clock sees and the outcome an operator reads can
 * never drift apart. Neither adds nor renames any status code or event name.
 */
interface TriggerOutcomeSpec {
  event: string;
  httpStatus: number;
  /** Response body `status` field (unchanged wire format). */
  status: string;
  /** Response body `note` field (unchanged wire format). */
  note: string;
}

const TRIGGER_OUTCOMES: Record<TriggerDisposition, TriggerOutcomeSpec> = {
  accepted: { event: 'schedule.trigger_accepted', httpStatus: 202, status: 'accepted', note: 'queued' },
  already_running: {
    event: 'schedule.trigger_already_running',
    httpStatus: 202,
    status: 'running',
    note: 'already_running',
  },
  already_completed: {
    event: 'schedule.trigger_already_completed',
    httpStatus: 200,
    status: 'completed',
    note: 'already_completed',
  },
  rejected: { event: 'schedule.trigger_rejected', httpStatus: 503, status: 'rejected', note: 'rejected' },
};

/** Bounded, log-safe correlation token. */
const ATTEMPT_ID_MAX_LENGTH = 64;
const ATTEMPT_ID_UNSAFE = /[^A-Za-z0-9._:-]/g;

/**
 * Correlation id issued by the calling clock (`x-schedule-attempt-id`, falling
 * back to `x-attempt-id`).
 *
 * Purely diagnostic: it is trimmed, reduced to `[A-Za-z0-9._:-]` and capped, and
 * it NEVER participates in occurrence identity. When the clock sends nothing
 * usable the field is omitted rather than synthesized — a made-up id would make
 * a missing clock indistinguishable from a satisfied one, which is exactly the
 * blindness this logging exists to remove.
 */
export function scheduleAttemptId(req: Request): string | undefined {
  const raw = req.headers['x-schedule-attempt-id'] ?? req.headers['x-attempt-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(ATTEMPT_ID_UNSAFE, '').slice(0, ATTEMPT_ID_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Max length and character set of the provider tag, which is log-only metadata. */
const PROVIDER_MAX_LENGTH = 32;
const PROVIDER_UNSAFE = /[^A-Za-z0-9._-]/g;

/**
 * Optional self-identification from the clock that fired: `X-Schedule-Provider`
 * (e.g. `cron-job-org`, `cloudflare`, `manual`).
 *
 * OBSERVABILITY ONLY. It NEVER participates in authorization and NEVER in
 * occurrence identity: a clock that lies about its name changes one log field
 * and nothing else. That is deliberate — a self-declared header must not be able
 * to alter which occurrence runs or whether the request is admitted. Sanitized
 * and bounded like the attempt id, and omitted when the clock sends nothing
 * usable rather than defaulted, so "we do not know which clock this was" stays
 * distinguishable from "the clock identified itself".
 */
export function scheduleProvider(req: Request): string | undefined {
  const raw = req.headers['x-schedule-provider'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(PROVIDER_UNSAFE, '').slice(0, PROVIDER_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Epoch ms -> ISO 8601 UTC. Undefined when the value is not a usable instant. */
function isoUtc(epochMs: number | null | undefined): string | undefined {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return undefined;
  const date = new Date(epochMs);
  // `toISOString` throws on an out-of-range Date, and inside the handler that
  // would turn a real 202 into a 500 — logging must never move the status code.
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export interface TriggerHandlers {
  /** Enabled schedule ids (for 404 on unknown / GET listing). */
  listSchedules(): string[];
  /**
   * Resolve the canonical occurrence for a trigger to `scheduleId` at `at`.
   * Returns a durable SlotContext or an HTTP error ({ status, error }).
   */
  resolve(scheduleId: string, source: TriggerSource, at: Date, label?: string):
    | { context: SlotContext }
    | { error: string; status: number };
  /** Run the schedule for a resolved occurrence; idempotent. */
  run(scheduleId: string, context: SlotContext): Promise<TriggerRunResult>;
  /** Read-only snapshot of a schedule's current occurrence (for GET). */
  status(scheduleId: string): unknown;
  /** Optional: pump due durable outbox rows (used to converge after cold start). */
  drainOutbox?(): Promise<{ processed?: number; done?: number; retried?: number; dead?: number }>;
  /** Admit one target into a durable, separate manual Slot. */
  refetch?(
    targetId: string,
    requestId: string,
    correlationId?: string
  ): Promise<{ slotId: string; disposition: string }>;
  refetchStatus?(targetId: string, requestId: string): { requestId: string; slotId: string; state: string; slotStatus: string } | null;
  /**
   * Admit one manual RECOVERY of a failed target (§manual-recovery). `retryMode`
   * selects a SERVER-DEFINED acquisition policy preset ('normal' | 'relaxed');
   * callers never supply raw acquisition parameters. The run is
   * occurrence-scoped: it never changes the global config or future schedules.
   */
  recover?(
    targetId: string,
    requestId: string,
    retryMode: 'normal' | 'relaxed',
    correlationId?: string
  ): Promise<{ slotId: string; disposition: string }>;
  recoverStatus?(targetId: string, requestId: string): {
    requestId: string;
    slotId: string;
    state: string;
    slotStatus: string;
    /** Recovery business outcome (recovery_success / no_candidate / duplicate_only / failed / running / pending). */
    business_state?: string;
    /** User-facing copy; never leaks internal error names. */
    message?: string;
  } | null;
}

export class ScheduleTriggerServer {
  private server: Server | null = null;

  constructor(
    private readonly token: string | undefined,
    private readonly handlers: TriggerHandlers,
    private readonly refetchToken: string | undefined = process.env.PIXIVFLOW_REFETCH_TOKEN?.trim() || undefined
  ) {}

  /** Token from config or SCHEDULER_TRIGGER_TOKEN env; empty => fail closed. */
  static resolveToken(configured?: string): string | undefined {
    return (configured ?? process.env.SCHEDULER_TRIGGER_TOKEN ?? '').trim() || undefined;
  }

  start(host: string, port: number): void {
    const app: Express = express();
    app.use(express.json());
    // Correlation + clock start for every route. Cheap enough to be unconditional.
    app.use(this.correlate);

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'pixivflow-scheduler-trigger' });
    });

    // Read-only: list enabled schedules + their current occurrence status.
    app.get('/internal/schedules', this.auth, (_req: Request, res: Response) => {
      const schedules = this.handlers.listSchedules().map((id) => this.handlers.status(id));
      res.json({ schedules });
    });

    // Trigger one schedule by id. The server resolves the occurrence from the
    // schedule cron; the body carries no date and cannot back-fill history.
    //
    // `received` runs BEFORE auth so a trigger that is never admitted (bad token,
    // disabled endpoint) still leaves durable evidence that the clock fired —
    // "the clock never arrived" and "the clock was rejected" used to look the
    // same from outside: nothing at all.
    app.post(
      '/internal/schedules/:scheduleId/run',
      this.received,
      this.auth,
      async (req: Request, res: Response) => {
        try {
          const scheduleId = req.params.scheduleId;
          if (!this.handlers.listSchedules().includes(scheduleId)) {
            res.status(404).json({ status: 'error', error: `unknown schedule: ${scheduleId}` });
            this.triggerOutcome('schedule.trigger_not_found', 404, req, res, { schedule_id: scheduleId });
            return;
          }

          // Optional human label for provenance (e.g. a deploy-layer "今日早班").
          // Bounded; never parsed; identity always derives from the cron occurrence.
          const label =
            typeof req.body?.label === 'string' ? req.body.label.slice(0, 80) : undefined;

          const resolved = this.handlers.resolve(scheduleId, 'http', new Date(), label);
          if (!('context' in resolved)) {
            // A resolve refusal (expired occurrence 410, too-early 425, bad cron
            // 400) is a business rejection, so it reports `resolved.status`
            // rather than the transport-level 503.
            res.status(resolved.status).json({ status: 'error', error: resolved.error });
            this.triggerOutcome('schedule.trigger_rejected', resolved.status, req, res, {
              schedule_id: scheduleId,
              disposition: 'rejected',
              reason: resolved.error,
            });
            return;
          }

          const context = resolved.context;
          const result = await this.handlers.run(scheduleId, context);
          // Business disposition, not HTTP luck: an accepted or already-running
          // occurrence is NOT a completed one. Returning 200/"completed" for a run
          // that is still executing makes an external clock stop retrying and
          // silently lose the slot, so 'running' is reported as 202 here.
          // Status code, body and log event all come from ONE table.
          const spec = TRIGGER_OUTCOMES[result.disposition] ?? TRIGGER_OUTCOMES.rejected;
          res.status(spec.httpStatus).json({ status: spec.status, schedule: result, note: spec.note });
          this.triggerOutcome(spec.event, spec.httpStatus, req, res, {
            schedule_id: scheduleId,
            slot_id: context.slotId,
            occurrence_at: isoUtc(context.occurrenceAt),
            disposition: result.disposition,
            reason: result.cells?.find((cell) => cell.error)?.error ?? undefined,
            trigger_source: context.triggerSource,
          });
        } catch (error) {
          logger.error('Schedule trigger failed', { error: error instanceof Error ? error.message : String(error) });
          // The slot ledger resumes on the next trigger; a 500 tells the clock to
          // retry safely (idempotent — the same occurrence/ slot is reused).
          res.status(500).json({ status: 'error', error: 'schedule run failed; the occurrence will resume on the next trigger' });
          this.triggerOutcome('schedule.trigger_error', 500, req, res, {
            schedule_id: req.params.scheduleId,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    );

    app.post('/internal/targets/:targetId/refetch', this.refetchAuth, async (req: Request, res: Response) => {
      const requestId = req.body?.requestId;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        res.status(400).json({ status: 'error', error: 'requestId must be a UUID' });
        return;
      }
      // Opaque caller correlation (review chain / review id). Optional; bounded
      // length, never interpreted here. Recorded with the manual Slot so a
      // recovered worker still correlates the outcome with the requester.
      const correlationId = req.body?.correlationId;
      if (correlationId !== undefined && (typeof correlationId !== 'string' || correlationId.length > 200)) {
        res.status(400).json({ status: 'error', error: 'correlationId must be a string of at most 200 chars' });
        return;
      }
      if (!this.handlers.refetch) {
        res.status(503).json({ status: 'error', error: 'refetch is unavailable' });
        return;
      }
      try {
        const result = await this.handlers.refetch(req.params.targetId, requestId, correlationId ?? undefined);
        res.status(202).json({ status: 'accepted', ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message === 'unknown target' ? 404 : message === 'ambiguous target' ? 409 : 500;
        logger.warn('Manual refetch rejected', { targetId: req.params.targetId, requestId, status, error: message });
        res.status(status).json({ status: 'error', error: status === 500 ? 'refetch admission failed' : message });
      }
    });

    app.get('/internal/targets/:targetId/refetch/:requestId', this.refetchAuth, (req: Request, res: Response) => {
      const { targetId, requestId } = req.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        res.status(400).json({ status: 'error', error: 'requestId must be a UUID' });
        return;
      }
      const status = this.handlers.refetchStatus?.(targetId, requestId);
      if (!status) {
        res.status(404).json({ status: 'error', error: 'manual refetch not found' });
        return;
      }
      res.json(status);
    });

    // Manual RECOVERY of a failed schedule target (§manual-recovery). Same
    // authenticated manual-work family as refetch (PIXIVFLOW_REFETCH_TOKEN) but
    // a DIFFERENT business intent: it re-runs the failed target(s) under a
    // server-defined acquisition policy preset and reports through the
    // schedule-outcome channel, so the daily summary is never rewritten.
    // Admitting is all this endpoint does; if the resource is busy the run is
    // queued (202 + disposition 'queued'), never failed.
    app.post('/internal/targets/:targetId/recover', this.refetchAuth, async (req: Request, res: Response) => {
      const requestId = req.body?.requestId;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        res.status(400).json({ status: 'error', error: 'requestId must be a UUID' });
        return;
      }
      // Only a NAMED preset is accepted — never raw acquisition parameters.
      const rawMode = req.body?.retryMode;
      const retryMode = rawMode === undefined || rawMode === null || rawMode === '' ? 'normal' : rawMode;
      if (retryMode !== 'normal' && retryMode !== 'relaxed') {
        res.status(400).json({ status: 'error', error: 'retryMode must be "normal" or "relaxed"' });
        return;
      }
      const correlationId = req.body?.correlationId;
      if (correlationId !== undefined && (typeof correlationId !== 'string' || correlationId.length > 200)) {
        res.status(400).json({ status: 'error', error: 'correlationId must be a string of at most 200 chars' });
        return;
      }
      if (!this.handlers.recover) {
        res.status(503).json({ status: 'error', error: 'manual recovery is unavailable' });
        return;
      }
      try {
        const result = await this.handlers.recover(
          req.params.targetId, requestId, retryMode, correlationId ?? undefined
        );
        res.status(202).json({ status: 'accepted', retryMode, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message === 'unknown target' ? 404 : message === 'ambiguous target' ? 409 : 500;
        logger.warn('Manual recovery rejected', {
          targetId: req.params.targetId, requestId, retryMode, status, error: message,
        });
        res.status(status).json({ status: 'error', error: status === 500 ? 'recovery admission failed' : message });
      }
    });

    app.get('/internal/targets/:targetId/recover/:requestId', this.refetchAuth, (req: Request, res: Response) => {
      const { targetId, requestId } = req.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        res.status(400).json({ status: 'error', error: 'requestId must be a UUID' });
        return;
      }
      const status = this.handlers.recoverStatus?.(targetId, requestId);
      if (!status) {
        res.status(404).json({ status: 'error', error: 'manual recovery not found' });
        return;
      }
      res.json(status);
    });

    // Convergence endpoint: after a machine stop/start, an operator or an
    // external watcher can ask the process to flush due deliveries/notifications
    // without running candidate selection. Deployment-agnostic (no platform refs).
    app.post('/internal/outbox/drain', this.auth, async (req: Request, res: Response) => {
      try {
        if (!this.handlers.drainOutbox) {
          res.status(503).json({ status: 'error', error: 'outbox worker not available in this runtime' });
          return;
        }
        const result = await this.handlers.drainOutbox();
        res.json({ status: 'ok', result });
      } catch (error) {
        // Same correlation as the trigger lines, at zero extra cost.
        logger.error('Outbox drain failed', {
          ...this.attemptMeta(req, res),
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ status: 'error', error: 'outbox drain failed; rows remain durable and retry' });
      }
    });

    this.server = app.listen(port, host, () => {
      logger.info('Schedule trigger server listening', { host, port, auth: this.token ? 'bearer' : 'DISABLED (no token)' });
    });
  }

  /**
   * Per-request correlation, installed before every route. It records only the
   * sanitized attempt id and the arrival instant, so each later line can report
   * the same `attempt_id` and a handler-relative `elapsed_ms`.
   */
  private correlate = (req: Request, res: Response, next: () => void): void => {
    res.locals.triggerStartedAt = Date.now();
    res.locals.triggerAttemptId = scheduleAttemptId(req);
    res.locals.triggerProvider = scheduleProvider(req);
    next();
  };

  /**
   * `trigger.received` — the clock arrived. Runs before auth, so it carries only
   * non-sensitive request metadata: never the Authorization header, the bearer
   * value, the configured token, or any fragment of them.
   */
  private received = (req: Request, res: Response, next: () => void): void => {
    logger.info('Schedule trigger received', { event: 'schedule.trigger_received', ...this.attemptMeta(req, res) });
    next();
  };

  /**
   * The single writer for every post-resolution `trigger.*` line. `event` and
   * `http_status` are passed in from the caller's outcome table, so the line
   * always describes the same status the response carried.
   */
  private triggerOutcome(
    event: string,
    httpStatus: number,
    req: Request,
    res: Response,
    extra: Record<string, unknown>
  ): void {
    logger.info('Schedule trigger outcome', {
      event,
      ...this.attemptMeta(req, res),
      http_status: httpStatus,
      ...extra,
    });
  }

  /**
   * The non-sensitive correlation fields shared by every `schedule.trigger_*`
   * line. `attempt_id` and `provider` are OMITTED (never defaulted) when the
   * clock did not send them, so an unidentified clock stays visible as such.
   */
  private attemptMeta(req: Request, res: Response): Record<string, unknown> {
    const attemptId: string | undefined = res.locals.triggerAttemptId;
    const provider: string | undefined = res.locals.triggerProvider;
    const startedAt: number = res.locals.triggerStartedAt ?? Date.now();
    return {
      ...(attemptId ? { attempt_id: attemptId } : {}),
      ...(provider ? { provider } : {}),
      path: req.path,
      method: req.method,
      elapsed_ms: Date.now() - startedAt,
    };
  }

  private auth = (req: Request, res: Response, next: () => void): void => {
    this.authenticate(this.token, req, res, next);
  };

  private refetchAuth = (req: Request, res: Response, next: () => void): void => {
    this.authenticate(this.refetchToken, req, res, next);
  };

  private authenticate(expected: string | undefined, req: Request, res: Response, next: () => void): void {
    if (!expected) {
      // Fail closed: never allow an unauthenticated trigger in production. This
      // is an admission failure, so it is reported with the status actually sent.
      res.status(503).json({ status: 'error', error: 'endpoint disabled: token not configured' });
      this.triggerOutcome('schedule.trigger_unauthorized', 503, req, res, { reason: 'endpoint disabled: no token configured' });
      return;
    }
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    let ok = presented.length === expected.length;
    if (ok) {
      try {
        // Values only, never logged: the timing check is deliberately opaque.
        ok = timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      res.status(401).json({ status: 'error', error: 'unauthorized' });
      this.triggerOutcome('schedule.trigger_unauthorized', 401, req, res, { reason: 'invalid or missing bearer token' });
      return;
    }
    next();
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}
