import { BaseRepository } from './BaseRepository';

export type SlotStatus = 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'expired';
export type CellStatus = 'pending' | 'selected' | 'submitted' | 'no_candidate' | 'failed';

export interface SlotRecord {
  id: string;
  slotDate: string;
  slotName: string;
  scheduleId: string;
  status: SlotStatus;
  triggerSource: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

export interface SlotItemRecord {
  id: number;
  slotId: string;
  targetId: string;
  workId: string | null;
  workType: string | null;
  status: CellStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/**
 * Durable ledger for Schedule Slots and their per-target cells.
 *
 * A slot is one business batch (e.g. `2026-09-08:morning`). Each enabled target
 * owns exactly one cell in a slot, enforced by UNIQUE(slot_id, target_id). This
 * is the business-level idempotency layer above TelePost's work-level
 * idempotency: duplicate triggers / restarts / outbox replays all converge on
 * the same row instead of emitting a second work for the same slot/target.
 */
export class SlotRepository extends BaseRepository {
  /**
   * Fetch an existing slot or create it. Returns the row plus `created:false`
   * when a slot with this id already existed (the caller should resume it, not
   * start a fresh run).
   */
  public getOrCreateSlot(
    id: string,
    data: { slotDate: string; slotName: string; scheduleId: string; triggerSource?: string }
  ): { slot: SlotRecord; created: boolean } {
    const insert = this.db.prepare(
      `INSERT INTO schedule_slots (id, slot_date, slot_name, schedule_id, status, trigger_source)
       VALUES (@id, @slotDate, @slotName, @scheduleId, 'pending', @triggerSource)
       ON CONFLICT(id) DO NOTHING`
    );
    const info = insert.run({
      id,
      slotDate: data.slotDate,
      slotName: data.slotName,
      scheduleId: data.scheduleId,
      triggerSource: data.triggerSource ?? null,
    });
    const created = info.changes > 0;
    return { slot: this.getSlot(id)!, created };
  }

  public getSlot(id: string): SlotRecord | null {
    const row = this.db.prepare(`SELECT * FROM schedule_slots WHERE id = ?`).get(id) as any;
    return row ? this.toSlot(row) : null;
  }

  public getSlotsForDate(slotDate: string): SlotRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM schedule_slots WHERE slot_date = ? ORDER BY id ASC`)
      .all(slotDate) as any[];
    return rows.map((r) => this.toSlot(r));
  }

  public getRecentSlots(limit = 14): SlotRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM schedule_slots ORDER BY id DESC LIMIT ?`)
      .all(limit) as any[];
    return rows.map((r) => this.toSlot(r));
  }

  public markSlotStatus(id: string, status: SlotStatus, error?: string): void {
    const stamp = status === 'running' ? 'started_at' : status === 'success' || status === 'partial' || status === 'failed' ? 'completed_at' : null;
    const sets = ['status = @status', 'last_error = @error'];
    if (stamp === 'started_at') sets.push('started_at = CURRENT_TIMESTAMP');
    if (stamp === 'completed_at') sets.push('completed_at = CURRENT_TIMESTAMP');
    this.db
      .prepare(`UPDATE schedule_slots SET ${sets.join(', ')} WHERE id = @id`)
      .run({ id, status, error: error ?? null });
  }

  /** All cells for a slot (one per target). */
  public getCells(slotId: string): SlotItemRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM schedule_slot_items WHERE slot_id = ? ORDER BY target_id ASC`)
      .all(slotId) as any[];
    return rows.map((r) => this.toItem(r));
  }

  public getCell(slotId: string, targetId: string): SlotItemRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM schedule_slot_items WHERE slot_id = ? AND target_id = ?`)
      .get(slotId, targetId) as any;
    return row ? this.toItem(row) : null;
  }

  /** Create the cell row if it does not exist (idempotent). */
  public ensureCell(slotId: string, targetId: string, workType: string): SlotItemRecord {
    this.db
      .prepare(
        `INSERT INTO schedule_slot_items (slot_id, target_id, work_type, status)
         VALUES (@slotId, @targetId, @workType, 'pending')
         ON CONFLICT(slot_id, target_id) DO NOTHING`
      )
      .run({ slotId, targetId, workType });
    return this.getCell(slotId, targetId)!;
  }

  /**
   * Lock the selected work for a cell. The first selection wins; later calls
   * (automatic retries, outbox replay, duplicate triggers) never overwrite it —
   * candidate replacement is a separate explicit operator action (clearCellWork).
   */
  public lockCellWork(slotId: string, targetId: string, workId: string, workType: string): SlotItemRecord {
    this.db
      .prepare(
        `UPDATE schedule_slot_items
         SET work_id = COALESCE(work_id, @workId),
             work_type = CASE WHEN work_id IS NULL THEN @workType ELSE work_type END,
             status = CASE WHEN status = 'pending' THEN 'selected' ELSE status END,
             attempt_count = attempt_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE slot_id = @slotId AND target_id = @targetId`
      )
      .run({ slotId, targetId, workId, workType });
    return this.getCell(slotId, targetId)!;
  }

  /** Explicit operator action: forget the locked work so a re-run picks another candidate. */
  public clearCellWork(slotId: string, targetId: string): void {
    this.db
      .prepare(
        `UPDATE schedule_slot_items
         SET work_id = NULL, status = 'pending', last_error = NULL,
             completed_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE slot_id = @slotId AND target_id = @targetId`
      )
      .run({ slotId, targetId });
  }

  public setCellStatus(slotId: string, targetId: string, status: CellStatus, error?: string): void {
    const terminal = status === 'submitted' || status === 'no_candidate' || status === 'failed';
    const sets = ['status = @status', 'last_error = @error', 'updated_at = CURRENT_TIMESTAMP'];
    if (terminal) sets.push('completed_at = CURRENT_TIMESTAMP');
    this.db
      .prepare(`UPDATE schedule_slot_items SET ${sets.join(', ')} WHERE slot_id = @slotId AND target_id = @targetId`)
      .run({ slotId, targetId, status, error: error ?? null });
  }

  /** Work ids already locked in THIS slot (to stop two cells taking the same work). */
  public getLockedWorkIds(slotId: string): Set<string> {
    const rows = this.db
      .prepare(`SELECT work_id FROM schedule_slot_items WHERE slot_id = ? AND work_id IS NOT NULL`)
      .all(slotId) as Array<{ work_id: string }>;
    return new Set(rows.map((r) => r.work_id));
  }

  /** Roll up a slot's status from its cells. */
  public deriveSlotStatus(slotId: string): SlotStatus {
    const cells = this.getCells(slotId);
    if (cells.length === 0) return 'pending';
    const terminal = cells.filter((c) => c.status === 'submitted' || c.status === 'no_candidate' || c.status === 'failed');
    if (terminal.length < cells.length) return 'running';
    if (cells.every((c) => c.status === 'submitted')) return 'success';
    if (cells.some((c) => c.status === 'submitted')) return 'partial';
    return 'failed';
  }

  private toSlot(row: any): SlotRecord {
    return {
      id: row.id,
      slotDate: row.slot_date,
      slotName: row.slot_name,
      scheduleId: row.schedule_id,
      status: row.status,
      triggerSource: row.trigger_source,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastError: row.last_error,
    };
  }

  private toItem(row: any): SlotItemRecord {
    return {
      id: row.id,
      slotId: row.slot_id,
      targetId: row.target_id,
      workId: row.work_id,
      workType: row.work_type,
      status: row.status,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}
