import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { Database } from '../storage/Database';
import { TargetConfig } from '../config';
import { DownloadedArtifact } from './types';
import { logger } from '../logger';

/**
 * The single place that turns a downloaded artifact into a durable delivery
 * intent. It atomically:
 *   - inserts (or reuses) the delivery ledger row (pending),
 *   - enqueues the outbox side effect,
 *   - moves the slot cell to delivery_pending.
 * Because all three land in one SQLite transaction, a crash at any point
 * leaves a state with a deterministic recovery (resume), never a false
 * "submitted". Downstream ACK is what later promotes the cell to submitted.
 */
export interface EnqueueResult {
  deliveryId: string;
  idempotencyKey: string;
  /** True when an already-confirmed ledger/fact short-circuited a new intent. */
  duplicate: boolean;
  /** True when this call created a brand new delivery row. */
  created: boolean;
}

export class DeliveryService {
  constructor(private readonly database: Database) {}

  /** Delivery target name for a target config, or null when it is not a delivery run. */
  static targetName(target: TargetConfig): string | null {
    if (target.storageMode !== 'cache') return null;
    return target.delivery?.target?.trim() || null;
  }

  /** Stable per-occurrence intent key, so ACK loss / replays converge to one row. */
  static idempotencyKey(
    deliveryTarget: string,
    artifact: DownloadedArtifact,
    slotId?: string,
    targetId?: string
  ): string {
    const scope = slotId && targetId ? `${slotId}:${targetId}` : 'adhoc';
    return `pixivflow:${deliveryTarget}:${artifact.type}:${artifact.pixivId}:${scope}`;
  }

  /**
   * Delivery-dedup preflight: is this work already CONFIRMED delivered to this
   * target? Runs in the candidate pipeline BEFORE work lock so a historical
   * duplicate is skipped and the next valid candidate is chosen. This is
   * distinct from download dedupe (which only proves local caching).
   */
  isAlreadyDelivered(deliveryTarget: string, workType: string, pixivId: string): boolean {
    return this.database.deliveries.isDelivered(deliveryTarget, workType, String(pixivId));
  }

  /** Batch form for pre-lock candidate filtering. */
  deliveredIds(deliveryTarget: string, workType: string, pixivIds: string[]): Set<string> {
    return this.database.deliveries.deliveredIds(deliveryTarget, workType, pixivIds);
  }

  /**
   * Atomically create the delivery intent + outbox row and advance the cell.
   * Missing local artifact files are treated as a recoverable error (the
   * caller re-runs the download); a crash leaves the intent pending for the
   * OutboxWorker — it never fabricates a submitted cell.
   */
  enqueue(
    artifact: DownloadedArtifact,
    target: TargetConfig,
    context: {
      slotId?: string;
      idempotencyKey?: string;
      fields?: Record<string, unknown>;
      extraContext?: Record<string, unknown>;
    } = {}
  ): EnqueueResult {
    const deliveryTarget = DeliveryService.targetName(target);
    if (!deliveryTarget) {
      throw new Error('enqueue called for a non-delivery (non-cache) target');
    }
    if (artifact.files.length === 0) {
      throw new Error(`no files produced for ${artifact.type} ${artifact.pixivId}`);
    }
    const missing = artifact.files.find((file) => !existsSync(file));
    if (missing) {
      // Crash between download and intent, or cache eviction. Recoverable: the
      // cell stays selected and a resume re-downloads the SAME locked work.
      throw new Error(`artifact file missing before enqueue: ${missing}`);
    }

    // Ledger short-circuit: a confirmed fact must never create a new intent.
    if (this.database.deliveries.isDelivered(deliveryTarget, artifact.type, artifact.pixivId)) {
      return { deliveryId: '', idempotencyKey: '', duplicate: true, created: false };
    }

    const idempotencyKey =
      context.idempotencyKey ??
      DeliveryService.idempotencyKey(deliveryTarget, artifact, context.slotId, target.id);

    const result = this.database.transaction(() => {
      const { row, created } = this.database.deliveries.insertIntent({
        id: randomUUID(),
        deliveryTarget,
        workType: artifact.type,
        pixivId: artifact.pixivId,
        slotId: context.slotId ?? null,
        targetId: target.id ?? null,
        idempotencyKey,
      });

      // Reuse of our own prior intent (ACK lost / duplicate trigger / restart).
      if (!created) {
        if (row.status === 'delivered' || row.status === 'duplicate') {
          return { deliveryId: row.id, duplicate: true, created: false };
        }
        // pending/failed: ensure an outbox row exists (idempotent) and keep the
        // cell recoverable rather than emitting a second side effect.
        this.database.outbox.enqueue(
          {
            kind: 'delivery',
            deliveryTarget,
            idempotencyKey: `outbox:${idempotencyKey}`,
            deliveryId: row.id,
            payload: {
              files: artifact.files,
              cleanupFiles: artifact.cleanupFiles ?? [],
              fields: context.fields ?? null,
              context: { ...this.contextFrom(artifact, target), idempotencyKey, ...(context.extraContext ?? {}) },
            },
          },
          Date.now()
        );
        if (context.slotId && target.id) {
          this.guardCell(context.slotId, target.id, 'delivery_pending');
        }
        return { deliveryId: row.id, duplicate: false, created: false };
      }

      this.database.outbox.enqueue({
        kind: 'delivery',
        deliveryTarget,
        idempotencyKey: `outbox:${idempotencyKey}`,
        deliveryId: row.id,
        payload: {
          files: artifact.files,
          cleanupFiles: artifact.cleanupFiles ?? [],
          fields: context.fields ?? null,
          context: { ...this.contextFrom(artifact, target), idempotencyKey, ...(context.extraContext ?? {}) },
        },
      });

      if (context.slotId && target.id) {
        this.guardCell(context.slotId, target.id, 'delivery_pending');
      }
      return { deliveryId: row.id, duplicate: false, created: true };
    });

    logger.info('Delivery intent enqueued', {
      deliveryId: result.deliveryId,
      deliveryTarget,
      pixivId: artifact.pixivId,
      workType: artifact.type,
      slotId: context.slotId,
      created: result.created,
      idempotencyKey,
    });
    return { ...result, idempotencyKey };
  }

