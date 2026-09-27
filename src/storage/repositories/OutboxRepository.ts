import { randomUUID } from 'node:crypto';
import { BaseRepository } from './BaseRepository';

export interface DeliveryEvent {
  id: number;
  ts: number;
  deliveryId: string | null;
  outboxId: string | null;
  executionId: string | null;
  slotId: string | null;
  pixivId: string | null;
  deliveryTarget: string | null;
  event: string;
  errorClass: string | null;
  retryable: number | null;
  countsAsAttempt: number;
  actor: string | null;
  detail: string | null;
}

export interface RecordEventInput {
  deliveryId?: string | null;
  outboxId?: string | null;
  executionId?: string | null;
  slotId?: string | null;
  pixivId?: string | null;
  deliveryTarget?: string | null;
  event: string;
  errorClass?: string | null;
  retryable?: boolean | null;
  countsAsAttempt?: 0 | 1;
  actor?: string | null;
  /** Short pre-sanitized JSON-able detail. Never put secrets here. */
  detail?: Record<string, unknown> | null;
}

/**
 * A position in one job's durable event log: the `(ts, id)` of a
 * `delivery_events` row. Total order, resolvable back to the row, and stable
 * across restarts — which is what makes the ack cursor meaningful.
 */
export interface EventCursorPosition {
  at: number;
  rowId: number;
}

export interface JobEventCursor extends EventCursorPosition {
  jobId: string;
  updatedAt: number;
}

export interface SlotEventInput {
  slotId: string;
  event: string;
  /** Honest instant of the transition. Clamped to the slot's newest event. */
  at?: number;
  /** Only set on the `job.requested` row: the declared callback_url. */
  deliveryTarget?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface SlotEventWrite {
  /** False when an identical lifecycle event was already durable. */
  inserted: boolean;
  event: DeliveryEvent;
}

/**
 * Outbox row kinds. `event_callback` is a Workflow Protocol v1 §events
 * obligation: deliver one `$defs/Event` to the Task's `callback_url`. It rides
 * the SAME outbox, dedupe index and retry machinery as outcome delivery — it is
 * not a second delivery system, and `hasActionableDelivery` (kind='delivery')
 * and the delivery ledger are deliberately unaffected by it.
 */
export type OutboxKind = 'delivery' | 'notification' | 'event_callback';
export type OutboxStatus = 'pending' | 'processing' | 'retry_wait' | 'done' | 'dead' | 'cancelled';

export interface OutboxRow {
  id: string;
  kind: OutboxKind;
  idempotencyKey: string | null;
  deliveryId: string | null;
  deliveryTarget: string;
  payloadJson: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  leaseOwner: string | null;
  leaseUntil: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface NewOutboxItem {
  kind: OutboxKind;
  deliveryTarget: string;
  idempotencyKey?: string | null;
  deliveryId?: string | null;
  payload: unknown;
  /** Initial due time (epoch ms). Default now. */
  dueAt?: number;
  maxAttempts?: number;
}

/**
 * SQLite transactional outbox. One durable row per intended external side
 * effect (a content delivery or a notification). A single OutboxWorker claims
 * due rows with a short lease, performs the effect, and marks them done. Rows
 * survive process kill / machine stop; a restart simply resumes due rows.
 */
export class OutboxRepository extends BaseRepository {
  static owner(): string {
    return `${process.pid}-${randomUUID().slice(0, 8)}`;
  }

  /** Insert an intent. Returns the row. Idempotent on (kind, idempotency_key). */
  enqueue(input: NewOutboxItem, now: number = Date.now()): OutboxRow {
    const id = randomUUID();
    const payloadJson = JSON.stringify(input.payload ?? {});
    this.db
      .prepare(
        `INSERT INTO outbox
           (id, kind, idempotency_key, delivery_id, delivery_target, payload_json,
            status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
         VALUES
           (@id, @kind, @idempotencyKey, @deliveryId, @deliveryTarget, @payloadJson,
            'pending', 0, @maxAttempts, @dueAt, @now, @now)
         ON CONFLICT(kind, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO UPDATE SET updated_at = @now`
      )
      .run({
        id,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey ?? null,
        deliveryId: input.deliveryId ?? null,
        deliveryTarget: input.deliveryTarget,
        payloadJson,
        maxAttempts: input.maxAttempts ?? 12,
        dueAt: input.dueAt ?? now,
        now,
      });
    // On conflict the existing row is authoritative; fetch by the natural key.
    if (input.idempotencyKey) {
      const existing = this.getByKey(input.kind, input.idempotencyKey)!;
      // A terminal row for work that is still owed must not swallow the new
      // intent (see `revive`): otherwise a per-target retry could never re-send
      // the platform that dead-lettered.
      if (existing.status === 'dead' || existing.status === 'cancelled') {
        this.revive(existing.id, now);
        return this.get(existing.id)!;
      }
      return existing;
    }
    return this.get(id)!;
  }

