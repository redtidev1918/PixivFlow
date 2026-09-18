import { BaseRepository } from './BaseRepository';

export type CandidateInventoryStatus = 'pending' | 'selected' | 'submitted' | 'filtered' | 'expired';

export interface CandidateInventoryRow {
  pixivId: string;
  workType: 'illustration' | 'novel';
  topic: string;
  targetId: string;
  status: CandidateInventoryStatus;
  snapshotJson: string;
  firstSeenDate: string;
  lastSeenDate: string;
  seenCount: number;
  attemptCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateInventorySnapshot {
  pixivId: string;
  workType: 'illustration' | 'novel';
  topic: string;
  targetId: string;
  snapshot: unknown;
  date: string;
  maxAgeDays: number;
}

/** Phase 5 durable 待发池 — same SQLite database as the Slot Ledger. */
export class CandidateInventoryRepository extends BaseRepository {
  public upsert(input: CandidateInventorySnapshot): void {
    const expiresAt = this.addDaysUtc(input.date, input.maxAgeDays);
    this.db
      .prepare(
        `INSERT INTO candidate_inventory
           (pixiv_id, work_type, topic, target_id, status, snapshot_json,
            first_seen_date, last_seen_date, seen_count, attempt_count, expires_at)
         VALUES
           (@pixivId, @workType, @topic, @targetId, 'pending', @snapshot,
            @date, @date, 1, 0, @expiresAt)
         ON CONFLICT(pixiv_id, work_type, topic, target_id) DO UPDATE SET
           snapshot_json = excluded.snapshot_json,
           last_seen_date = excluded.last_seen_date,
           seen_count = candidate_inventory.seen_count + 1,
           status = CASE
             WHEN candidate_inventory.status IN ('selected','submitted','filtered','expired')
                  THEN candidate_inventory.status
             ELSE 'pending'
           END,
           expires_at = excluded.expires_at,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run({
        pixivId: input.pixivId,
        workType: input.workType,
        topic: input.topic,
        targetId: input.targetId,
        snapshot: JSON.stringify(input.snapshot),
        date: input.date,
        expiresAt,
      });
  }

  /** Marks a claimed candidate and returns its snapshot for the pipeline. */
  public claimNext(input: {
    topic: string;
    targetId: string;
    reserveSize: number;
    date: string;
  }): CandidateInventoryRow | null {
    const rows = this.db
      .prepare(
        `SELECT * FROM candidate_inventory
         WHERE topic = ? AND target_id = ?
           AND status = 'pending'
           AND expires_at >= ?
         ORDER BY first_seen_date ASC, seen_count ASC
         LIMIT ?`
      )
      .all(input.topic, input.targetId, this.addDaysUtc(input.date, 0), input.reserveSize) as any[];
    for (const row of rows) {
      const updated = this.db
        .prepare(
          `UPDATE candidate_inventory
           SET status = 'selected', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
           WHERE pixiv_id = ? AND work_type = ? AND topic = ? AND target_id = ? AND status = 'pending'`
        )
        .run(row.pixiv_id, row.work_type, row.topic, row.target_id);
      if (updated.changes > 0) return this.toRow(row);
    }
    return null;
  }

  public markSubmitted(pixivId: string, workType: string, topic: string, targetId: string): void {
    this.db
      .prepare(
        `UPDATE candidate_inventory
         SET status = 'submitted', updated_at = CURRENT_TIMESTAMP
         WHERE pixiv_id = ? AND work_type = ? AND topic = ? AND target_id = ?`
      )
      .run(pixivId, workType, topic, targetId);
  }

  public markFiltered(pixivId: string, workType: string, topic: string, targetId: string): void {
    this.db
      .prepare(
        `UPDATE candidate_inventory
         SET status = 'filtered', updated_at = CURRENT_TIMESTAMP
         WHERE pixiv_id = ? AND work_type = ? AND topic = ? AND target_id = ?`
      )
      .run(pixivId, workType, topic, targetId);
  }

  public markSelectedBackToPending(pixivId: string, workType: string, topic: string, targetId: string): void {
    this.db
      .prepare(
        `UPDATE candidate_inventory
         SET status = 'pending', updated_at = CURRENT_TIMESTAMP
         WHERE pixiv_id = ? AND work_type = ? AND topic = ? AND target_id = ? AND status = 'selected'`
      )
      .run(pixivId, workType, topic, targetId);
  }

  public countPending(topic: string, targetId: string): number {
    const rows = this.db
      .prepare(`SELECT COUNT(*) AS n FROM candidate_inventory WHERE topic = ? AND target_id = ? AND status = 'pending' AND expires_at >= ?`)
      .get(topic, targetId, this.todayUtc()) as any;
    return Number(rows?.n ?? 0);
  }

  public pendingSummary(topic: string, targetId: string): { count: number; oldestSeenDate: string | null } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n, MIN(first_seen_date) AS oldest
         FROM candidate_inventory
         WHERE topic = ? AND target_id = ? AND status = 'pending' AND expires_at >= ?`
      )
      .get(topic, targetId, this.todayUtc()) as any;
    return { count: Number(row?.n ?? 0), oldestSeenDate: row?.oldest ?? null };
  }

  /** Sweep rows past maxAgeDays; idempotent per scheduled scan. */
  public evictExpired(topic: string, targetId: string): number {
    const info = this.db
      .prepare(
        `UPDATE candidate_inventory
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE topic = ? AND target_id = ? AND status IN ('pending','selected') AND expires_at < ?`
      )
      .run(topic, targetId, this.todayUtc());
    return info.changes;
  }

  private toRow(row: any): CandidateInventoryRow {
    return {
      pixivId: String(row.pixiv_id),
      workType: row.work_type,
      topic: row.topic,
      targetId: row.target_id,
      status: row.status,
      snapshotJson: row.snapshot_json,
      firstSeenDate: row.first_seen_date,
      lastSeenDate: row.last_seen_date,
      seenCount: Number(row.seen_count ?? 1),
      attemptCount: Number(row.attempt_count ?? 0),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private addDaysUtc(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
