import type { TargetConfig } from '../config';
import type { IDatabase } from '../interfaces/IDatabase';
import type { CandidateSupplyReport } from '../scheduler/TargetOutcome';

/** Defaults and bounds for the optional Phase 5 inventory. */
export interface InventoryPolicy {
  enabled: boolean;
  maxAgeDays: number;
  reserveSize: number;
  fallback: boolean;
}

export function inventoryPolicy(target: TargetConfig): InventoryPolicy {
  const cfg = target.topicProfile?.inventory;
  return {
    enabled: cfg?.enabled === true,
    maxAgeDays: cfg?.maxAgeDays ?? 30,
    reserveSize: Math.min(Math.max(cfg?.reserveSize ?? 20, 1), 100),
    fallback: cfg?.fallback ?? true,
  };
}

export function inventoryTopic(target: TargetConfig): string {
  return (target.topicProfile?.primary?.[0] ?? target.topic ?? '').trim();
}

export function inventoryTargetId(target: TargetConfig): string {
  return target.id ?? inventoryTopic(target);
}

/**
 * Phase 5: after a topic scan yields eligible works that were NOT delivered by
 * this run's lookback loop, upsert them as idle pending inventory. Works that
 * are already recorded as downloaded/delivered are skipped by the caller
 * upstream (selectWorks already removed download-history rows); this method is
 * deliberately idempotent.
 */
export function recordInventoryCandidates(
  database: IDatabase,
  target: TargetConfig,
  topic: string,
  date: string,
  works: Array<{ id: number; type?: string }>,
  workType: 'illustration' | 'novel'
): void {
  const policy = inventoryPolicy(target);
  if (!policy.enabled) return;
  const targetId = inventoryTargetId(target);
  for (const work of works) {
    const id = String(work?.id);
    if (!id) continue;
    database.candidateInventory.upsert({
      pixivId: id,
      workType,
      topic,
      targetId,
      snapshot: work,
      date,
      maxAgeDays: policy.maxAgeDays,
    });
  }
}

/** Enrich a candidate report with the durable pending-count snapshot. */
export function attachInventoryReport(
  database: IDatabase,
  target: TargetConfig,
  topic: string,
  report: CandidateSupplyReport
): CandidateSupplyReport {
  const policy = inventoryPolicy(target);
  if (!policy.enabled) return report;
  const summary = database.candidateInventory.pendingSummary(topic, inventoryTargetId(target));
  return {
    ...report,
    inventory: {
      pendingCount: summary.count,
      reserveSize: policy.reserveSize,
      maxAgeDays: policy.maxAgeDays,
      oldestSeenDate: summary.oldestSeenDate,
    },
  };
}

/** Marks a claimed inventory row after a delivery attempt. */
export function markInventoryAttempt(
  database: IDatabase,
  target: TargetConfig,
  topic: string,
  workId: string,
  workType: 'illustration' | 'novel',
  outcome: 'submitted' | 'filtered' | 'pending'
): void {
  if (!inventoryPolicy(target).enabled) return;
  const targetId = inventoryTargetId(target);
  const repo = database.candidateInventory;
  if (outcome === 'submitted') repo.markSubmitted(workId, workType, topic, targetId);
  else if (outcome === 'filtered') repo.markFiltered(workId, workType, topic, targetId);
  else repo.markSelectedBackToPending(workId, workType, topic, targetId);
}