  get(id: string): OutboxRow | null {
    const row = this.db.prepare(`SELECT * FROM outbox WHERE id = ?`).get(id) as any;
    return row ? this.toRow(row) : null;
  }

  getByKey(kind: OutboxKind, key: string): OutboxRow | null {
    const row = this.db
      .prepare(`SELECT * FROM outbox WHERE kind = ? AND idempotency_key = ?`)
      .get(kind, key) as any;
    return row ? this.toRow(row) : null;
  }

  /**
   * The outbox rows behind a batch of delivery intents, keyed by delivery id.
   *
   * Read-only correlation for the operator CLI (`pixivflow delivery status`):
   * the ledger says whether a route is owed a send, the outbox row says whether
   * anything is actually going to attempt it. A delivery with no row at all is
   * absent from the map (terminal and already reaped).
   */
  listForDeliveryIds(deliveryIds: string[]): Map<string, OutboxRow> {
    const ids = [...new Set(deliveryIds.filter((id) => typeof id === 'string' && id))].slice(0, 500);
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT * FROM outbox
          WHERE delivery_id IN (${placeholders})
          ORDER BY created_at DESC`
      )
      .all(...ids) as any[];
    const byDeliveryId = new Map<string, OutboxRow>();
    for (const row of rows) {
      const mapped = this.toRow(row);
      // Newest row wins: a revived intent is the one that still matters.
      if (mapped.deliveryId && !byDeliveryId.has(mapped.deliveryId)) {
        byDeliveryId.set(mapped.deliveryId, mapped);
      }
    }
    return byDeliveryId;
  }

  /**
   * True when this delivery intent still has a row the worker can act on
   * (pending / claimed / waiting to retry).
   *
   * This is the "the outbox still owns it" test. A delivery whose outbox row is
   * done/dead/cancelled is NOT actionable: whatever happened downstream is
   * terminal, so nobody is going to converge that delivery by retrying it.
   */
  hasActionableDelivery(deliveryId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM outbox
         WHERE delivery_id = ? AND kind = 'delivery'
           AND status IN ('pending','processing','retry_wait')
         LIMIT 1`
      )
      .get(deliveryId);
    return Boolean(row);
  }

  list(status?: OutboxStatus, limit = 100): OutboxRow[] {
    const bounded = Math.max(1, Math.min(Math.trunc(limit), 500));
    const rows = status
      ? this.db.prepare(
          `SELECT * FROM outbox WHERE status=? ORDER BY created_at DESC LIMIT ?`
        ).all(status, bounded)
      : this.db.prepare(
          `SELECT * FROM outbox ORDER BY created_at DESC LIMIT ?`
        ).all(bounded);
    return (rows as any[]).map((row) => this.toRow(row));
  }

  /**
   * Claim up to `limit` due rows for `owner`. Due = pending/retry_wait whose
   * next_attempt_at has passed, OR processing rows whose lease expired (a
   * crashed prior worker). The claim is a compare-and-set inside one
   * statement, so two workers/processes never grab the same row.
   */
  claimDue(owner: string, leaseMs: number, limit: number, now: number = Date.now()): OutboxRow[] {
    const ids = (this.db
      .prepare(
        `SELECT id FROM outbox
         WHERE status IN ('pending','retry_wait') AND next_attempt_at <= @now
            OR (status = 'processing' AND lease_until IS NOT NULL AND lease_until <= @now)
         ORDER BY next_attempt_at ASC
         LIMIT @limit`
      )
      .all({ now, limit }) as Array<{ id: string }>).map((r) => r.id);

    if (ids.length === 0) return [];
    const claim = this.db.prepare(
      `UPDATE outbox
       SET status = 'processing', lease_owner = @owner, lease_until = @until, updated_at = @now
       WHERE id = @id
         AND (status IN ('pending','retry_wait') AND next_attempt_at <= @now
              OR (status = 'processing' AND lease_until IS NOT NULL AND lease_until <= @now))`
    );
    const out: OutboxRow[] = [];
    const tx = this.db.transaction((rows: string[]) => {
      for (const id of rows) {
        const info = claim.run({ id, owner, until: now + leaseMs, now });
        if (info.changes > 0) {
          const row = this.get(id);
          if (row) out.push(row);
        }
      }
    });
    tx(ids);
    return out;
  }

