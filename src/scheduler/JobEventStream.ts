/**
 * The durable job event stream (Workflow Protocol v1 §events).
 *
 * The stream is a PROJECTION of `delivery_events` — the log the delivery
 * subsystem already writes — plus ONE durable ack cursor
 * (`job_event_cursors`). There is no second event queue and no second table
 * family: `slot_id` is the job id, `ts` is the protocol `at`, and `event` is the
 * internal kind translated by the single mapping in `JobFacade`.
 *
 * Three properties this module owns, because they are protocol obligations:
 *
 *  1. **A terminal job always has a terminal event.** `SlotCoordinator`'s
 *     `execution.summary` hook only fires for success/partial/failed, and
 *     cancelled/expired slots would never produce one. Instead of widening the
 *     slot/business-status logic, the lifecycle events are *reconciled from the
 *     durable projection*: whatever the ledger already implies must exist, is
 *     materialised exactly once (mirroring `reconcileScheduleSummaries`). The
 *     page is therefore never empty for a job that exists.
 *
 *  2. **Ack is monotonic, idempotent and side-effect free.** It writes one row
 *     in `job_event_cursors` and nothing else. An unknown or older cursor is a
 *     no-op that reports the durable state — never an error.
 *
 *  3. **A declared `callback_url` is never silently dropped.** The event row and
 *     its callback intent are committed in ONE transaction, and a sweep over
 *     durable rows repairs any job whose terminal event is still missing (for
 *     example because the process died mid-flight). Retry/dead-lettering stay in
 *     the existing outbox worker.
 */

import type { Database } from '../storage/Database';
import type { DeliveryEvent } from '../storage/repositories/OutboxRepository';
import { EventCallbackPayload } from '../delivery/EventCallbackDelivery';
import { logger } from '../logger';
import {
  buildAckResult,
  buildEventPage,
  isProjectedInternalKind,
  parseAckBody,
  parseProtocolEventId,
  ProtocolAckResult,
  ProtocolEvent,
  ProtocolEventPage,
  ProtocolEventPosition,
  projectedInternalKinds,
  terminalJobEventKind,
  TERMINAL_JOB_EVENT_KINDS,
  type JobEventKind,
} from './JobFacade';
import { JobViewDeps, protocolJobBySlotId } from './JobView';
import { ProtocolRequestError } from './ProtocolErrors';

/** One page of events. Bounded so a long-running job cannot stream unbounded JSON. */
export const EVENTS_PAGE_LIMIT = 200;

/** Bounded callback budget: a flaky third-party URL must converge, not retry forever. */
export const EVENT_CALLBACK_MAX_ATTEMPTS = 8;

/** How many callback-bearing jobs one reconcile sweep repairs. */
const RECONCILE_SWEEP_LIMIT = 50;

export interface JobEventQuery {
  after: string | null;
  unackedOnly: boolean;
}

export class JobEventStream {
  constructor(private readonly deps: JobViewDeps) {}

  private get db(): Database {
    return this.deps.database;
  }

  /**
   * `$defs/EventPage`. Throws 404 for an unknown job, exactly like
   * `GET /jobs/:jobId`.
   */
  page(jobId: string, query: JobEventQuery): ProtocolEventPage {
    const job = this.requireJob(jobId);
    // The ledger, not a timer, decides which lifecycle events exist.
    this.reconcile(jobId);

    const kinds = projectedInternalKinds();
    const cursor = this.db.outbox.jobEventCursor(jobId);
    const unackedPosition = cursor ? { at: cursor.at, rowId: cursor.rowId } : null;
    const after = query.unackedOnly
      ? unackedPosition
      : this.resolveAfter(jobId, query.after);

    const rows = this.db.outbox.listSlotEvents(jobId, kinds, after, EVENTS_PAGE_LIMIT + 1);
    const hasMore = rows.length > EVENTS_PAGE_LIMIT;
    const pageRows = hasMore ? rows.slice(0, EVENTS_PAGE_LIMIT) : rows;

    return buildEventPage({
      jobId,
      sources: pageRows.map(toSource),
      job,
      correlationId: job.correlation_id ?? null,
      hasMore,
      // `unacked` always counts from the durable cursor, never from `after`:
      // a client paging backwards must not see the count move.
      unacked: this.db.outbox.countSlotEvents(jobId, kinds, unackedPosition),
      serverTime: this.deps.now(),
    });
  }

  /**
   * `$defs/AckResult`. `ack_through` is monotonic and idempotent: replaying it,
   * or sending an unknown/older cursor, is a no-op that reports what is durably
   * stored. Acking never touches the slot ledger.
   */
  ack(jobId: string, body: unknown): ProtocolAckResult {
    const { ackThrough } = parseAckBody(body);
    this.requireJob(jobId);
    this.reconcile(jobId);

    const kinds = projectedInternalKinds();
    const position = this.resolveAckTarget(jobId, ackThrough);
    if (position) this.db.outbox.advanceJobEventCursor(jobId, position, this.deps.now());

    const cursor = this.db.outbox.jobEventCursor(jobId);
    const unackedPosition = cursor ? { at: cursor.at, rowId: cursor.rowId } : null;
    const unacked = this.db.outbox.countSlotEvents(jobId, kinds, unackedPosition);
    const total = this.db.outbox.countSlotEvents(jobId, kinds, null);
    return buildAckResult({
      jobId,
      acked: total - unacked,
      unacked,
      serverTime: this.deps.now(),
    });
  }