  /**
   * Record a historical downstream fact discovered via reconciliation: a work
   * the remote already published from a different/older intent. Backfills the
   * ledger so it never re-selects the work, and (optionally) settles the cell.
   * This is the ONLY path that accepts a post-lock historical duplicate.
   */
  reconcileHistoricalDuplicate(input: {
    deliveryTarget: string;
    workType: string;
    pixivId: string;
    remoteId?: string;
    remoteStatus?: string;
    slotId?: string;
    targetId?: string;
    reason: string;
  }): { deliveryId: string; created: boolean } {
    const key = `reconcile:${input.deliveryTarget}:${input.workType}:${input.pixivId}`;
    const { row, created } = this.database.deliveries.backfill({
      id: randomUUID(),
      deliveryTarget: input.deliveryTarget,
      workType: input.workType,
      pixivId: input.pixivId,
      slotId: input.slotId ?? null,
      targetId: input.targetId ?? null,
      idempotencyKey: key,
      remoteId: input.remoteId,
      remoteStatus: input.remoteStatus ?? 'duplicate_existing',
    });
    // Mark the backfilled ledger row as an attested historical duplicate.
    if (row.status !== 'duplicate') {
      this.database.deliveries.recordAck(row.id, {
        status: 'duplicate',
        remoteId: input.remoteId,
        remoteStatus: input.remoteStatus ?? 'duplicate_existing',
        reuseReason: input.reason,
      });
    }
    if (input.slotId && input.targetId) {
      this.guardCell(input.slotId, input.targetId, 'duplicate');
    }
    logger.warn('Reconciled historical downstream duplicate', {
      pixivId: input.pixivId,
      workType: input.workType,
      deliveryTarget: input.deliveryTarget,
      remoteId: input.remoteId,
      reason: input.reason,
    });
    return { deliveryId: row.id, created };
  }

  /** Enqueue a durable notification (retried independently; never affects content). */
  enqueueNotification(deliveryTarget: string, text: string, idempotencyKey: string): void {
    this.database.outbox.enqueue({
      kind: 'notification',
      deliveryTarget,
      idempotencyKey,
      payload: { text },
    });
  }

  private guardCell(slotId: string, targetId: string, next: import('../storage/repositories/SlotRepository').CellStatus): void {
    const cell = this.database.slots.getCell(slotId, targetId);
    if (!cell) return;
    if (cell.status === next) return;
    if (cell.status === 'submitted' || cell.status === 'duplicate') return; // never downgrade
    try {
      this.database.slots.transitionCell(slotId, targetId, next);
    } catch (error) {
      logger.debug('Cell transition skipped', { slotId, targetId, from: cell.status, to: next, error: (error as Error).message });
    }
  }

  private contextFrom(artifact: DownloadedArtifact, target: TargetConfig): Record<string, unknown> {
    return {
      title: artifact.title,
      pixivId: artifact.pixivId,
      type: artifact.type,
      targetId: target.id,
      tag: target.filterTag || target.tag || '',
      topic: target.topic?.trim() || undefined,
      workTags: artifact.tags,
      spoiler: artifact.spoiler,
      xRestrict: artifact.xRestrict,
      publishedAt: artifact.publishedAt,
      language: artifact.language,
      bookmarkCount: artifact.bookmarkCount,
      viewCount: artifact.viewCount,
    };
  }
}