  markDone(id: string, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE outbox
         SET status='done', lease_owner=NULL, lease_until=NULL, last_error=NULL,
             completed_at=@now, updated_at=@now
         WHERE id=@id`
      )
      .run({ id, now });
  }

  /**
   * Dead-letter a row whose failure cannot be fixed by retrying — a local
   * configuration error is re-read identically on every attempt, so scheduling
   * retries would only keep the row in `retry_wait` until the budget runs out.
   */
  markDead(id: string, error: string, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE outbox
         SET attempts=attempts+1, status='dead',
             lease_owner=NULL, lease_until=NULL,
             last_error=@error, updated_at=@now
         WHERE id=@id`
      )
      .run({ id, error: error.slice(0, 1000), now });
  }

  /** Schedule a later retry, or flip to dead once attempts are exhausted. */
  markRetry(
    id: string,
    nextAt: number,
    error: string,
    now: number = Date.now()
  ): OutboxStatus {
    const row = this.get(id);
    if (!row) return 'dead';
    const attempts = row.attempts + 1;
    const dead = attempts >= row.maxAttempts;
    this.db
      .prepare(
        `UPDATE outbox
         SET attempts=@attempts,
             status=@status,
             next_attempt_at=@nextAt,
             lease_owner=NULL, lease_until=NULL,
             last_error=@error, updated_at=@now
         WHERE id=@id`
      )
      .run({
        id,
        attempts,
        status: dead ? 'dead' : 'retry_wait',
        nextAt: dead ? row.nextAttemptAt : nextAt,
        error: error.slice(0, 1000),
        now,
      });
    return dead ? 'dead' : 'retry_wait';
  }

