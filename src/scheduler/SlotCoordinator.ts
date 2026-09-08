import { ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { Database } from '../storage/Database';
import { CellStatus, SlotItemRecord, SlotRecord, SlotStatus } from '../storage/repositories/SlotRepository';
import { logger } from '../logger';

export interface SlotContext {
  slotId: string;
  slotName: string;
  slotDate: string;
  triggerSource: string;
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

/** Morning cron fires before noon; evening from noon onward (config tz). */
export function slotNameForNow(timezone: string | undefined): 'morning' | 'evening' {
  const hour = new Date(
    new Date().toLocaleString('en-US', { timeZone: timezone || 'Asia/Shanghai' })
  ).getHours();
  return hour < 13 ? 'morning' : 'evening';
}

/** Today's date (YYYY-MM-DD) in the configured scheduler timezone. */
export function slotDateForNow(timezone: string | undefined): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function todayInTz(timezone: string | undefined): string {
  return slotDateForNow(timezone);
}

/**
 * Owns the Schedule Slot ledger for one scheduler run. Ensures duplicate
 * triggers / restarts converge on one slot, completed cells are not re-run, and
 * a selected work id stays locked across automatic retries.
 */
export class SlotCoordinator {
  constructor(private readonly database: Database) {}

  /** Resolve + validate a requested slot against now (never trusts client date). */
  resolveSlot(requested: string | undefined, config: StandaloneConfig): SlotContext | { error: string; status: number } {
    const tz = this.primaryTimezone(config);
    const name = requested === 'evening' ? 'evening' : requested === 'morning' ? 'morning' : slotNameForNow(tz);
    const date = todayInTz(tz);
    const graceMin = config.schedulerRuntime?.trigger?.graceMinutes ?? 90;
    const now = Date.now();

    // Grace window: a slot is runnable if its scheduled time was within the last
    // `graceMin` minutes (resume after a crash) or is still upcoming today.
    const scheduledHour = name === 'morning' ? 10 : 18;
    const sched = new Date(`${date}T${String(scheduledHour).padStart(2, '0')}:00:00`);
    // Compare in tz-agnostic wall clock is imprecise; use a coarse grace check:
    // allow when within [scheduled - small lead, scheduled + grace]. Lead 15m.
    const leadMs = 15 * 60_000;
    const graceMs = graceMin * 60_000;
    if (now < sched.getTime() - leadMs) {
      return { error: `slot ${name} for ${date} is not due yet`, status: 425 };
    }
    if (now > sched.getTime() + graceMs) {
      return { error: `slot ${name} for ${date} has expired (grace ${graceMin}m)`, status: 410 };
    }
    return { slotId: `${date}:${name}`, slotName: name, slotDate: date, triggerSource: 'external' };
  }

  private primaryTimezone(config: StandaloneConfig): string | undefined {
    return config.schedules?.[0]?.timezone ?? config.scheduler?.timezone;
  }

  /** The targets that still need to run for this slot (skips terminal cells). */
  pendingTargets(slotId: string, targets: TargetConfig[]): { target: TargetConfig; cell: SlotItemRecord }[] {
    const out: { target: TargetConfig; cell: SlotItemRecord }[] = [];
    for (const target of targets) {
      if (!target.id) continue;
      const cell = this.database.slots.ensureCell(slotId, target.id, target.type);
      if (cell.status === 'submitted' || cell.status === 'no_candidate') continue;
      out.push({ target, cell });
    }
    return out;
  }

  /** Open (or resume) a slot and return whether the whole slot is already done. */
  begin(slot: SlotContext, schedule: ScheduleConfig): { slotRec: SlotRecord; alreadyCompleted: boolean } {
    const { slot: slotRec, created } = this.database.slots.getOrCreateSlot(slot.slotId, {
      slotDate: slot.slotDate,
      slotName: slot.slotName,
      scheduleId: schedule.id,
      triggerSource: slot.triggerSource,
    });
    if (created) logger.info('Slot started', { slot: slot.slotId, schedule: schedule.id });
    else logger.info('Slot resumed (duplicate trigger or restart)', { slot: slot.slotId, status: slotRec.status });

    if (slotRec.status === 'success' || slotRec.status === 'partial') {
      return { slotRec, alreadyCompleted: true };
    }
    this.database.slots.markSlotStatus(slot.slotId, 'running');
    return { slotRec, alreadyCompleted: false };
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

  /** Roll cell results up into the slot status and log a readable summary. */
  finish(slot: SlotContext, schedule: ScheduleConfig, targets: TargetConfig[]): SlotRunSummary {
    for (const t of targets) {
      if (!t.id) continue;
      const cell = this.database.slots.getCell(slot.slotId, t.id);
      if (!cell || cell.status === 'pending' || cell.status === 'selected') {
        // Ran but never reached a terminal state (target threw before delivery).
        if (cell) this.database.slots.setCellStatus(slot.slotId, t.id, 'failed', cell.lastError ?? 'target did not complete');
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
