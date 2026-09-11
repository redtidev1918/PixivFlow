import { BaseRepository } from './BaseRepository';

export type SlotStatus = 'pending' | 'running' | 'success' | 'partial' | 'failed' | 'expired';
export type CellStatus =
  | 'pending'
  | 'selected'
  | 'artifact_ready'
  | 'delivery_pending'
  | 'submitted'
  | 'no_candidate'
  | 'duplicate'
  | 'failed';

export interface SlotRecord {
  id: string;
  /** Schedule this occurrence belongs to (id is already schedule-scoped). */
  scheduleId: string;
  /** Canonical scheduled fire time (epoch ms, UTC); null for legacy rows. */
  occurrenceAt: number | null;
  /** Schedule date (YYYY-MM-DD) in the schedule timezone — display only. */
  occurrenceDate: string;
  /** Wall-clock time-of-day label in tz, e.g. "10:00" — display only. */
  occurrenceLabel: string;
  timezone: string;
  /** Materialized target membership snapshot (JSON array of target ids). */
  targetIds: string[];
  status: SlotStatus;
  triggerSource: string | null;
  // Legacy display columns retained for backward compatibility.
  slotDate: string;
  slotName: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseUntil: number | null;
  heartbeatAt: number | null;
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
   * Fetch an existing slot or create it. On creation the schedule's target
   * membership is snapshotted (target_ids); a later config reload never mutates
   * this occurrence. Returns `created:false` when the id already existed so the
   * caller resumes rather than restarting.
   */
  public getOrCreateSlot(
    id: string,
    data: {
      scheduleId: string;
      occurrenceAt?: number | null;
      occurrenceDate?: string;
      occurrenceLabel?: string;
      timezone?: string;
      targetIds: string[];
      triggerSource?: string;
      // Legacy display fields (optional).
      slotDate?: string;
      slotName?: string;
    }
  ): { slot: SlotRecord; created: boolean } {
    const insert = this.db.prepare(
      `INSERT INTO schedule_slots
         (id, schedule_id, occurrence_at, occurrence_date, occurrence_label, timezone, target_ids,
          status, trigger_source, slot_date, slot_name)
       VALUES
         (@id, @scheduleId, @occurrenceAt, @occurrenceDate, @occurrenceLabel, @timezone, @targetIds,
          'pending', @triggerSource, @slotDate, @slotName)
       ON CONFLICT(id) DO NOTHING`
    );
    const info = insert.run({
      id,
      scheduleId: data.scheduleId,
      occurrenceAt: data.occurrenceAt ?? null,
      occurrenceDate: data.occurrenceDate ?? '',
      occurrenceLabel: data.occurrenceLabel ?? '',
      timezone: data.timezone ?? 'UTC',
      targetIds: JSON.stringify(data.targetIds),
      triggerSource: data.triggerSource ?? null,
      slotDate: data.slotDate ?? data.occurrenceDate ?? '',
      slotName: data.slotName ?? '',
    });
    const created = info.changes > 0;
    return { slot: this.getSlot(id)!, created };
  }

  public getSlot(id: string): SlotRecord | null {
    const row = this.db.prepare(`SELECT * FROM schedule_slots WHERE id = ?`).get(id) as any;
    return row ? this.toSlot(row) : null;
  }

  /** Target ids materialized for a slot (stable membership; falls back to []). */
  public getSlotTargetIds(id: string): string[] {
    const row = this.db.prepare(`SELECT target_ids FROM schedule_slots WHERE id = ?`).get(id) as
      | { target_ids: string | null }
      | undefined;
    if (!row?.target_ids) return [];
    try {
      const parsed = JSON.parse(row.target_ids);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  public getRecentSlots(limit = 14): SlotRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM schedule_slots ORDER BY COALESCE(occurrence_at, 0) DESC, id DESC LIMIT ?`)
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

  /**
   * Ensure a cell exists for every target id in the slot's materialized
   * membership. The cell set is fixed at first materialization (the snapshot in
   * schedule_slots.target_ids); a config reload cannot add/remove cells here.
   * Returns the authoritative target ids for this occurrence.
   */
  public materializeCells(slotId: string, targetIds: string[], workTypeByTarget: (id: string) => string): string[] {
    // The frozen snapshot (schedule_slots.target_ids) is the authority for which
    // cells belong to this occurrence. Intersect with the requested ids so a
    // later config reload can never materialize a cell outside the snapshot.
    const snapshot = new Set(this.getSlotTargetIds(slotId));
    const authorized = snapshot.size > 0 ? targetIds.filter((id) => snapshot.has(id)) : targetIds;
    const insert = this.db.prepare(
      `INSERT INTO schedule_slot_items (slot_id, target_id, work_type, status)
       VALUES (@slotId, @targetId, @workType, 'pending')
       ON CONFLICT(slot_id, target_id) DO NOTHING`
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const targetId of ids) {
        insert.run({ slotId, targetId, workType: workTypeByTarget(targetId) || 'unknown' });
      }
    });
    tx(authorized);
    return authorized;
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
    const terminal =
      status === 'submitted' ||
      status === 'no_candidate' ||
      status === 'duplicate' ||
      status === 'failed';
    const sets = ['status = @status', 'last_error = @error', 'updated_at = CURRENT_TIMESTAMP'];
    if (terminal) sets.push('completed_at = CURRENT_TIMESTAMP');
    this.db
      .prepare(`UPDATE schedule_slot_items SET ${sets.join(', ')} WHERE slot_id = @slotId AND target_id = @targetId`)
      .run({ slotId, targetId, status, error: error ?? null });
  }

  /**
   * Transition a cell with FSM validation. Never downgrades a confirmed cell;
   * an illegal transition throws rather than silently corrupting state.
   */
  public transitionCell(
    slotId: string,
    targetId: string,
    next: CellStatus,
    error?: string
  ): SlotItemRecord {
    const cell = this.getCell(slotId, targetId);
    if (!cell) throw new Error(`cell not found: ${slotId}/${targetId}`);
    if (cell.status === next) return cell;
    // Imported lazily to keep the repository free of a circular module graph.
    // The FSM table is the single authority for legal moves.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { assertTransition } = require('../../scheduler/SlotStateMachine') as typeof import('../../scheduler/SlotStateMachine');
    assertTransition(cell.status as Parameters<typeof assertTransition>[0], next as Parameters<typeof assertTransition>[1]);
    this.setCellStatus(slotId, targetId, next, error);
    return this.getCell(slotId, targetId)!;
  }

  /**
   * Claim execution ownership of a slot for `owner` until `leaseUntil`
   * (epoch ms). Returns true when this caller now owns the lease. A second
   * process/trigger sees an active lease and must converge (resume/observe),
   * not start a parallel run. An expired lease is reclaimable.
   */
  public claimSlotLease(slotId: string, owner: string, leaseUntil: number, now: number = Date.now()): boolean {
    const info = this.db
      .prepare(
        `UPDATE schedule_slots
         SET lease_owner = @owner, lease_until = @leaseUntil, heartbeat_at = @now
         WHERE id = @id
           AND (lease_until IS NULL OR lease_until <= @now OR lease_owner = @owner)`
      )
      .run({ id: slotId, owner, leaseUntil, now });
    return info.changes > 0;
  }

  public heartbeatSlotLease(slotId: string, owner: string, leaseUntil: number, now: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE schedule_slots SET lease_until = @leaseUntil, heartbeat_at = @now
         WHERE id = @id AND lease_owner = @owner`
      )
      .run({ id: slotId, owner, leaseUntil, now });
  }

