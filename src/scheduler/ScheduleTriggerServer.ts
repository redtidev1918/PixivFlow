import express, { Express, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { Server } from 'node:http';

import { logger } from '../logger';

/**
 * Authenticated HTTP Slot trigger for `schedulerRuntime.mode: external`.
 *
 * A dumb external clock (Cloudflare cron worker, cron-job.org, GitHub Actions)
 * POSTs the slot name; this server wakes with the machine, verifies a bearer
 * token, and runs the schedules' slot **synchronously** so the open HTTP
 * request keeps the Fly machine active for the whole run (the request itself
 * is the activity lease — no background fire-and-forget that lets Fly stop the
 * machine mid-slot). All business state lives in the Slot ledger; the handler
 * never trusts a client-supplied past date and never back-fills old slots.
 */
export interface TriggerHandlers {
  /** Resolve the canonical slot for a requested name (validated to now). */
  resolveSlot(requested: string | undefined): { slotId: string; slotName: string; slotDate: string } | { error: string; status: number };
  /** Run one schedule's slot; idempotent. Returns the schedule's slot summary. */
  runScheduleSlot(scheduleId: string, slot: { slotId: string; slotName: string; slotDate: string }): Promise<ScheduleSlotResult>;
  /** List enabled schedules + today's slot status (for GET). */
  status(): unknown;
}

export interface ScheduleSlotResult {
  scheduleId: string;
  slotId: string;
  status: string;
  cells: Array<{ targetId: string; status: string; workId: string | null; error?: string | null }>;
  alreadyCompleted?: boolean;
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

    app.get('/internal/schedules', this.auth, (_req: Request, res: Response) => {
      res.json(this.handlers.status());
    });

    app.post('/internal/schedules/run', this.auth, async (req: Request, res: Response) => {
      try {
        const slotName = typeof req.body?.slot === 'string' ? req.body.slot : undefined;
        const resolved = this.handlers.resolveSlot(slotName);
        if ('error' in resolved) {
          res.status(resolved.status).json({ status: 'error', error: resolved.error });
          return;
        }

        const schedules = this.scheduleIds();
        if (schedules.length === 0) {
          res.status(409).json({ status: 'error', error: 'No enabled schedules' });
          return;
        }

        // Run schedules serially (low-memory). The first schedule's run returns
        // false-admission (already running) only under a true concurrent dup.
        const results: ScheduleSlotResult[] = [];
        for (const scheduleId of schedules) {
          results.push(await this.handlers.runScheduleSlot(scheduleId, resolved));
        }

        const anyWork = results.some((r) => !r.alreadyCompleted);
        res.json({
          status: results.some((r) => r.status === 'partial') ? 'partial' : 'ok',
          slot: resolved.slotId,
          note: results.every((r) => r.alreadyCompleted) ? 'already_completed' : anyWork ? 'completed' : 'noop',
          schedules: results,
        });
      } catch (error) {
        logger.error('Slot trigger failed', { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ status: 'error', error: 'slot run failed; the slot ledger will resume on the next trigger' });
      }
    });

    this.server = app.listen(port, host, () => {
      logger.info('Schedule trigger server listening', { host, port, auth: this.token ? 'bearer' : 'DISABLED (no token)' });
    });
  }

  private scheduleIds(): string[] {
    const s = this.handlers.status() as { schedules?: string[] };
    return s.schedules ?? [];
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
