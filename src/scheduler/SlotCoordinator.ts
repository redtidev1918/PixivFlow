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
import { TargetOutcome } from './TargetOutcome';
import { TargetExecutionContext, WorkBinding, isSingleWorkCell } from './WorkIdentity';

/**
 * Execution-lease TTL and heartbeat cadence.
 *
 * These describe how fast a DEAD worker is noticed — they are deliberately
 * unrelated to `schedule.timeout` (which caps how long a run may take). Tying
 * the two together made a crashed worker hold its slot for up to 31 minutes
 * before any other trigger could resume it. A live worker renews its lease every
 * SLOT_HEARTBEAT_MS, so the worst-case recovery delay after a crash/restart is
 * about SLOT_LEASE_TTL_MS. The TTL stays comfortably above the heartbeat so an
 * occasional stalled event loop cannot make a healthy run look dead.
 */
export const SLOT_LEASE_TTL_MS = 3 * 60 * 1000;
export const SLOT_HEARTBEAT_MS = 30 * 1000;

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
 * What a `delivery_pending` cell still owes downstream, read from the durable
 * delivery ledger.
 *
 *  - `live`      : a non-terminal intent still owns the cell — the outbox is
 *                  retrying THAT work toward a terminal ACK.
 *  - `confirmed` : the ACK already landed but the cell promotion was lost.
 *  - `lost`      : the intent is terminally failed; nobody will converge it.
 *  - `unknown`   : no delivery fact for this cell (not a delivery cell).
 */
export type CellDeliveryState =
  | { kind: 'live' }
  | { kind: 'confirmed'; workId: string; workType: string }
  | { kind: 'lost'; reason: string }
  | { kind: 'unknown' };

/**
 * Port for the delivery ledger, injected by the runtime. It lets the slot FSM
 * hand a `delivery_pending` cell to whoever owns its delivery without this class
 * learning anything about TelePost, bots or any hosting platform (see below).
 */
export interface SchedulerDeliveryPort {
  stateFor(input: { deliveryTarget: string; slotId: string; targetId: string }): CellDeliveryState;
}

