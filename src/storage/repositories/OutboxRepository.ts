import { randomUUID } from 'node:crypto';
import { BaseRepository } from './BaseRepository';

export type OutboxKind = 'delivery' | 'notification';
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
      return this.getByKey(input.kind, input.idempotencyKey)!;
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
