/**
 * The generic job surface: `$defs/Task` in, `$defs/Job` out.
 *
 * This is an ADAPTER, not a second execution system. Everything it does is a
 * translation on top of the one durable ledger:
 *   - admission      -> `ManualJobAdmission` (shared with the legacy refetch path)
 *   - read model     -> `JobView` (`buildJobProjection` + `buildProtocolJob`)
 *   - cancellation   -> `cancelConsumerJob` (one transaction)
 *   - events/ack     -> `JobEventStream` (projection of `delivery_events`)
 *
 * Identity is the consumer's idempotency key, which IS the durable
 * `manual_request_id`; `job_id` IS the slot id. A replay from either entry
 * point therefore converges on the same job, and no second slot or delivery can
 * be created for the same key.
 */

import type { StandaloneConfig } from '../config';
import type { Database } from '../storage/Database';
import { cancelConsumerJob } from './JobCancellation';
import { JobEventQuery, JobEventStream } from './JobEventStream';
import {
  buildCapabilities,
  parseTaskBody,
  ProtocolAckResult,
  ProtocolCapabilities,
  ProtocolEventPage,
  ProtocolJob,
} from './JobFacade';
import { JobViewDeps, protocolJobBySlotId, protocolJobForSlot, requireProtocolJobForSlotId } from './JobView';
import { ManualJobAdmission } from './ManualJobAdmission';
import type { JobHandlers } from './ScheduleTriggerServer';

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
  private readonly events: JobEventStream;

  constructor(private readonly deps: ManualJobServiceDeps) {
    this.events = new JobEventStream(this.viewDeps());
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private viewDeps(): JobViewDeps {
    return {
      database: this.deps.database,
      config: this.deps.config,
      now: () => this.now(),
    };
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
    // The admission event (and the declared callback_url) are recorded against
    // the durable slot inside the one shared admission path, so a crash right
    // after admission is repaired by the same reconcile that serves the stream.
    // A replay never rewrites the endpoint the job already declared.
    this.events.reconcile(result.slotId, task.callbackUrl ?? null);
    return { job: this.viewBySlotId(result.slotId), replayed: result.reused };
  }

  jobStatus(jobId: string): ProtocolJob | null {
    return protocolJobBySlotId(this.viewDeps(), jobId);
  }

  jobsByIdempotencyKey(idempotencyKey: string): ProtocolJob[] {
    const slot = this.deps.database.slots.findManualSlotByKey(idempotencyKey);
    return slot ? [protocolJobForSlot(this.viewDeps(), slot)] : [];
  }

  /** `GET /jobs/:jobId/events` — the durable stream, reconciled from the ledger. */
  jobEvents(jobId: string, query: JobEventQuery): ProtocolEventPage {
    return this.events.page(jobId, query);
  }

  /** `POST /jobs/:jobId/events/ack` — O(1) durable cursor write, never a job mutation. */
  ackJobEvents(jobId: string, body: unknown): ProtocolAckResult {
    return this.events.ack(jobId, body);
  }

  /**
   * Idempotent: cancelling an already-terminal job reports its current
   * projection instead of failing. `cancelConsumerJob` owns the one transaction
   * that terminalises the work and stops further deliveries.
   */
  cancelJob(jobId: string): ProtocolJob {
    cancelConsumerJob(this.deps.database, jobId, this.now());
    // The cancellation is now durable, so its terminal event must be too — a
    // consumer that polls after cancelling must never see an unterminated stream.
    this.events.reconcile(jobId);
    return this.viewBySlotId(jobId);
  }

  private viewBySlotId(slotId: string): ProtocolJob {
    return requireProtocolJobForSlotId(this.viewDeps(), slotId);
  }
}
