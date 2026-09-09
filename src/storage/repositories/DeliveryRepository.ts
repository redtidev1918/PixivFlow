import { BaseRepository } from './BaseRepository';

export type DeliveryStatus = 'pending' | 'delivered' | 'duplicate' | 'failed';

export interface DeliveryRow {
  id: string;
  deliveryTarget: string;
  workType: string;
  pixivId: string;
  slotId: string | null;
  targetId: string | null;
  idempotencyKey: string;
  status: DeliveryStatus;
  remoteId: string | null;
  remoteStatus: string | null;
  reuseReason: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
}

export interface NewDelivery {
  id: string;
  deliveryTarget: string;
  workType: string;
  pixivId: string;
  slotId?: string | null;
  targetId?: string | null;
  idempotencyKey: string;
}

/**
 * The delivery ledger. Answers "has this work actually been CONFIRMED delivered
 * to this target?" — distinct from the downloads table ("was the file cached
 * locally?"). downloaded != delivered.
 *
 * Dedup scope is (delivery_target, work_type, pixiv_id): bot1 having posted a
 * work does not forbid bot2 posting it.
 */
export class DeliveryRepository extends BaseRepository {
  /** Insert a pending intent. No-op if the idempotency key already exists. */
  insertIntent(input: NewDelivery): { row: DeliveryRow; created: boolean } {
    const info = this.db
      .prepare(
        `INSERT INTO deliveries
           (id, delivery_target, work_type, pixiv_id, slot_id, target_id, idempotency_key, status)
         VALUES
           (@id, @deliveryTarget, @workType, @pixivId, @slotId, @targetId, @idempotencyKey, 'pending')
         ON CONFLICT(idempotency_key) DO NOTHING`
      )
      .run({
        id: input.id,
        deliveryTarget: input.deliveryTarget,
        workType: input.workType,
        pixivId: input.pixivId,
        slotId: input.slotId ?? null,
        targetId: input.targetId ?? null,
        idempotencyKey: input.idempotencyKey,
      });
    const created = info.changes > 0;
    return { row: created ? this.getById(input.id)! : this.getByIdempotencyKey(input.idempotencyKey)!, created };
  }

  getById(id: string): DeliveryRow | null {
    const row = this.db.prepare(`SELECT * FROM deliveries WHERE id = ?`).get(id) as any;
    return row ? this.toRow(row) : null;
  }

  getByIdempotencyKey(key: string): DeliveryRow | null {
    const row = this.db.prepare(`SELECT * FROM deliveries WHERE idempotency_key = ?`).get(key) as any;
    return row ? this.toRow(row) : null;
  }

  /**
   * True when this exact work is already CONFIRMED (delivered, or an attested
   * historical duplicate) for this target. Pending/failed intents do not block
   * selection — they are retried, not treated as a delivered fact.
   */
  isDelivered(deliveryTarget: string, workType: string, pixivId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM deliveries
         WHERE delivery_target = ? AND work_type = ? AND pixiv_id = ?
           AND status IN ('delivered','duplicate')
         LIMIT 1`
      )
      .get(deliveryTarget, workType, String(pixivId));
    return Boolean(row);
  }

  /** Batch form for candidate-pipeline pre-lock dedupe. */
  deliveredIds(deliveryTarget: string, workType: string, pixivIds: string[]): Set<string> {
    const out = new Set<string>();
    if (pixivIds.length === 0) return out;
    const CHUNK = 400;
    for (let i = 0; i < pixivIds.length; i += CHUNK) {
      const slice = pixivIds.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      const rows = this.db
        .prepare(
          `SELECT DISTINCT pixiv_id FROM deliveries
           WHERE delivery_target = ? AND work_type = ? AND status IN ('delivered','duplicate')
             AND pixiv_id IN (${placeholders})`
        )
        .all(deliveryTarget, workType, ...slice) as Array<{ pixiv_id: string }>;
      for (const r of rows) out.add(r.pixiv_id);
    }
    return out;
  }

  recordAck(
    id: string,
    ack: { status: DeliveryStatus; remoteId?: string; remoteStatus?: string; reuseReason?: string; error?: string }
  ): void {
    const terminal = ack.status === 'delivered' || ack.status === 'duplicate' || ack.status === 'failed';
    const sets = [
      'status = @status',
      'remote_id = COALESCE(@remoteId, remote_id)',
      'remote_status = @remoteStatus',
      'reuse_reason = @reuseReason',
      'last_error = @error',
      'attempts = attempts + 1',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    if (terminal) sets.push(`delivered_at = COALESCE(delivered_at, CASE WHEN @status IN ('delivered','duplicate') THEN CURRENT_TIMESTAMP ELSE NULL END)`);
    this.db
      .prepare(`UPDATE deliveries SET ${sets.join(', ')} WHERE id = @id`)
      .run({
        id,
        status: ack.status,
        remoteId: ack.remoteId ?? null,
        remoteStatus: ack.remoteStatus ?? null,
        reuseReason: ack.reuseReason ?? null,
        error: ack.error ?? null,
      });
  }

  /** Backfill a delivery fact discovered during downstream reconciliation. */
  backfill(input: NewDelivery & { remoteId?: string; remoteStatus?: string }): { row: DeliveryRow; created: boolean } {
    const { row, created } = this.insertIntent(input);
    if (created || row.status !== 'delivered') {
      this.recordAck(input.id, {
        status: 'delivered',
        remoteId: input.remoteId,
        remoteStatus: input.remoteStatus ?? 'reconciled',
      });
    }
    return { row: this.getById(input.id)!, created };
  }

  pending(limit = 200): DeliveryRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM deliveries WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`)
      .all(limit) as any[];
    return rows.map((r) => this.toRow(r));
  }

  countByStatus(): Record<DeliveryStatus, number> {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS n FROM deliveries GROUP BY status`)
      .all() as Array<{ status: DeliveryStatus; n: number }>;
    const out: Record<DeliveryStatus, number> = { pending: 0, delivered: 0, duplicate: 0, failed: 0 };
    for (const r of rows) out[r.status] = r.n;
    return out;
  }

  private toRow(row: any): DeliveryRow {
    return {
      id: row.id,
      deliveryTarget: row.delivery_target,
      workType: row.work_type,
      pixivId: row.pixiv_id,
      slotId: row.slot_id,
      targetId: row.target_id,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      remoteId: row.remote_id,
      remoteStatus: row.remote_status,
      reuseReason: row.reuse_reason,
      attempts: row.attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deliveredAt: row.delivered_at,
    };
  }
}
