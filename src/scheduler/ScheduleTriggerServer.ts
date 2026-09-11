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
}

export class ScheduleTriggerServer {
  private server: Server | null = null;

  constructor(
    private readonly token: string | undefined,
    private readonly handlers: TriggerHandlers
  ) {}

  /** Token from config or SCHEDULER_TRIGGER_TOKEN env; empty => fail closed. */
  static resolveToken(configured?: string): string | undefined {
    return (configured ?? process.env.SCHEDULER_TRIGGER_TOKEN ?? '').trim() || undefined;
  }

  start(host: string, port: number): void {
    const app: Express = express();
    app.use(express.json());

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
    app.post('/internal/schedules/:scheduleId/run', this.auth, async (req: Request, res: Response) => {
      try {
        const scheduleId = req.params.scheduleId;
        if (!this.handlers.listSchedules().includes(scheduleId)) {
          res.status(404).json({ status: 'error', error: `unknown schedule: ${scheduleId}` });
          return;
        }

        // Optional human label for provenance (e.g. a deploy-layer "今日早班").
        // Bounded; never parsed; identity always derives from the cron occurrence.
        const label =
          typeof req.body?.label === 'string' ? req.body.label.slice(0, 80) : undefined;

        const resolved = this.handlers.resolve(scheduleId, 'http', new Date(), label);
        if (!('context' in resolved)) {
          res.status(resolved.status).json({ status: 'error', error: resolved.error });
          return;
        }

        const result = await this.handlers.run(scheduleId, resolved.context);
        // Business disposition, not HTTP luck: an accepted or already-running
        // occurrence is NOT a completed one. Returning 200/"completed" for a run
        // that is still executing makes an external clock stop retrying and
        // silently lose the slot, so 'running' is reported as 202 here.
        switch (result.disposition) {
          case 'already_completed':
            res.status(200).json({
              status: 'completed',
              schedule: result,
              note: 'already_completed',
            });
            return;
          case 'accepted':
            res.status(202).json({
              status: 'accepted',
              schedule: result,
              note: 'queued',
            });
            return;
          case 'already_running':
            res.status(202).json({
              status: 'running',
              schedule: result,
              note: 'already_running',
            });
            return;
          default:
            res.status(503).json({
              status: 'rejected',
              schedule: result,
              note: 'rejected',
            });
            return;
        }
      } catch (error) {
        logger.error('Schedule trigger failed', { error: error instanceof Error ? error.message : String(error) });
        // The slot ledger resumes on the next trigger; a 500 tells the clock to
        // retry safely (idempotent — the same occurrence/ slot is reused).
        res.status(500).json({ status: 'error', error: 'schedule run failed; the occurrence will resume on the next trigger' });
      }
    });

    // Convergence endpoint: after a machine stop/start, an operator or an
    // external watcher can ask the process to flush due deliveries/notifications
    // without running candidate selection. Deployment-agnostic (no platform refs).
    app.post('/internal/outbox/drain', this.auth, async (_req: Request, res: Response) => {
      try {
        if (!this.handlers.drainOutbox) {
          res.status(503).json({ status: 'error', error: 'outbox worker not available in this runtime' });
          return;
        }
        const result = await this.handlers.drainOutbox();
        res.json({ status: 'ok', result });
      } catch (error) {
        logger.error('Outbox drain failed', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ status: 'error', error: 'outbox drain failed; rows remain durable and retry' });
      }
    });

    this.server = app.listen(port, host, () => {
      logger.info('Schedule trigger server listening', { host, port, auth: this.token ? 'bearer' : 'DISABLED (no token)' });
    });
  }

  private auth = (req: Request, res: Response, next: () => void): void => {
    if (!this.token) {
      // Fail closed: never allow an unauthenticated trigger in production.
      res.status(503).json({ status: 'error', error: 'trigger disabled: SCHEDULER_TRIGGER_TOKEN not configured' });
      return;
    }
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const expected = this.token;
    let ok = presented.length === expected.length;
    if (ok) {
      try {
        ok = timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      res.status(401).json({ status: 'error', error: 'unauthorized' });
      return;
    }
    next();
  };

  stop(): void {
    this.server?.close();
    this.server = null;
  }
}