  /**
   * Materialise every lifecycle event the durable ledger already implies, at
   * most once each, and enqueue the matching callback in the same transaction.
   * `callbackUrl` is only read when THIS call is the one that first records the
   * job's request: a replay never rewrites the declared callback.
   */
  reconcile(jobId: string, callbackUrl: string | null = null): void {
    const job = this.requireJob(jobId);

    this.ensure(job.job_id, job, 'job.requested', job.created_at, callbackUrl);
    if (job.started_at !== undefined && job.started_at !== null) {
      this.ensure(job.job_id, job, 'job.execution_started', job.started_at, null);
    }
    const terminal = terminalJobEventKind(job.status);
    if (terminal) this.ensure(job.job_id, job, terminal, job.updated_at, null);
  }

  /**
   * Repair sweep for jobs that declared a callback and have no durable terminal
   * event yet, so a process that died before the terminal reconcile still
   * delivers its terminal callback without waiting for a poll. Only jobs that
   * already own a durable `job.requested` row are in scope: that is exactly the
   * set whose callback endpoint is known, and re-running it can never queue a
   * second copy (the event_id is the outbox idempotency key). A job that never
   * recorded its request event is repaired on the consumer's next read instead.
   * Returns how many jobs it looked at, so a caller can assert it drains.
   */
  reconcileOutstanding(limit: number = RECONCILE_SWEEP_LIMIT): number {
    const slotIds = this.db.outbox.slotsAwaitingTerminalEvent(TERMINAL_JOB_EVENT_KINDS, limit);
    for (const slotId of slotIds) {
      try {
        this.reconcile(slotId);
      } catch (error) {
        // One broken job must never stop the outbox pump.
        logger.warn('Job event reconcile failed', { slotId, error });
      }
    }
    return slotIds.length;
  }

  private ensure(
    jobId: string,
    job: ReturnType<typeof protocolJobBySlotId>,
    kind: JobEventKind,
    at: number,
    callbackUrl: string | null
  ): void {
    if (!job) return;
    // One commit: "the event is durable" and "the callback is owed" cannot
    // diverge, so a crash can never lose a declared callback.
    this.db.transaction(() => {
      const write = this.db.outbox.recordSlotEventOnce({
        slotId: jobId,
        event: kind,
        at,
        deliveryTarget: callbackUrl,
      });
      if (!write.inserted) return;
      // Read the callback back from the durable declaration rather than from the
      // argument, so the terminal event and the request event can never name
      // different endpoints.
      const declared = this.declaredCallbackUrl(jobId);
      if (!declared) return;
      this.enqueueCallback(job, write.event, declared);
    });
  }

  /** The `callback_url` a job declared, read from its durable request event. */
  private declaredCallbackUrl(jobId: string): string | null {
    return this.db.outbox.slotEvent(jobId, 'job.requested')?.deliveryTarget ?? null;
  }

  private enqueueCallback(
    job: { job_id: string; correlation_id?: string },
    row: DeliveryEvent,
    url: string
  ): void {
    const payload: EventCallbackPayload = {
      event: null,
      job_id: job.job_id,
      context: { slotId: job.job_id },
    };
    // The body is built by the SAME builder the endpoint serves, so a callback
    // can never carry a shape the reader would not produce.
    const body = this.eventBodyFor(job, row);
    if (!body) return;
    payload.event = body;
    this.db.outbox.enqueue({
      kind: 'event_callback',
      deliveryTarget: url,
      // Reuses `idx_outbox_key`: replaying an admission, or re-running the
      // sweep, can never queue a second copy of the same event.
      idempotencyKey: `job-event:${job.job_id}:${body.event_id}`,
      payload,
      maxAttempts: EVENT_CALLBACK_MAX_ATTEMPTS,
    });
  }

  private eventBodyFor(
    job: { job_id: string; correlation_id?: string },
    row: DeliveryEvent
  ): ProtocolEvent | null {
    const page = buildEventPage({
      jobId: job.job_id,
      sources: [toSource(row)],
      job: this.requireJob(job.job_id),
      correlationId: job.correlation_id ?? null,
      hasMore: false,
      unacked: 0,
      serverTime: this.deps.now(),
    });
    return page.events[0] ?? null;
  }

  private requireJob(jobId: string) {
    const job = protocolJobBySlotId(this.deps, jobId);
    if (!job) {
      throw new ProtocolRequestError('invalid_params', 404, { message: 'unknown job' });
    }
    return job;
  }

  /**
   * `?after=` is a "give me everything after this" hint. An unrecognised or
   * foreign cursor cannot filter, so it is treated as absent and the consumer
   * sees the whole stream again — `event_id` is the dedupe key, and at-least-once
   * is the contract.
   */
  private resolveAfter(jobId: string, after: string | null): ProtocolEventPosition | null {
    if (!after) return null;
    const position = parseProtocolEventId(after);
    if (!position) return null;
    return this.durableProjectedPosition(jobId, position);
  }

  /**
   * Map an opaque `event_id` back to a durable position. Unknown ids, ids of
   * other jobs and internal-only rows all resolve to null, which callers treat
   * as "no-op" — never as an error.
   */
  private resolveAckTarget(jobId: string, ackThrough: string): ProtocolEventPosition | null {
    const position = parseProtocolEventId(ackThrough);
    if (!position) return null;
    return this.durableProjectedPosition(jobId, position);
  }

  private durableProjectedPosition(
    jobId: string,
    position: ProtocolEventPosition
  ): ProtocolEventPosition | null {
    const row = this.db.outbox.slotEventById(jobId, position.rowId);
    if (!row) return null;
    // Only an event the consumer can actually see may move a cursor: acking an
    // internal-only row would silently mark projectable events as read.
    if (!isProjectedInternalKind(row.event)) return null;
    return { at: row.ts, rowId: row.id };
  }
}

function toSource(row: DeliveryEvent): { rowId: number; at: number; internalKind: string } {
  return { rowId: row.id, at: row.ts, internalKind: row.event };
}
