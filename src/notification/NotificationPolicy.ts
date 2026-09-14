import { Database } from '../storage/Database';
import { DeliveryService, RefetchOutcomePayload } from '../delivery/DeliveryService';
import { ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { TargetOutcome } from '../scheduler/TargetOutcome';
import { SlotContext } from '../scheduler/SlotCoordinator';
import { logger } from '../logger';

/**
 * Central policy for all operational notifications. Handlers/scheduler do not
 * decide how or when to notify — they emit domain outcomes and this policy
 * turns them into durable outbox notifications (kind=notification).
 *
 * Every key is anchored to the SLOT identity (slotId), never target+date: the
 * 10:00 and 18:00 occurrences of one day have distinct slotIds and therefore
 * distinct notifications. Notification failure never changes a content result.
 */
export class NotificationPolicy {
  constructor(
    private readonly database: Database,
    private readonly config: StandaloneConfig
  ) {}

  private targetName(target: TargetConfig): string | null {
    return target.delivery?.target?.trim() || null;
  }

  /**
   * Delivery targets that can actually RECEIVE an operational notification.
   *
   * `delivery.target` names a SUBMISSION endpoint (multipart POST of a work).
   * Only targets that also declare a `notificationUrl` accept notifications —
   * the same rule `config/validation.ts` enforces for `noMatchPolicy.notify`
   * and that `docs/CONFIG.md` documents. A submission endpoint without one
   * rejects every notification, so enqueuing to it would only grow an outbox
   * row that can never be delivered.
   */
  private notifiableTargets(): Set<string> {
    const targets = this.config.delivery?.targets ?? {};
    return new Set(
      Object.keys(targets).filter((name) => {
        const target = targets[name];
        return target?.type === 'httpMultipart' && Boolean(target.notificationUrl?.trim());
      })
    );
  }

  /** Stable slot-scoped keys (two occurrences on one date never collide). */
  static keys = {
    noMatch: (slotId: string, targetId: string) => `notification:${slotId}:${targetId}:no-candidate`,
    hardFail: (slotId: string, targetId: string) => `notification:${slotId}:${targetId}:failed`,
    summary: (slotId: string) => `notification:${slotId}:summary`,
    dead: (slotId: string, targetId: string) => `notification:${slotId}:${targetId}:delivery-dead`,
    refetchOutcome: (slotId: string, targetId: string) => `refetch-outcome:${slotId}:${targetId}`,
  };

  noteOutcome(
    slotId: string,
    slot: SlotContext,
    schedule: ScheduleConfig,
    target: TargetConfig,
    outcome: TargetOutcome
  ): void {
    const name = this.targetName(target);
    if (!name) return;
    // No notifiable endpoint configured: drop the notification instead of
    // enqueuing it against a submission target that will reject it forever.
    if (!this.notifiableTargets().has(name)) return;
    const label = target.id || target.filterTag || target.tag || target.type;

    if (outcome.kind === 'no_candidate' && target.noMatchPolicy?.notify === true) {
      this.send(name, NotificationPolicy.keys.noMatch(slotId, target.id ?? label), [
        '⚠️ PixivFlow 本次没有可投稿内容',
        `计划：${schedule.name?.trim() || schedule.id} · ${slot.occurrenceLabel}`,
        `目标：${label}（${target.type === 'novel' ? '小说' : '插画'}）`,
        `原因：${outcome.reason.slice(0, 160)}`,
        '处理结果：未创建空投稿；下次定时任务继续执行。',
      ].join('\n'));
    }

    if (outcome.kind === 'failed' && !outcome.retryable) {
      this.send(name, NotificationPolicy.keys.hardFail(slotId, target.id ?? label), [
        '❌ PixivFlow 本次处理失败',
        `计划：${schedule.name?.trim() || schedule.id} · ${slot.occurrenceLabel}`,
        `目标：${label}（${target.type === 'novel' ? '小说' : '插画'}）`,
        `错误：${outcome.error.slice(0, 200)}`,
      ].join('\n'));
    }
  }

  /** One consolidated summary per slot, delivered to every notifying target's endpoint. */
  sendSlotSummary(
    slot: SlotContext,
    schedule: ScheduleConfig,
    rows: Array<{ targetId: string; label: string; workType: string; status: string; workId: string | null; error: string | null }>
  ): void {
    const notifiable = this.notifiableTargets();
    if (notifiable.size === 0 || rows.length === 0) return;

    const icon = (s: string) =>
      s === 'submitted' ? '✅' : s === 'no_candidate' ? '⚠️' : s === 'duplicate' ? '♱' : s === 'delivery_pending' ? '🕓' : '❌';
    const lines = rows.map((r) =>
      `${icon(r.status)} ${r.label}（${r.workType === 'novel' ? '小说' : '插画'}）` +
      (r.workId ? ` #${r.workId}` : '') +
      (r.status === 'delivery_pending' ? ' 投递中' : '') +
      (r.status === 'no_candidate' ? ' 无候选' : '') +
      (r.status === 'failed' && r.error ? ` ${r.error.slice(0, 120)}` : '')
    );
    const submitted = rows.filter((r) => r.status === 'submitted').length;
    const text = [
      `${schedule.name?.trim() || schedule.id} · ${slot.occurrenceLabel}`,
      ...lines,
      `结果：${submitted === rows.length ? 'success' : submitted > 0 ? 'partial' : 'failed'}（${submitted}/${rows.length} 已确认投递）`,
    ].join('\n');

    const service = new DeliveryService(this.database);
    for (const name of notifiable) {
      service.enqueueNotification(name, text, NotificationPolicy.keys.summary(slot.slotId));
    }
  }

  private send(targetName: string, key: string, text: string): void {
    try {
      new DeliveryService(this.database).enqueueNotification(targetName, text, key);
    } catch (error) {
      // Durable enqueue failure must not unwind the content run.
      // eslint-disable-next-line no-console
      console.warn('notification enqueue failed', { targetName, key, error: (error as Error).message });
    }
  }

  /**
   * Report the terminal verdict of a REMOTE MANUAL replacement ("重抓") back to
   * the requester through the durable outbox. Only terminal outcomes are
   * reported (no_candidate / non-retryable failed); a successful replacement is
   * correlated by the submission itself (its payload carries the request id).
   *
   * The key is anchored to the manual SLOT, so a slot recovered and re-run can
   * never enqueue a second verdict for the same logical attempt, and helpers
   * that already returned remain idempotent.
   */
  noteRefetchOutcome(
    slot: Pick<SlotContext, 'slotId'>,
    _schedule: ScheduleConfig,
    target: TargetConfig,
    requestId: string,
    outcome: TargetOutcome
  ): void {
    const name = this.targetName(target);
    if (!name) return;
    const deliveryTarget = this.config.delivery?.targets?.[name];
    if (!deliveryTarget || deliveryTarget.type !== 'httpMultipart') return;
    if (!deliveryTarget.refetchOutcomeUrl?.trim()) {
      // No endpoint configured: skip the report (content is still durable).
      logger.info('Refetch outcome not reported: refetchOutcomeUrl unset', {
        slot: slot.slotId,
        target: target.id,
        requestId,
      });
      return;
    }

    let payload: RefetchOutcomePayload;
    if (outcome.kind === 'no_candidate' || outcome.kind === 'duplicate') {
      payload = {
        requestId,
        disposition: 'no_alternative',
        reason: outcome.reason,
        workId: outcome.kind === 'duplicate' ? outcome.workId : undefined,
        ...scanCounts(outcome.scan),
      };
    } else if (outcome.kind === 'failed' && !outcome.retryable) {
      payload = {
        requestId,
        disposition: 'failed',
        reason: outcome.error,
        ...scanCounts(outcome.scan),
      };
    } else {
      return; // not terminal for refetch purposes
    }

    try {
      new DeliveryService(this.database).enqueueNotification(
        name,
        `refetch outcome: ${payload.disposition} (slot ${slot.slotId})`,
        NotificationPolicy.keys.refetchOutcome(slot.slotId, target.id ?? target.type),
        payload
      );
      logger.info('Refetch outcome enqueued for report', {
        slot: slot.slotId,
        target: target.id,
        requestId,
        disposition: payload.disposition,
      });
    } catch (error) {
      // A failed VERDICT report never changes the terminal content state; it is
      // retried by the operator/resume path, and never unwinds the run.
      logger.warn('Refetch outcome report enqueue failed', {
        slot: slot.slotId,
        target: target.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Report the durable terminal cell, including failures finalized after retry exhaustion. */
  noteTerminalRefetchCell(slotId: string, targetId: string): void {
    const slot = this.database.slots.getSlot(slotId);
    const cell = this.database.slots.getCell(slotId, targetId);
    if (!slot?.manualRequestId || !cell) return;
    const target = this.config.targets.find((item) => item.id === targetId);
    if (!target) return;
    const outcome: TargetOutcome | null = cell.status === 'no_candidate'
      ? { kind: 'no_candidate', reason: cell.lastError ?? 'no eligible candidate' }
      : cell.status === 'duplicate'
        ? { kind: 'duplicate', workId: cell.workId ?? '', reason: cell.lastError ?? 'historical duplicate' }
        : cell.status === 'failed'
          ? { kind: 'failed', retryable: false, error: cell.lastError ?? slot.lastError ?? 'manual refetch failed' }
          : null;
    if (outcome) this.noteRefetchOutcome(
      { slotId }, { id: slot.scheduleId } as ScheduleConfig, target, slot.manualRequestId, outcome
    );
  }
}

/** Fold a CandidateScanSummary into the refetch-outcome bookkeeping (bounded). */
function scanCounts(
  scan: import('../scheduler/TargetOutcome').CandidateScanSummary | undefined
): {
  scanned?: number;
  skipped?: { total: number; duplicate: number; invalid: number; unavailable: number };
} {
  if (!scan) return {};
  const skipped = scan.skipped ?? [];
  const duplicate = skipped.filter((s) => s.code === 'duplicate').length;
  const unavailable = skipped.filter((s) => s.code === 'unavailable').length;
  const invalid = skipped.filter((s) =>
    ['deleted', 'access_denied', 'unsupported_media', 'invalid_metadata', 'filtered'].includes(s.code)
  ).length;
  return {
    scanned: scan.attempted,
    skipped: {
      total: skipped.length,
      duplicate,
      invalid,
      unavailable,
    },
  };
}