/** The delivery channel a scheduled cell publishes to (null = download-only). */
function deliveryTargetOf(target: TargetConfig): string | null {
  if (target.storageMode !== 'cache') return null;
  const name = target.delivery?.target;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
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
  constructor(
    private readonly database: Database,
    private readonly delivery?: SchedulerDeliveryPort
  ) {}

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
   * Durably open (or resume) an occurrence and snapshot its target membership
   * on first creation. A later config reload cannot add/remove cells for this
   * occurrence.
   *
   * This deliberately does NOT mark the slot `running`: the HTTP trigger calls
   * it before dispatch so that a crash between "accepted" and "claimed" still
   * leaves a durable `pending` row for reconciliation to pick up (see
   * `markRunning` and MultiScheduleManager's recovery loop).
   */
  prepare(slot: SlotContext, schedule: ScheduleConfig, targets: TargetConfig[]): { slotRec: SlotRecord; alreadyCompleted: boolean } {
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
    return { slotRec, alreadyCompleted: false };
  }

  /**
   * Mark the occurrence as actually executing. Called by the worker that has
   * already won the cross-process lease (never by the accepting adapter), so a
   * slot is never reported `running` by a process that is not running it.
   */
  markRunning(slotId: string): void {
    this.database.slots.markSlotStatus(slotId, 'running');
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
      // A cell whose work already has a durable delivery intent is NOT the
      // scheduler's to re-run: the OutboxWorker retries the SAME work to a
      // terminal ACK. Re-selecting here is what let recovery stop pointing at the
      // cell's own work (or enqueue a second one), so it is delegated instead.
      if (cell.status === 'delivery_pending' && isSingleWorkCell(target) && this.settlePendingDelivery(slotId, target)) {
        continue;
      }
      out.push({ target, cell });
    }
    return out;
  }

  /**
   * Build the per-target execution contexts for one run, so every handler
   * receives the cell's durable identity instead of just a TargetConfig.
   *
   * This is the boundary where the identity used to be dropped (`pending` was
   * reduced to `p.target`), which is what let a resume re-rank and re-point the
   * logical item at a different work.
   */
  executionContextsFor(
    slotId: string,
    entries: { target: TargetConfig; cell: SlotItemRecord | null }[]
  ): Map<string, TargetExecutionContext> {
    const contexts = new Map<string, TargetExecutionContext>();
    for (const { target, cell } of entries) {
      if (!target.id || !cell) continue;
      const targetId = target.id;
      contexts.set(targetId, {
        slotId,
        targetId,
        lockedWorkId: cell.workId,
        bind: (workId, workType) => this.lockWorkCas(slotId, targetId, workId, workType),
        release: (workId) => this.releaseWorkCas(slotId, targetId, workId),
      });
    }
    return contexts;
  }

  /** Lock the selected work for a cell (first selection wins; retries keep it). */
  lockWork(slotId: string, targetId: string, workId: string, workType: string): void {
    this.database.slots.ensureCell(slotId, targetId, workType);
    this.database.slots.lockCellWork(slotId, targetId, workId, workType);
  }

  /**
   * CAS-bind a cell to the work a handler is about to process. Returns the
   * authoritative binding: when another worker already elected a different work,
   * `won` is false and the caller MUST continue with the returned `workId`
   * instead of its own candidate.
   */
  lockWorkCas(slotId: string, targetId: string, workId: string, workType: string): WorkBinding {
    this.database.slots.ensureCell(slotId, targetId, workType);
    const { cell, won } = this.database.slots.tryLockCellWork(slotId, targetId, workId, workType);
    return { workId: cell.workId ?? workId, won };
  }

  /**
   * Release a provisional binding whose work produced no local artifact, so the
   * next candidate of an UNBOUND cell can be tried. Refused once anything was
   * committed (see SlotRepository.releaseCellWork).
   */
  releaseWorkCas(slotId: string, targetId: string, workId: string): void {
    this.database.slots.releaseCellWork(slotId, targetId, workId);
  }

  /** Record a cell's terminal state from the download/delivery outcome. */
  markCell(slotId: string, targetId: string, status: CellStatus, error?: string): void {
    const cell = this.database.slots.getCell(slotId, targetId);
    if (!cell) return;
    if (cell.status === 'submitted' && status !== 'submitted') return; // never downgrade a delivered cell
    this.database.slots.setCellStatus(slotId, targetId, status, error);
  }

  /**
   * Map a typed TargetOutcome onto the explicit cell FSM. This is the ONLY
   * place a target result becomes a cell state, and it never infers success
   * from a missing exception. A confirmed downstream ACK ('submitted') is the
   * sole path to the submitted cell state.
   */
  applyOutcome(slotId: string, targetId: string, outcome: TargetOutcome): void {
    const cell = this.database.slots.getCell(slotId, targetId);
    if (!cell) return;
    switch (outcome.kind) {
      case 'submitted':
        this.database.slots.lockCellWork(slotId, targetId, outcome.workId, outcome.workType);
        this.safeTransition(slotId, targetId, 'submitted');
        return;
      case 'stored':
        // No downstream delivery target (persistent/download-only): a finished
        // cell, but labelled via the ledger-free 'submitted' aggregate state so
        // download-only schedules do not rerun forever.
        this.database.slots.lockCellWork(slotId, targetId, outcome.workId, outcome.workType);
        this.safeTransition(slotId, targetId, 'submitted');
        return;
      case 'delivery_pending':
        this.database.slots.lockCellWork(slotId, targetId, outcome.workId, outcome.workType);
        this.safeTransition(slotId, targetId, 'delivery_pending');
        return;
      case 'no_candidate':
        // Only terminal if the cell never locked a work; a locked work whose
        // delivery is still pending must not be collapsed to no_candidate.
        if (!cell.workId) this.safeTransition(slotId, targetId, 'no_candidate', outcome.reason);
        return;
      case 'duplicate':
        this.database.slots.lockCellWork(slotId, targetId, outcome.workId, cell.workType ?? 'unknown');
        this.safeTransition(slotId, targetId, 'duplicate', outcome.reason);
        return;
      case 'failed':
        if (outcome.retryable) {
          // Leave non-terminal (selected/delivery_pending) so a later trigger
          // resumes the SAME work. Record the error without a terminal state.
          this.database.slots.setCellError?.(slotId, targetId, outcome.error);
          return;
        }
        this.safeTransition(slotId, targetId, 'failed', outcome.error);
        return;
    }
  }

  /** Promote a delivery_pending cell to submitted from a confirmed ACK. */
  markDelivered(slotId: string, targetId: string, workId: string, workType: string): void {
    this.database.slots.lockCellWork(slotId, targetId, workId, workType);
    this.safeTransition(slotId, targetId, 'submitted');
  }

  /**
   * Decide what a `delivery_pending` cell owes, from the durable delivery
   * ledger, and converge the FSM accordingly. Returns true when the scheduler
   * must NOT run the target handler for it.
   *
   * Once an intent is durable the outbox owns the delivery: re-running selection
   * could only produce a DIFFERENT work for the same logical item (and a second
   * delivery, since the delivery idempotency key is work-scoped). A terminally
   * failed delivery is converged explicitly — never "repaired" by picking
   * another work behind the operator's back.
   */
  private settlePendingDelivery(slotId: string, target: TargetConfig): boolean {
    const deliveryTarget = deliveryTargetOf(target);
    if (!deliveryTarget || !this.delivery || !target.id) return false;
    const state = this.delivery.stateFor({ deliveryTarget, slotId, targetId: target.id });
    switch (state.kind) {
      case 'live':
        logger.info('Cell delivery still owned by the outbox; selection not re-run', {
          slot: slotId,
          target: target.id,
          deliveryTarget,
        });
        return true;
      case 'confirmed':
        // The ACK landed but the promotion was lost (crash between the delivery
        // ledger write and the cell transition). Heal from the ledger — the work
        // IS delivered, so re-selecting would post a second one.
        logger.info('Cell delivery already confirmed; promoting the cell from the ledger', {
          slot: slotId,
          target: target.id,
          workId: state.workId,
        });
        this.markDelivered(slotId, target.id, state.workId, state.workType);
        return true;
      case 'lost':
        logger.warn('Cell delivery failed terminally; failing the cell instead of re-selecting', {
          slot: slotId,
          target: target.id,
          reason: state.reason,
        });
        this.applyOutcome(slotId, target.id, { kind: 'failed', retryable: false, error: state.reason });
        return true;
      case 'unknown':
        return false;
    }
  }

  private safeTransition(
    slotId: string,
    targetId: string,
    next: import('../storage/repositories/SlotRepository').CellStatus,
    error?: string
  ): void {
    try {
      this.database.slots.transitionCell(slotId, targetId, next, error);
    } catch (e) {
      logger.debug('Cell transition rejected', { slotId, targetId, next, error: (e as Error).message });
    }
  }

  /** Cross-process execution lease. Duplicate triggers converge, never parallel-run. */
  claimRunLease(slotId: string, owner: string, leaseMs: number): boolean {
    return this.database.slots.claimSlotLease(slotId, owner, Date.now() + leaseMs);
  }

  heartbeatLease(slotId: string, owner: string, leaseMs: number): void {
    this.database.slots.heartbeatSlotLease(slotId, owner, Date.now() + leaseMs);
  }

  releaseRunLease(slotId: string, owner: string): void {
    this.database.slots.releaseSlotLease(slotId, owner);
  }

  /** Roll cell results up into the slot status (one place computes the aggregate). */
  finish(slot: SlotContext, schedule: ScheduleConfig, targets: TargetConfig[]): SlotRunSummary {
    const membership = this.database.slots.getSlotTargetIds(slot.slotId);
    const ids = membership.length > 0 ? membership : targets.map((t) => t.id).filter(Boolean) as string[];
    for (const targetId of ids) {
      const cell = this.database.slots.getCell(slot.slotId, targetId);
      if (!cell) continue;
      // delivery_pending / artifact_ready are recoverable: the OutboxWorker (or
      // the next trigger) resumes the SAME work, so the slot stays running.
      if (cell.status === 'delivery_pending' || cell.status === 'artifact_ready') continue;
      if (cell.status === 'pending' || cell.status === 'selected') {
        // Ran but never reached a terminal state (target threw before delivery).
        this.database.slots.setCellStatus(slot.slotId, targetId, 'failed', cell.lastError ?? 'target did not complete');
      }
    }
    const status = this.database.slots.deriveSlotStatus(slot.slotId);
    this.database.slots.markSlotStatus(slot.slotId, status);
    this.persistExecutionSummary(slot.slotId, status);

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

  /**
   * Persist a one-row incident/execution summary into delivery_events
   * (event='execution.summary') at the terminal rollup only. Event-row storage
   * reuses the audit table + `runs show` read path instead of inventing a
   * summary table or overloading execution_log's illustration/novel typing.
   */
  private persistExecutionSummary(slotId: string, status: string): void {
    if (status !== 'success' && status !== 'partial' && status !== 'failed') return;
    try {
      if (this.database.outbox.hasExecutionSummary(slotId)) return;
      const summary = this.database.outbox.executionSummary(slotId);
      this.database.outbox.recordEvent({
        executionId: slotId,
        slotId,
        event: 'execution.summary',
        countsAsAttempt: 0,
        detail: { summary },
      });
    } catch (error) {
      logger.debug('Failed to persist execution summary', { slot: slotId, error: (error as Error).message });
    }
  }

  completedSummary(slotId: string, schedule: ScheduleConfig): SlotRunSummary {    const cells = this.database.slots.getCells(slotId).map((c) => ({
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