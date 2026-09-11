import { Database } from '../storage/Database';
import { DeliveryService } from '../delivery/DeliveryService';
import { ScheduleConfig, StandaloneConfig, TargetConfig } from '../config';
import { TargetOutcome } from '../scheduler/TargetOutcome';
import { SlotContext } from '../scheduler/SlotCoordinator';

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

  /** Stable slot-scoped keys (two occurrences on one date never collide). */
  static keys = {
    noMatch: (slotId: string, targetId: string) => `notification:${slotId}:${targetId}:no-candidate`,
    hardFail: (slotId: string, targetId: string) => `notification:${slotId}:${targetId}:failed`,
    summary: (slotId: string) => `notification:${slotId}:summary`,
    dead: (slotId: string, targetId: string) => `notification:${slotId}:${targetId}:delivery-dead`,
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
    const targets = this.config.delivery?.targets ?? {};
    const notifiable = new Set(
      Object.keys(targets).filter((n) => {
        const target = targets[n];
        return target?.type === 'httpMultipart' && Boolean(target.notificationUrl?.trim());
      })
    );
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
}
