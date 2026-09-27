/**
 * The generic job surface: `$defs/Task` in, `$defs/Job` out.
 *
 * This is an ADAPTER, not a second execution system. Everything it does is a
 * translation on top of the one durable ledger:
 *   - admission      -> `ManualJobAdmission` (shared with the legacy refetch path)
 *   - read model     -> `buildJobProjection` + `buildProtocolJob`
 *   - cancellation   -> `cancelConsumerJob` (one transaction)
 *
 * Identity is the consumer's idempotency key, which IS the durable
 * `manual_request_id`; `job_id` IS the slot id. A replay from either entry
 * point therefore converges on the same job, and no second slot or delivery can
 * be created for the same key.
 */

import type { StandaloneConfig } from '../config';
import type { Database } from '../storage/Database';
import type { SlotItemRecord, SlotRecord } from '../storage/repositories/SlotRepository';
import { buildJobProjection } from './JobProjection';
import { cancelConsumerJob } from './JobCancellation';
import {
  buildCapabilities,
  buildProtocolJob,
  JOB_TYPE_CANDIDATE_SEARCH,
  parseTaskBody,
  ProtocolCapabilities,
  ProtocolJob,
  resolveDeadlineMs,
} from './JobFacade';
import { ManualJobAdmission } from './ManualJobAdmission';
import { ProtocolRequestError } from './ProtocolErrors';
import type { JobHandlers } from './ScheduleTriggerServer';
import { CandidateSupplyReport } from './TargetOutcome';

export interface ManualJobServiceDeps {
  database: Database;
  /** The live config snapshot (the trigger server always reads the newest). */
  config(): StandaloneConfig;
  /** The shared admission path — the same instance the legacy shim uses. */
  admission: ManualJobAdmission;
  /** Injected clock, for tests. */
  now?(): number;
}

export class ManualJobService implements JobHandlers {
  constructor(private readonly deps: ManualJobServiceDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  capabilities(): ProtocolCapabilities {
    return buildCapabilities(this.deps.config(), this.now());
  }

  /** Create or replay the one work item this idempotency key owns. */
  submitJob(body: unknown): { job: ProtocolJob; replayed: boolean } {
    const task = parseTaskBody(body);
    const result = this.deps.admission.admit({
      idempotencyKey: task.idempotencyKey,
      ...(task.correlationId !== undefined ? { correlationId: task.correlationId } : {}),
      ...(task.account !== undefined ? { account: task.account } : {}),
      params: task.params,
    });
    return { job: this.viewBySlotId(result.slotId), replayed: result.reused };
  }

  jobStatus(jobId: string): ProtocolJob | null {
    const slot = this.deps.database.slots.getSlot(jobId);
    return slot ? this.view(slot) : null;
  }

  jobsByIdempotencyKey(idempotencyKey: string): ProtocolJob[] {
    const slot = this.deps.database.slots.findManualSlotByKey(idempotencyKey);
    return slot ? [this.view(slot)] : [];
  }

  /**
   * Idempotent: cancelling an already-terminal job reports its current
   * projection instead of failing. `cancelConsumerJob` owns the one transaction
   * that terminalises the work and stops further deliveries.
   */
  cancelJob(jobId: string): ProtocolJob {
    cancelConsumerJob(this.deps.database, jobId, this.now());
    return this.viewBySlotId(jobId);
  }

  private viewBySlotId(slotId: string): ProtocolJob {
    const slot = this.deps.database.slots.getSlot(slotId);
    if (!slot) {
      throw new ProtocolRequestError('internal_error', 500, {
        message: 'admitted job is missing from the ledger',
        detail: { reason: 'job_not_persisted', job_id: slotId },
      });
    }
    return this.view(slot);
  }

  /**
   * Read the durable projection of one job. The cell is the truth: a manual
   * slot has exactly one target, so its single cell carries the outcome.
   */
  private view(slot: SlotRecord): ProtocolJob {
    const targetId = slot.targetIds[0];
    const cell = targetId ? this.deps.database.slots.getCell(slot.id, targetId) : null;
    if (!targetId || !cell) {
      throw new ProtocolRequestError('internal_error', 500, {
        message: 'job has no materialized work item',
        detail: { reason: 'job_cell_missing', job_id: slot.id },
      });
    }
    const requestId = slot.manualRequestId ?? slot.id;
    const projection = buildJobProjection(requestId, slot, cell, this.now());
    const delivered = this.deliveredWork(slot, targetId, cell);
    const supply = cell.candidateReport as unknown as CandidateSupplyReport | null;
    const config = this.deps.config();
    return buildProtocolJob({
      jobType: JOB_TYPE_CANDIDATE_SEARCH,
      projection,
      deadlineAt: this.deadlineAt(slot, config),
      delivered,
      supply,
      now: this.now(),
    });
  }

  /**
   * What this job actually delivered, read from the durable delivery intents.
   * Only a confirmed delivery counts; an intent that never left is not an
   * outcome.
   */
  private deliveredWork(
    slot: SlotRecord,
    targetId: string,
    cell: SlotItemRecord
  ): { workId: string | null; workType: string | null } | null {
    const delivered = this.deps.database.deliveries
      .listForSlotCell(slot.id, targetId)
      .filter((row) => row.status === 'delivered');
    const last = delivered[delivered.length - 1];
    if (last) return { workId: last.pixivId, workType: last.workType };
    if (cell.status === 'submitted' && cell.workId) {
      return { workId: cell.workId, workType: cell.workType };
    }
    return null;
  }

  /**
   * The ceiling this deployment enforces for the job: the plan's execution
   * timeout, measured from the occurrence. A consumer-supplied `deadline_ms`
   * that is shorter is NOT honoured yet (no durable column enforces it), so the
   * facade must not report it here.
   */
  private deadlineAt(slot: SlotRecord, config: StandaloneConfig): number | null {
    if (slot.occurrenceAt === null) return null;
    return slot.occurrenceAt + resolveDeadlineMs(config, slot.scheduleId);
  }
}
