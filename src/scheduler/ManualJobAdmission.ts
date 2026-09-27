/**
 * The ONE admission path for consumer-initiated candidate search work.
 *
 * Two HTTP entry points exist for the same durable work item:
 *   - the legacy TelePost manual refetch (`POST /internal/targets/:id/refetch`)
 *   - the generic Workflow Protocol v1 job surface (`POST /jobs`)
 *
 * They differ only in how the request is shaped, never in what happens: both
 * adapters translate their input into one `CandidateSearchJobRequest` and call
 * `admit()`, which owns target resolution, idempotent identity resolution and
 * the durable slot admission. Identity is the consumer's own key
 * (`manual_request_id`), so a replay from either entry point converges on the
 * same `job_id`/`slotId` and never creates a second slot or delivery.
 *
 * Nothing here inspects the business meaning of a target, a plan or a slot
 * name; a slot label is durable display data and is written, never branched on.
 */

import { ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { primaryDeliveryName } from '../delivery/targetRoutes';
import type { Database } from '../storage/Database';
import type { SlotRecord } from '../storage/repositories/SlotRepository';
import { CandidateSearchParams } from './CandidateSearchParams';
import { ProtocolRequestError } from './ProtocolErrors';
import { selectScheduleTargets } from './schedules';
import type { SlotContext, SlotCoordinator } from './SlotCoordinator';

/**
 * Durable slot label for consumer-initiated candidate search.
 *
 * FROZEN: production ledgers already carry this value on historical rows, and
 * the legacy compatibility contract forbids changing it. It is a display label
 * only — no code may branch on a slot name.
 */
export const MANUAL_CANDIDATE_SEARCH_SLOT_NAME = '审核群重抓';

/**
 * The delivery-template wiring a target must declare for manual work. The
 * field name and placeholder VALUE are the frozen production config contract
 * (deployed delivery templates declare them); this module only reads them.
 */
const DELIVERY_CORRELATION_FIELD = 'refetch_request_id';
const DELIVERY_CORRELATION_PLACEHOLDER = '{{refetchRequestId}}';

/**
 * A consumer-initiated candidate search, normalized from whichever adapter
 * received it. `targetId` exists only for the legacy path (the old endpoint
 * carries the target in its URL); the generic job surface resolves the target
 * from configuration instead, optionally narrowed by `account`.
 */
export interface CandidateSearchJobRequest {
  /** Consumer idempotency key; becomes the durable `manual_request_id`. */
  idempotencyKey: string;
  /** Opaque caller correlation: stored, echoed back, never interpreted. */
  correlationId?: string;
  /** Legacy adapter only: target id taken from the request path. */
  targetId?: string;
  /** Generic adapter only: `params.source.account` resource identity. */
  account?: string;
  /**
   * Generic adapter only: the requested retrieval view (§6). Persisted with the
   * occurrence-scoped slot so a resumed worker re-applies it; the legacy adapter
   * never sets it, so a refetch keeps running the plan exactly as configured.
   */
  params?: CandidateSearchParams;
}

/** What happened to the request, independent of which adapter asked. */
export type ManualJobDisposition = 'accepted' | 'queued' | 'already_completed';

export interface CandidateSearchJobResult {
  /** The durable identity of the work item (`job_id`). */
  slotId: string;
  planId: string;
  targetId: string;
  disposition: ManualJobDisposition;
  /** True when an existing slot owned this key (an idempotent replay). */
  reused: boolean;
}

export interface ManualJobAdmissionDeps {
  database: Database;
  coordinator: SlotCoordinator;
  /** The live config snapshot (the trigger server always reads the newest). */
  config(): StandaloneConfig;
  /** Hand the prepared occurrence to execution; returns false when queued. */
  admit(planId: string, context: SlotContext, targetId: string): boolean;
}

/** One (plan, target) pair that can serve manual candidate search. */
interface AdmissionTarget {
  plan: ScheduleConfig;
  target: TargetConfig;
  /** The target's id, guaranteed non-empty by resolution. */
  targetId: string;
}

export class ManualJobAdmission {
  constructor(private readonly deps: ManualJobAdmissionDeps) {}

  /**
   * Resolve, admit and report one consumer-initiated candidate search.
   *
   * Idempotent by `idempotencyKey`: the first call creates the durable slot,
   * every later call (from either entry point) returns the same `slotId`.
   * Throws `ProtocolRequestError` so every adapter answers in the protocol's
   * error shape while the legacy adapter keeps its historic message strings.
   */
  admit(request: CandidateSearchJobRequest): CandidateSearchJobResult {
    const key = (request.idempotencyKey ?? '').trim();
    if (!key) {
      throw new ProtocolRequestError('invalid_params', 400, {
        message: 'idempotency_key must be a non-empty string',
      });
    }
    const legacy = request.targetId !== undefined;
    const config = this.deps.config();
    this.assertAccount(config, request.account);
    const admission = this.resolveTarget(config, request.targetId);
    const { plan, target } = admission;
    this.assertParamsApplyToTarget(target, request.params);

    const derivedSlotId = `${plan.id}@manual-${key.toLowerCase()}`;
    const existing = this.resolveExisting(plan, admission.targetId, key, derivedSlotId, legacy);
    const slotId = existing ? existing.id : derivedSlotId;
    if (existing) this.assertSameParams(existing, request.params, legacy);

    const context = this.buildContext(plan, slotId, key, request.correlationId, request.params);
    const prepared = this.deps.coordinator.prepare(context, plan, [target]);
    if (prepared.alreadyCompleted) {
      return {
        slotId: prepared.slotRec.id,
        planId: plan.id,
        targetId: admission.targetId,
        disposition: 'already_completed',
        reused: true,
      };
    }
    const started = this.deps.admit(plan.id, context, admission.targetId);
    return {
      slotId: context.slotId,
      planId: plan.id,
      targetId: admission.targetId,
      disposition: started ? 'accepted' : 'queued',
      reused: existing !== null,
    };
  }

  /**
   * `params.source.account` names the Pixiv resource identity. One process owns
   * exactly one credential profile, so the only satisfiable value is the
   * configured one; anything else is refused rather than silently downgraded to
   * a different account.
   */
  private assertAccount(config: StandaloneConfig, requested: string | undefined): void {
    if (requested === undefined) return;
    const configured = (config.pixiv?.accountId ?? '').trim() || 'default';
    const wanted = requested.trim() || 'default';
    if (wanted !== configured) {
      throw new ProtocolRequestError('invalid_params', 400, {
        message: `account '${wanted}' is not available in this deployment`,
        detail: { reason: 'account_unavailable', requested: wanted, configured },
      });
    }
  }

  /**
   * Legacy: the target comes from the URL and must resolve to exactly one
   * enabled plan (the historic `unknown target` / `ambiguous target` rules).
   * Generic: the target is discovered from configuration — every enabled plan's
   * selected target that actually wires manual candidate-search delivery.
   */
  private resolveTarget(config: StandaloneConfig, targetId: string | undefined): AdmissionTarget {
    if (targetId !== undefined) {
      const plans = (config.schedules ?? []).filter(
        (plan) =>
          plan.enabled !== false &&
          selectScheduleTargets(config.targets, plan).some((target) => target.id === targetId)
      );
      if (plans.length === 0) {
        throw new ProtocolRequestError('invalid_params', 404, {
          message: 'unknown target',
          detail: { reason: 'unknown_target', target_id: targetId },
        });
      }
      if (plans.length !== 1) {
        throw new ProtocolRequestError('invalid_params', 409, {
          message: 'ambiguous target',
          detail: { reason: 'ambiguous_target', target_id: targetId },
        });
      }
      const plan = plans[0];
      const target = selectScheduleTargets(config.targets, plan).find(
        (item) => item.id === targetId && Boolean(item.id)
      );
      if (!target || !target.id) {
        throw new ProtocolRequestError('invalid_params', 404, {
          message: 'unknown target',
          detail: { reason: 'unknown_target', target_id: targetId },
        });
      }
      this.assertManualWiring(config, target, target.id, true);
      return { plan, target, targetId: target.id };
    }

    const candidates: AdmissionTarget[] = [];
    for (const plan of config.schedules ?? []) {
      if (plan.enabled === false) continue;
      for (const target of selectScheduleTargets(config.targets, plan)) {
        if (!target.id) continue;
        if (targetServesManualCandidateSearch(config, target)) {
          candidates.push({ plan, target, targetId: target.id });
        }
      }
    }
    if (candidates.length === 0) {
      throw new ProtocolRequestError('invalid_params', 400, {
        message: 'no candidate search target is configured',
        detail: { reason: 'no_eligible_target' },
      });
    }
    if (candidates.length > 1) {
      throw new ProtocolRequestError('invalid_params', 409, {
        message: 'more than one candidate search target is configured',
        detail: {
          reason: 'ambiguous_target',
          targets: candidates.map((candidate) => candidate.targetId),
        },
      });
    }
    return candidates[0];
  }

  /**
   * Idempotent identity resolution. The key is the durable identity; the
   * plan-derived slot id is only the legacy naming convention. A key that
   * already belongs to different work is a conflict, never a second slot.
   */
  private resolveExisting(
    plan: ScheduleConfig,
    targetId: string,
    key: string,
    derivedSlotId: string,
    legacy: boolean
  ): SlotRecord | null {
    const byKey = this.deps.database.slots.findManualSlotByKey(key);
    if (byKey) {
      this.assertSameWork(byKey, plan, targetId, legacy);
      return byKey;
    }
    const byId = this.deps.database.slots.getSlot(derivedSlotId);
    if (!byId) return null;
    if (byId.manualRequestId && byId.manualRequestId !== key) {
      throw this.conflict(
        legacy,
        `idempotency key '${key}' collides with an existing work item`,
        { reason: 'idempotency_conflict', slot_id: byId.id }
      );
    }
    this.assertSameWork(byId, plan, targetId, legacy);
    return byId;
  }

  /**
   * §3: reusing an idempotency key with DIFFERENT params is a conflict, never a
   * silent second meaning for the same job. The comparison is skipped when
   * either side carries no retrieval view (the legacy adapter never sets one),
   * so a legacy replay of a generic job stays idempotent instead of conflicting.
   */
  private assertSameParams(
    slot: SlotRecord,
    params: CandidateSearchParams | undefined,
    legacy: boolean
  ): void {
    if (!params || !slot.paramsJson) return;
    if (slot.paramsJson === JSON.stringify(params)) return;
    throw this.conflict(legacy, 'idempotency key was first used with different params', {
      reason: 'idempotency_conflict',
      slot_id: slot.id,
    });
  }

  /** A key may not be reused for a different plan/target than it first created. */
  private assertSameWork(
    slot: SlotRecord,
    plan: ScheduleConfig,
    targetId: string,
    legacy: boolean
  ): void {
    const sameTarget =
      slot.targetIds.length === 1 && slot.targetIds[0] === targetId && slot.scheduleId === plan.id;
    if (sameTarget) return;
    if (!legacy) {
      throw this.conflict(legacy, 'idempotency key already belongs to another work item', {
        reason: 'idempotency_conflict',
        slot_id: slot.id,
      });
    }
    throw new ProtocolRequestError('invalid_params', 409, {
      message: 'ambiguous target',
      detail: { reason: 'ambiguous_target', slot_id: slot.id },
    });
  }

  private conflict(
    legacy: boolean,
    message: string,
    detail: Record<string, unknown>
  ): ProtocolRequestError {
    if (legacy) {
      return new ProtocolRequestError('invalid_params', 409, {
        message: 'ambiguous target',
        detail: { ...detail, reason: 'ambiguous_target' },
      });
    }
    return new ProtocolRequestError('idempotency_conflict', 409, { message, detail });
  }

  /** Legacy messages are preserved verbatim: deployed clients match on them. */
  private assertManualWiring(
    config: StandaloneConfig,
    target: TargetConfig,
    targetId: string,
    legacy: boolean
  ): void {
    const deliveryName = primaryDeliveryName(target);
    const delivery = deliveryName ? config.delivery?.targets?.[deliveryName] : undefined;
    if (delivery?.type !== 'httpMultipart' || !delivery.refetchOutcomeUrl?.trim()) {
      throw new ProtocolRequestError('internal_error', 500, {
        message: legacy
          ? 'refetch outcome endpoint not configured'
          : 'candidate search delivery outcome is not configured',
        detail: { reason: 'delivery_outcome_not_configured', target_id: targetId },
      });
    }
    const field =
      target.delivery?.fields?.[DELIVERY_CORRELATION_FIELD] ??
      delivery.fields?.[DELIVERY_CORRELATION_FIELD];
    if (field !== DELIVERY_CORRELATION_PLACEHOLDER) {
      throw new ProtocolRequestError('internal_error', 500, {
        message: legacy
          ? 'refetch_request_id delivery field not configured'
          : 'candidate search delivery correlation field is not configured',
        detail: { reason: 'delivery_correlation_field_not_configured', target_id: targetId },
      });
    }
  }

  /**
   * `constraints.work_types` restricts the work type this job accepts. The
   * producer knows the resolved target's own type, so a request that asks for a
   * type the target does not produce is refused instead of silently widened.
   */
  private assertParamsApplyToTarget(
    target: TargetConfig,
    params: CandidateSearchParams | undefined
  ): void {
    const workTypes = params?.constraints?.work_types;
    if (!workTypes || workTypes.length === 0) return;
    if (!workTypes.includes(target.type)) {
      throw new ProtocolRequestError('invalid_params', 400, {
        message: `work_types ${JSON.stringify(workTypes)} does not include the configured target work type`,
        detail: { reason: 'work_type_not_available', target_type: target.type },
      });
    }
  }

  /** Build the occurrence this work item occupies — the same shape as before. */
  private buildContext(
    plan: ScheduleConfig,
    slotId: string,
    key: string,
    correlationId: string | undefined,
    params: CandidateSearchParams | undefined
  ): SlotContext {
    const now = new Date();
    const timezone = plan.timezone ?? 'UTC';
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return {
      slotId,
      scheduleId: plan.id,
      occurrenceAt: now.getTime(),
      occurrenceDate: date,
      occurrenceLabel: 'manual',
      timezone,
      triggerSource: 'manual',
      slotName: MANUAL_CANDIDATE_SEARCH_SLOT_NAME,
      slotDate: date,
      manualRequestId: key,
      correlationId: correlationId || undefined,
      paramsJson: params ? JSON.stringify(params) : undefined,
    };
  }
}

/** Exported for tests/diagnostics: does this target serve manual candidate search? */
export function targetServesManualCandidateSearch(
  config: StandaloneConfig,
  target: TargetConfig
): boolean {
  const deliveryName = primaryDeliveryName(target);
  const delivery = deliveryName ? config.delivery?.targets?.[deliveryName] : undefined;
  if (!deliveryName || !delivery) return false;
  if (delivery.type !== 'httpMultipart' || !delivery.refetchOutcomeUrl?.trim()) return false;
  const field =
    target.delivery?.fields?.[DELIVERY_CORRELATION_FIELD] ??
    delivery.fields?.[DELIVERY_CORRELATION_FIELD];
  return field === DELIVERY_CORRELATION_PLACEHOLDER;
}
