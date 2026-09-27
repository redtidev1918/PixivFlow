/**
 * The one read model for a generic job: durable slot + cell -> `$defs/Job`.
 *
 * Extracted from `ManualJobService` so the HTTP job surface and the event stream
 * (`JobEventStream`) project a slot through EXACTLY the same code. Two views of
 * the same ledger that could disagree would be a second status machine in
 * disguise.
 */

import type { StandaloneConfig } from '../config';
import type { Database } from '../storage/Database';
import type { SlotItemRecord, SlotRecord } from '../storage/repositories/SlotRepository';
import {
  buildProtocolJob,
  JOB_TYPE_CANDIDATE_SEARCH,
  ProtocolJob,
  resolveDeadlineMs,
} from './JobFacade';
import { buildJobProjection } from './JobProjection';
import { ProtocolRequestError } from './ProtocolErrors';
import { CandidateSupplyReport } from './TargetOutcome';

export interface JobViewDeps {
  database: Database;
  /** The live config snapshot (the trigger server always reads the newest). */
  config(): StandaloneConfig;
  /** Injected clock, for tests. */
  now(): number;
}

/** Project one durable slot. Throws when the ledger row is not materialized. */
export function protocolJobForSlot(deps: JobViewDeps, slot: SlotRecord): ProtocolJob {
  const targetId = slot.targetIds[0];
  const cell = targetId ? deps.database.slots.getCell(slot.id, targetId) : null;
  if (!targetId || !cell) {
    throw new ProtocolRequestError('internal_error', 500, {
      message: 'job has no materialized work item',
      detail: { reason: 'job_cell_missing', job_id: slot.id },
    });
  }
  const requestId = slot.manualRequestId ?? slot.id;
  const projection = buildJobProjection(requestId, slot, cell, deps.now());
  return buildProtocolJob({
    jobType: JOB_TYPE_CANDIDATE_SEARCH,
    projection,
    deadlineAt: deadlineAt(slot, deps.config()),
    delivered: deliveredWork(deps, slot, targetId, cell),
    supply: cell.candidateReport as unknown as CandidateSupplyReport | null,
    now: deps.now(),
  });
}

/** Project one slot by id; null when this job is not in the ledger. */
export function protocolJobBySlotId(deps: JobViewDeps, slotId: string): ProtocolJob | null {
  const slot = deps.database.slots.getSlot(slotId);
  return slot ? protocolJobForSlot(deps, slot) : null;
}

/** Project an admitted slot that MUST exist. */
export function requireProtocolJobForSlotId(deps: JobViewDeps, slotId: string): ProtocolJob {
  const job = protocolJobBySlotId(deps, slotId);
  if (!job) {
    throw new ProtocolRequestError('internal_error', 500, {
      message: 'admitted job is missing from the ledger',
      detail: { reason: 'job_not_persisted', job_id: slotId },
    });
  }
  return job;
}

/**
 * What this job actually delivered, read from the durable delivery intents.
 * Only a confirmed delivery counts; an intent that never left is not an outcome.
 */
export function deliveredWork(
  deps: JobViewDeps,
  slot: SlotRecord,
  targetId: string,
  cell: SlotItemRecord
): { workId: string | null; workType: string | null } | null {
  const delivered = deps.database.deliveries
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
function deadlineAt(slot: SlotRecord, config: StandaloneConfig): number | null {
  if (slot.occurrenceAt === null) return null;
  return slot.occurrenceAt + resolveDeadlineMs(config, slot.scheduleId);
}