  /** Release a processing row back to pending without counting a retry. */
  release(id: string, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE outbox SET status='pending', lease_owner=NULL, lease_until=NULL,
                 next_attempt_at=@now, updated_at=@now WHERE id=@id AND status='processing'`
      )
      .run({ id, now });
  }

  /** Reopen a dead row for one more attempt (operator / reconcile action). */
  requeue(id: string, dueAt: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE outbox SET status='retry_wait', next_attempt_at=@dueAt, attempts=0,
                 last_error=NULL, lease_owner=NULL, lease_until=NULL,
                 completed_at=NULL, updated_at=@dueAt WHERE id=@id`
      )
      .run({ id, dueAt });
  }

  /**
   * Re-arm a row whose work was NOT actually settled (delivery intent still
   * owed) but whose outbox row reached a TERMINAL state — dead after its retry
   * budget, or cancelled by an operator.
   *
   * This is what makes the retry contract hold per delivery target: re-running a
   * work whose second platform dead-lettered must retry THAT platform (and only
   * it), not leave it permanently dead behind a "has an outbox row already"
   * conflict. The fresh attempt budget is deliberate: a new explicit attempt is
   * a new chance to converge, unlike `markRetry` which spends the old budget.
   *
   * Returns true when the row was terminal and has been reopened.
   */
  revive(id: string, now: number = Date.now()): boolean {
    const result = this.db
      .prepare(
        `UPDATE outbox SET status='pending', attempts=0, next_attempt_at=@now,
                 last_error=NULL, lease_owner=NULL, lease_until=NULL,
                 completed_at=NULL, updated_at=@now
         WHERE id=@id AND status IN ('dead','cancelled')`
      )
      .run({ id, now });
    return result.changes === 1;
  }

  cancel(id: string, now: number = Date.now()): boolean {
    const result = this.db.prepare(
      `UPDATE outbox SET status='cancelled', lease_owner=NULL, lease_until=NULL,
              last_error='cancelled by operator', completed_at=@now, updated_at=@now
       WHERE id=@id AND status IN ('pending','retry_wait','dead')`
    ).run({ id, now });
    return result.changes === 1;
  }

  counts(now: number = Date.now()): {
    pending: number;
    retryWait: number;
    processing: number;
    dead: number;
    done24h: number;
    oldestPendingMs: number | null;
  } {
    const one = (sql: string, ...params: unknown[]) =>
      (this.db.prepare(sql).get(...params) as { n: number }).n;
    const pending = one(`SELECT COUNT(*) n FROM outbox WHERE status IN ('pending','retry_wait')`);
    const retryWait = one(`SELECT COUNT(*) n FROM outbox WHERE status='retry_wait'`);
    const processing = one(`SELECT COUNT(*) n FROM outbox WHERE status='processing'`);
    const dead = one(`SELECT COUNT(*) n FROM outbox WHERE status='dead'`);
    const done24h = one(`SELECT COUNT(*) n FROM outbox WHERE status='done' AND completed_at >= ?`, now - 86_400_000);
    const oldest = this.db
      .prepare(`SELECT MIN(next_attempt_at) t FROM outbox WHERE status IN ('pending','retry_wait')`)
      .get() as { t: number | null };
    return {
      pending,
      retryWait,
      processing,
      dead,
      done24h,
      oldestPendingMs: oldest.t == null ? null : Math.max(0, now - oldest.t),
    };
  }

  /** Rows still non-terminal (used by reconcile/doctor). */
  staleProcessing(now: number = Date.now()): OutboxRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM outbox WHERE status='processing' AND lease_until IS NOT NULL AND lease_until <= ?`)
      .all(now) as any[];
    return rows.map((r) => this.toRow(r));
  }

  // --- delivery_events (durable audit log) ---

  /**
   * Append one audit event. Append-only; the event stream is the source for
   * `runs show` and incident reconstruction.
   *
   * ponytail: unbounded append — no DB-table pruner exists yet (MaintainCommand
   * prunes log files/cache, not tables). When a retention knob is added, hook a
   * `DELETE FROM delivery_events WHERE ts < ?` there (same age constant).
   */
  recordEvent(input: RecordEventInput, now: number = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO delivery_events
           (ts, delivery_id, outbox_id, execution_id, slot_id, pixiv_id, delivery_target,
            event, error_class, retryable, counts_as_attempt, actor, detail)
         VALUES
           (@ts, @deliveryId, @outboxId, @executionId, @slotId, @pixivId, @deliveryTarget,
            @event, @errorClass, @retryable, @countsAsAttempt, @actor, @detail)`
      )
      .run({
        ts: now,
        deliveryId: input.deliveryId ?? null,
        outboxId: input.outboxId ?? null,
        executionId: input.executionId ?? null,
        slotId: input.slotId ?? null,
        pixivId: input.pixivId ?? null,
        deliveryTarget: input.deliveryTarget ?? null,
        event: input.event,
        errorClass: input.errorClass ?? null,
        retryable: input.retryable === undefined || input.retryable === null ? null : input.retryable ? 1 : 0,
        countsAsAttempt: input.countsAsAttempt ?? 0,
        actor: input.actor ?? null,
        detail: input.detail ? JSON.stringify(input.detail) : null,
      });
  }

  // --- job event stream (Workflow Protocol v1 §events) ---
  //
  // The protocol event stream is a PROJECTION of this same durable log: no
  // second event table, no second queue. `slot_id` is the job id, `event` is the
  // internal kind, `ts` is the protocol `at`. Writers below guarantee the
  // once-only and monotonic properties the protocol requires.

  /**
   * Append one job-lifecycle event at most once.
   *
   * Idempotent by construction: a single `INSERT ... SELECT ... WHERE NOT
   * EXISTS` statement, so two callers cannot race a duplicate into the log, and
   * no UNIQUE index is needed (an index over historical duplicate rows would
   * brick the migration instead of reporting them).
   */
  recordSlotEventOnce(input: SlotEventInput, now: number = Date.now()): SlotEventWrite {
    // `at` is never allowed to move backwards: the page is ordered by `at` and
    // `next_after` is a row position, so ascending timestamps and ascending ids
    // must agree.
    const ts = Math.max(input.at ?? now, this.newestSlotEventTs(input.slotId) ?? 0);
    const info = this.db
      .prepare(
        `INSERT INTO delivery_events
           (ts, slot_id, delivery_target, event, counts_as_attempt, actor, detail)
         SELECT @ts, @slotId, @deliveryTarget, @event, 0, NULL, @detail
         WHERE NOT EXISTS (
           SELECT 1 FROM delivery_events WHERE slot_id = @slotId AND event = @event
         )`
      )
      .run({
        ts,
        slotId: input.slotId,
        deliveryTarget: input.deliveryTarget ?? null,
        event: input.event,
        detail: input.detail ? JSON.stringify(input.detail) : null,
      });
    const event = this.slotEvent(input.slotId, input.event);
    if (!event) throw new Error(`job event ${input.event} for ${input.slotId} was not persisted`);
    return { inserted: info.changes > 0, event };
  }

  /** Newest recorded `ts` for a slot; null when the slot has no events yet. */
  newestSlotEventTs(slotId: string): number | null {
    const row = this.db
      .prepare('SELECT MAX(ts) AS ts FROM delivery_events WHERE slot_id = ?')
      .get(slotId) as { ts: number | null } | undefined;
    return row?.ts ?? null;
  }

  /** Newest row of one internal kind for a slot. */
  slotEvent(slotId: string, event: string): DeliveryEvent | null {
    const row = this.db
      .prepare('SELECT * FROM delivery_events WHERE slot_id = ? AND event = ? ORDER BY ts DESC, id DESC LIMIT 1')
      .get(slotId, event) as any;
    return row ? this.toEvent(row) : null;
  }

  /** One row by its durable `(slot_id, id)` identity — the ack resolver. */
  slotEventById(slotId: string, id: number): DeliveryEvent | null {
    const row = this.db
      .prepare('SELECT * FROM delivery_events WHERE slot_id = ? AND id = ?')
      .get(slotId, id) as any;
    return row ? this.toEvent(row) : null;
  }

  /** A job's events of the given internal kinds, oldest first (ascending `at`). */
  listSlotEvents(
    slotId: string,
    kinds: readonly string[],
    after: EventCursorPosition | null = null,
    limit = 200
  ): DeliveryEvent[] {
    if (kinds.length === 0) return [];
    const { where, params } = this.jobEventFilter(slotId, kinds, after);
    const rows = this.db
      .prepare(`SELECT * FROM delivery_events WHERE ${where} ORDER BY ts ASC, id ASC LIMIT ?`)
      .all(...params, Math.max(1, Math.min(limit, 500))) as any[];
    return rows.map((r) => this.toEvent(r));
  }

  /** How many of a job's events sit strictly after a cursor position. */
  countSlotEvents(
    slotId: string,
    kinds: readonly string[],
    after: EventCursorPosition | null = null
  ): number {
    if (kinds.length === 0) return 0;
    const { where, params } = this.jobEventFilter(slotId, kinds, after);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM delivery_events WHERE ${where}`)
      .get(...params) as { n: number };
    return row.n;
  }

  /**
   * Slots that declared a callback_url but whose terminal event is not durable
   * yet. This is the sweep behind "a callback is never silently dropped": it is
   * driven from durable rows only, so a crash between "job terminal" and
   * "callback enqueued" is repaired, and it converges (each pass either writes
   * the terminal event or the job is not terminal yet).
   */
  slotsAwaitingTerminalEvent(terminalKinds: readonly string[], limit = 50): string[] {
    if (terminalKinds.length === 0) return [];
    const placeholders = terminalKinds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT e.slot_id AS slot_id
           FROM delivery_events e
          WHERE e.event = 'job.requested'
            AND e.delivery_target IS NOT NULL
            AND e.slot_id IS NOT NULL
            AND NOT EXISTS (
                  SELECT 1 FROM delivery_events t
                   WHERE t.slot_id = e.slot_id AND t.event IN (${placeholders})
                )
          GROUP BY e.slot_id
          ORDER BY MAX(e.ts) DESC
          LIMIT ?`
      )
      .all(...terminalKinds, Math.max(1, Math.min(limit, 500))) as any[];
    return rows.map((r) => r.slot_id as string);
  }

  /** The consumer's durable ack cursor for a job, or null when never acked. */
  jobEventCursor(jobId: string): JobEventCursor | null {
    const row = this.db.prepare('SELECT * FROM job_event_cursors WHERE job_id = ?').get(jobId) as any;
    return row ? this.toCursor(row) : null;
  }

  /**
   * Advance a job's ack cursor. Monotonic and idempotent: a position that is not
   * strictly ahead of the stored one is a no-op and the stored position is
   * returned unchanged. This only records what the consumer attests it has
   * durably stored — it never touches the slot ledger.
   */
  advanceJobEventCursor(
    jobId: string,
    position: EventCursorPosition,
    now: number = Date.now()
  ): JobEventCursor {
    this.db
      .prepare(
        `INSERT INTO job_event_cursors (job_id, acked_at, acked_row_id, updated_at)
         VALUES (@jobId, @at, @rowId, @now)
         ON CONFLICT(job_id) DO UPDATE SET
           acked_at = @at,
           acked_row_id = @rowId,
           updated_at = @now
         WHERE @at > acked_at OR (@at = acked_at AND @rowId > acked_row_id)`
      )
      .run({ jobId, at: position.at, rowId: position.rowId, now });
    return this.jobEventCursor(jobId)!;
  }

  private jobEventFilter(
    slotId: string,
    kinds: readonly string[],
    after: EventCursorPosition | null
  ): { where: string; params: unknown[] } {
    const placeholders = kinds.map(() => '?').join(', ');
    const clauses = ['slot_id = ?', `event IN (${placeholders})`];
    const params: unknown[] = [slotId, ...kinds];
    if (after) {
      clauses.push('(ts > ? OR (ts = ? AND id > ?))');
      params.push(after.at, after.at, after.rowId);
    }
    return { where: clauses.join(' AND '), params };
  }

  private toCursor(row: any): JobEventCursor {
    return { jobId: row.job_id, at: row.acked_at, rowId: row.acked_row_id, updatedAt: row.updated_at };
  }

  listEvents(filter: { executionId?: string; outboxId?: string; limit?: number } = {}): DeliveryEvent[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.executionId) { clauses.push('execution_id = ?'); params.push(filter.executionId); }
    if (filter.outboxId) { clauses.push('outbox_id = ?'); params.push(filter.outboxId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
    const rows = this.db
      .prepare(`SELECT * FROM delivery_events ${where} ORDER BY ts DESC, id DESC LIMIT ?`)
      .all(...params, limit) as any[];
    return rows.map((r) => this.toEvent(r));
  }

  /** Most recent recorded event for an outbox row (used to rate-limit defers). */
  lastEvent(outboxId: string, event?: string): DeliveryEvent | null {
    const row = event
      ? this.db
          .prepare(`SELECT * FROM delivery_events WHERE outbox_id = ? AND event = ? ORDER BY ts DESC, id DESC LIMIT 1`)
          .get(outboxId, event)
      : this.db
          .prepare(`SELECT * FROM delivery_events WHERE outbox_id = ? ORDER BY ts DESC, id DESC LIMIT 1`)
          .get(outboxId);
    return row ? this.toEvent(row) : null;
  }

  /**
   * Compact read model for one scheduler occurrence. Assembled purely from
   * existing tables + delivery_events; unavailable facts stay null rather than
   * being fabricated.
   */
  executionSummary(executionId: string): Record<string, unknown> {
    const slot = this.db
      .prepare(`SELECT * FROM schedule_slots WHERE id = ?`)
      .get(executionId) as
      | { schedule_id: string; status: string; started_at: string | null; completed_at: string | null }
      | undefined;
    const cells = this.db
      .prepare(`SELECT target_id, work_id, work_type, status, last_error FROM schedule_slot_items WHERE slot_id = ?`)
      .all(executionId) as Array<{
      target_id: string; work_id: string | null; work_type: string | null;
      status: string; last_error: string | null;
    }>;

    const selected = cells.filter((c) => c.work_id).length;
    const none = cells
      .filter((c) => c.status === 'no_candidate')
      .map((c) => ({ target: c.target_id, reason: c.last_error ?? 'no_candidate' }));
    const failedTargets = cells
      .filter((c) => c.status === 'failed')
      .map((c) => ({ target: c.target_id, reason: c.last_error ?? 'failed' }));

    const workIds = [...new Set(cells.map((c) => c.work_id).filter((v): v is string => Boolean(v)))];
    const downloads = workIds.map((pixivId) => {
      const rows = this.db
        .prepare(`SELECT type, COUNT(*) AS files FROM downloads WHERE pixiv_id = ? GROUP BY type`)
        .all(pixivId) as Array<{ type: string; files: number }>;
      return {
        pixivId,
        workType: cells.find((c) => c.work_id === pixivId)?.work_type ?? rows[0]?.type ?? null,
        files: rows.reduce((n, r) => n + r.files, 0),
        bytes: null, // not stored in the downloads schema; do not invent it
      };
    });

    const deliveries = this.db
      .prepare(
        `SELECT delivery_target, pixiv_id, status, attempts, remote_status, remote_id
         FROM deliveries WHERE slot_id = ? ORDER BY created_at ASC`
      )
      .all(executionId) as Array<{
      delivery_target: string; pixiv_id: string; status: string; attempts: number;
      remote_status: string | null; remote_id: string | null;
    }>;

    // media fallback facts are not a table today; derive them from recorded
    // media.fallback events only (originals/previews counts stay null).
    const media = deliveries.map((d) => {
      const fallbacks = this.db
        .prepare(
          `SELECT detail FROM delivery_events
           WHERE event = 'media.fallback' AND pixiv_id = ? AND delivery_target = ?
           ORDER BY ts DESC`
        )
        .all(d.pixiv_id, d.delivery_target) as Array<{ detail: string | null }>;
      const reasons = fallbacks
        .map((f) => {
          try { return f.detail ? (JSON.parse(f.detail) as { reason?: string }).reason : undefined; }
          catch { return undefined; }
        })
        .filter((r): r is string => Boolean(r));
      return { pixivId: d.pixiv_id, originals: null, previews: null, documentFallback: reasons.length > 0, reasons };
    });

    const tail = this.db
      .prepare(
        `SELECT event, error_class, ts FROM delivery_events
         WHERE execution_id = ? AND event != 'execution.summary'
         ORDER BY ts DESC, id DESC LIMIT 8`
      )
      .all(executionId) as Array<{ event: string; error_class: string | null; ts: number }>;

    const status = (() => {
      switch (slot?.status) {
        case 'success': return 'completed';
        case 'partial': return 'partial';
        case 'failed': return 'failed';
        default:
          if (failedTargets.length > 0) return 'failed';
          if (none.length > 0) return 'partial';
          return slot?.status ?? null;
      }
    })();

    const warnings: string[] = [];
    for (const n of none) warnings.push(`no_candidate: ${n.target} (${n.reason})`);
    for (const f of failedTargets) warnings.push(`failed: ${f.target} (${f.reason})`);

    let durationMs: number | null = null;
    if (slot?.started_at && slot.completed_at) {
      durationMs = Math.max(0, new Date(slot.completed_at).getTime() - new Date(slot.started_at).getTime());
    }

    return {
      executionId,
      scheduleId: slot?.schedule_id ?? null,
      slotId: executionId,
      status,
      candidates: { selected, none },
      downloads,
      media,
      deliveries: deliveries.map((d) => ({
        target: d.delivery_target,
        pixivId: d.pixiv_id,
        status: d.status,
        attempts: d.attempts,
        remoteStatus: d.remote_status,
        reviewId: d.remote_id,
      })),
      outboxEventsTail: tail.map((e) => ({ event: e.event, errorClass: e.error_class, ts: e.ts })),
      warnings,
      durationMs,
    };
  }

  /** True when an execution.summary event for this occurrence was already stored. */
  hasExecutionSummary(executionId: string): boolean {
    return Boolean(
      this.db
        .prepare(`SELECT 1 FROM delivery_events WHERE execution_id = ? AND event = 'execution.summary' LIMIT 1`)
        .get(executionId)
    );
  }

  private toEvent(row: any): DeliveryEvent {
    return {
      id: row.id,
      ts: row.ts,
      deliveryId: row.delivery_id,
      outboxId: row.outbox_id,
      executionId: row.execution_id,
      slotId: row.slot_id,
      pixivId: row.pixiv_id,
      deliveryTarget: row.delivery_target,
      event: row.event,
      errorClass: row.error_class,
      retryable: row.retryable,
      countsAsAttempt: row.counts_as_attempt,
      actor: row.actor,
      detail: row.detail,
    };
  }

  private toRow(row: any): OutboxRow {
    return {
      id: row.id,
      kind: row.kind,
      idempotencyKey: row.idempotency_key,
      deliveryId: row.delivery_id,
      deliveryTarget: row.delivery_target,
      payloadJson: row.payload_json,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at,
      leaseOwner: row.lease_owner,
      leaseUntil: row.lease_until,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}
