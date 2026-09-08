import { ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { Database } from '../storage/Database';
import {
  CellStatus,
  SlotItemRecord,
  SlotRecord,
  SlotStatus,
} from '../storage/repositories/SlotRepository';
import { logger } from '../logger';
import {
  ResolvedOccurrence,
  TriggerSource,
  checkOccurrenceWindow,
  resolveOccurrence,
  scheduleTimezone,
} from './OccurrenceResolver';

/**
 * Durable execution context attached to a run. A scheduled occurrence always
 * has a slotId; an ad-hoc/manual run has none (it never touches the slot ledger).
 */
export interface SlotContext {
  slotId: string;
  scheduleId: string;
  occurrenceAt: number;
  occurrenceDate: string;
  occurrenceLabel: string;
  timezone: string;
  triggerSource: TriggerSource;
  /**
   * Generic execution provenance, surfaced to delivery templates. `slotName` is
   * an optional human label (e.g. a deploy-layer "今日早班"); it is never parsed
   * by Core and defaults to the scheduled time label.
   */
  slotName: string;
  slotDate: string;
}

export interface SlotCellSummary {
  targetId: string;
  status: CellStatus;
  workId: string | null;
  error?: string | null;
}

export interface SlotRunSummary {
  scheduleId: string;
  slotId: string;
  status: SlotStatus;
  alreadyCompleted: boolean;
  cells: SlotCellSummary[];
}

export interface SlotResolveResult {
  context?: SlotContext;
  error?: string;
  status?: number;
}

/**
 * Owns the Schedule Slot ledger for one scheduler run. A Slot is one durable
 * execution occurrence of a Schedule (NOT a morning/evening row). It ensures
 * duplicate/concurrent/retry triggers converge on one slot, completed cells are
 * not re-run, target membership is stable once materialized, and a selected
 * work id stays locked across automatic retries.
 *
 * This class is delivery-agnostic: it knows nothing about TelePost, bots, or any
 * hosting platform — only schedules, targets and the slot ledger.
 */
export class SlotCoordinator {
  constructor(private readonly database: Database) {}

  /**
   * Resolve + validate the canonical occurrence for a trigger. Uses ONLY the
   * schedule's cron + timezone and the trigger instant (never a client-supplied
   * past date). `requestedSlotName` is an optional human label for provenance;
   * identity always derives from the resolved canonical fire time.
   */
  resolveOccurrence(
    schedule: ScheduleConfig,
    config: StandaloneConfig,
    triggerSource: TriggerSource,
    at: Date = new Date(),
    requestedSlotName?: string
  ): SlotResolveResult {
    const graceMin = config.schedulerRuntime?.trigger?.graceMinutes ?? 90;
    let occurrence: ResolvedOccurrence;
    try {
      occurrence = resolveOccurrence({ schedule, at, triggerSource });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), status: 400 };
    }

    // Internal cron/catch-up are trusted to fire on their own occurrence; the
    // HTTP adapter validates the public grace window so an external clock cannot
    // back-fill history.
    if (triggerSource === 'http' || triggerSource === 'manual') {
      const window = checkOccurrenceWindow(occurrence, at, graceMin);
      if (!window.ok) {
        return { error: window.error!, status: window.status };
      }
    }

    return {
      context: {
        slotId: occurrence.slotId,
        scheduleId: occurrence.scheduleId,
        occurrenceAt: occurrence.occurrenceAt.getTime(),
        occurrenceDate: occurrence.occurrenceDate,
        occurrenceLabel: occurrence.occurrenceLabel,
        timezone: occurrence.timezone,
        triggerSource: occurrence.triggerSource,
        slotName: requestedSlotName?.trim() || occurrence.occurrenceLabel,
        slotDate: occurrence.occurrenceDate,
      },
    };
  }

  /**
   * Open (or resume) an occurrence and snapshot its target membership on first
   * creation. A later config reload cannot add/remove cells for this occurrence.
   */
  begin(slot: SlotContext, schedule: ScheduleConfig, targets: TargetConfig[]): { slotRec: SlotRecord; alreadyCompleted: boolean } {
    const targetIds = targets.map((t) => t.id).filter((id): id is string => Boolean(id));
    const { slot: slotRec, created } = this.database.slots.getOrCreateSlot(slot.slotId, {
      scheduleId: slot.scheduleId,
      occurrenceAt: slot.occurrenceAt,
      occurrenceDate: slot.occurrenceDate,
      occurrenceLabel: slot.occurrenceLabel,
      timezone: slot.timezone,
      targetIds,
      triggerSource: slot.triggerSource,
      slotDate: slot.slotDate,
      slotName: slot.slotName,
    });
    if (created) {
      // Freeze membership: materialize one cell per target id from the snapshot.
      const workTypeById = new Map(targets.map((t) => [t.id as string, t.type ?? 'unknown']));
      this.database.slots.materializeCells(slot.slotId, targetIds, (id) => workTypeById.get(id) ?? 'unknown');
      logger.info('Slot started', { slot: slot.slotId, schedule: schedule.id, targets: targetIds.length });
    } else {
      logger.info('Slot resumed (duplicate trigger or restart)', { slot: slot.slotId, status: slotRec.status });
    }

    if (slotRec.status === 'success' || slotRec.status === 'partial') {
      return { slotRec, alreadyCompleted: true };
    }
    this.database.slots.markSlotStatus(slot.slotId, 'running');
    return { slotRec, alreadyCompleted: false };
  }

  /**
   * The targets that still need to run for this occurrence. Membership comes
   * from the materialized snapshot (stable), intersected with the targets the
   * caller currently knows about; terminal cells are skipped on resume.
   */
  pendingTargets(slotId: string, targets: TargetConfig[]): { target: TargetConfig; cell: SlotItemRecord }[] {
    const membership = new Set(this.database.slots.getSlotTargetIds(slotId));
    const out: { target: TargetConfig; cell: SlotItemRecord }[] = [];
    for (const target of targets) {
      if (!target.id) continue;
      if (membership.size > 0 && !membership.has(target.id)) continue; // config reload: not part of this occurrence
      const cell = this.database.slots.getCell(slotId, target.id);
      if (!cell) continue;
      if (cell.status === 'submitted' || cell.status === 'no_candidate') continue;
      out.push({ target, cell });
    }
    return out;
  }

  /** Lock the selected work for a cell (first selection wins; retries keep it). */
  lockWork(slotId: string, targetId: string, workId: string, workType: string): void {
    this.database.slots.ensureCell(slotId, targetId, workType);
    this.database.slots.lockCellWork(slotId, targetId, workId, workType);
  }

  /** Record a cell's terminal state from the download/delivery outcome. */
  markCell(slotId: string, targetId: string, status: CellStatus, error?: string): void {
    const cell = this.database.slots.getCell(slotId, targetId);
    if (!cell) return;
    if (cell.status === 'submitted' && status !== 'submitted') return; // never downgrade a delivered cell
    this.database.slots.setCellStatus(slotId, targetId, status, error);
  }

  /** Roll cell results up into the slot status (one place computes the aggregate). */
  finish(slot: SlotContext, schedule: ScheduleConfig, targets: TargetConfig[]): SlotRunSummary {
    const membership = this.database.slots.getSlotTargetIds(slot.slotId);
    const ids = membership.length > 0 ? membership : targets.map((t) => t.id).filter(Boolean) as string[];
    for (const targetId of ids) {
      const cell = this.database.slots.getCell(slot.slotId, targetId);
      if (!cell) continue;
      if (cell.status === 'pending' || cell.status === 'selected') {
        // Ran but never reached a terminal state (target threw before delivery).
        this.database.slots.setCellStatus(slot.slotId, targetId, 'failed', cell.lastError ?? 'target did not complete');
      }
    }
    const status = this.database.slots.deriveSlotStatus(slot.slotId);
    this.database.slots.markSlotStatus(slot.slotId, status);

    const cells = this.database.slots.getCells(slot.slotId).map((c) => ({
      targetId: c.targetId,
      status: c.status,
      workId: c.workId,
      error: c.lastError,
    }));

    const icon = (s: CellStatus) =>
      s === 'submitted' ? '✅' : s === 'no_candidate' ? '⚠️ no_candidate' : '❌ failed';
    logger.info(
      `Slot ${slot.slotId} ${status}\n` +
        cells.map((c) => `  ${c.targetId.padEnd(28)} ${icon(c.status)} ${c.workId ? '#' + c.workId : ''} ${c.error ? '(' + c.error + ')' : ''}`).join('\n'),
      { slot: slot.slotId, status }
    );

    return { scheduleId: schedule.id, slotId: slot.slotId, status, alreadyCompleted: false, cells };
  }

  completedSummary(slotId: string, schedule: ScheduleConfig): SlotRunSummary {
    const cells = this.database.slots.getCells(slotId).map((c) => ({
      targetId: c.targetId,
      status: c.status,
      workId: c.workId,
      error: c.lastError,
    }));
    const slotRec = this.database.slots.getSlot(slotId);
    return {
      scheduleId: schedule.id,
      slotId,
      status: (slotRec?.status as SlotStatus) ?? 'success',
      alreadyCompleted: true,
      cells,
    };
  }
}

/** Resolve the timezone a schedule runs in (never the server's local tz). */
export function timezoneForSchedule(schedule: ScheduleConfig | undefined, config: StandaloneConfig): string {
  return scheduleTimezone(schedule, config.scheduler?.timezone);
}