  public releaseSlotLease(slotId: string, owner: string): void {
    this.db
      .prepare(
        `UPDATE schedule_slots SET lease_owner = NULL, lease_until = NULL
         WHERE id = @id AND lease_owner = @owner`
      )
      .run({ id: slotId, owner });
  }

  public getSlotLease(slotId: string): { owner: string | null; until: number | null } {
    const row = this.db
      .prepare(`SELECT lease_owner, lease_until FROM schedule_slots WHERE id = ?`)
      .get(slotId) as { lease_owner: string | null; lease_until: number | null } | undefined;
    return { owner: row?.lease_owner ?? null, until: row?.lease_until ?? null };
  }

  /** Slots whose lease expired while still non-terminal (crashed workers). */
  public slotsWithStaleLease(now: number = Date.now()): string[] {
    return this.recoverableSlots(now)
      .filter((slot) => slot.leaseUntil !== null)
      .map((slot) => slot.id);
  }

  /**
   * Non-terminal slots no live worker currently owns, and which therefore should
   * be re-dispatched.
   *
   * Two distinct situations qualify, and both must be recovered:
   *  - `lease_until <= now`: a worker claimed the slot and then died (crash, OOM,
   *    machine stop, redeploy). Its heartbeat stopped, so the lease expired.
   *  - `lease_until IS NULL`: a durable slot was recorded (accepted) but no worker
   *    ever claimed it — e.g. the process died between "occurrence recorded" and
   *    "lease claimed". Nothing else will ever pick that up.
   *
   * Callers must NOT clear the lease from here. Recovery re-DISPATCHES the slot
   * and the atomic CAS in `claimSlotLease` still elects the single winner, so a
   * merely slow (but healthy) owner that heartbeats mid-scan cannot be robbed by
   * a read-then-clear race.
   */
  public recoverableSlots(now: number = Date.now()): SlotRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM schedule_slots
         WHERE status IN ('pending','running')
           AND (lease_until IS NULL OR lease_until <= @now)
         ORDER BY COALESCE(occurrence_at, 0) ASC`
      )
      .all({ now }) as any[];
    return rows.map((r) => this.toSlot(r));
  }

  /** Record an error without changing terminality (retryable failure keeps the cell resumable). */
  public setCellError(slotId: string, targetId: string, error: string): void {
    this.db
      .prepare(
        `UPDATE schedule_slot_items SET last_error = @error, updated_at = CURRENT_TIMESTAMP
         WHERE slot_id = @slotId AND target_id = @targetId`
      )
      .run({ slotId, targetId, error: error.slice(0, 1000) });
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
    const isTerminal = (s: string) => s === 'submitted' || s === 'no_candidate' || s === 'duplicate' || s === 'failed';
    const terminal = cells.filter((c) => isTerminal(c.status));
    if (terminal.length < cells.length) return 'running';
    if (cells.every((c) => c.status === 'submitted')) return 'success';
    if (cells.some((c) => c.status === 'submitted')) return 'partial';
    return 'failed';
  }

  private toSlot(row: any): SlotRecord {
    let targetIds: string[] = [];
    try {
      const parsed = row.target_ids ? JSON.parse(row.target_ids) : [];
      if (Array.isArray(parsed)) targetIds = parsed.map(String);
    } catch {
      targetIds = [];
    }
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      occurrenceAt: row.occurrence_at ?? null,
      occurrenceDate: row.occurrence_date ?? '',
      occurrenceLabel: row.occurrence_label ?? '',
      timezone: row.timezone ?? 'UTC',
      targetIds,
      status: row.status,
      triggerSource: row.trigger_source,
      slotDate: row.slot_date ?? '',
      slotName: row.slot_name ?? '',
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastError: row.last_error,
      leaseOwner: row.lease_owner ?? null,
      leaseUntil: row.lease_until ?? null,
      heartbeatAt: row.heartbeat_at ?? null,
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