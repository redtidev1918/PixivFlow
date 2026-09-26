import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { Database } from '../storage/Database';
import { TargetConfig } from '../config';
import { DownloadedArtifact, deliveryFilePaths } from './types';
import { targetDeliveryNames } from './targetRoutes';
import { buildContent } from './content';
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

/** One route of a multi-target fan-out (one external platform). */
export interface RouteResult extends EnqueueResult {
  /** The `delivery.targets` entry this route publishes to. */
  deliveryTarget: string;
}

/**
 * Result of enqueuing one artifact against EVERY delivery target the download
 * target declares. `duplicate` is the AND over all routes: true only when no
 * route still owes a delivery.
 */
export interface FanoutResult {
  routes: RouteResult[];
  /** First route's ledger id ('' when every route was already confirmed). */
  deliveryId: string;
  /** First route's intent key ('' when every route was already confirmed). */
  idempotencyKey: string;
  duplicate: boolean;
  created: boolean;
}

/**
 * Machine-readable terminal verdict of a remote manual replacement ("重抓"),
 * reported back to the requester (TelePost) through the durable outbox.
 * Never contains credentials; ids are the opaque request UUID and Pixiv work ids.
 */
export interface RefetchOutcomePayload {
  requestId: string;
  /** 'no_alternative' | 'failed' (replacement success rides the submission). */
  disposition: 'no_alternative' | 'failed';
  reason?: string;
  workId?: string;
  /** Bounded candidate-scan bookkeeping for diagnostics (spec-compatible). */
  scanned?: number;
  skipped?: {
    total: number;
    duplicate: number;
    invalid: number;
    unavailable: number;
  };
}

/** Terminal SCHEDULE occurrence verdict (success/partial/failed), reported via
 * the durable outbox to TelePost, which relays the user-visible summary. */
export interface ScheduleOutcomePayload {
  scheduleId: string;
  slotId: string;
  status: 'success' | 'partial' | 'failed';
  targets?: Array<{
    targetId: string;
    workType: string;
    status: string;
    workId?: string | null;
    candidateReport?: Record<string, unknown> | null;
  }>;
}

export class DeliveryService {
  constructor(private readonly database: Database) {}

  /** Delivery target name for a target config, or null when it is not a delivery run. */
  static targetName(target: TargetConfig): string | null {
    if (target.storageMode !== 'cache') return null;
    return target.delivery?.target?.trim() || null;
  }

  /**
   * EVERY delivery target this download target fans out to, in stable
   * config-declared order, de-duplicated. `delivery.targets` (the multi-target
   * array) takes precedence over the legacy single `delivery.target`; a target
   * declaring neither resolves to `[]`, which is exactly the pre-multi-target
   * behaviour (no delivery at all).
   *
   * Fan-out happens HERE and only here: each name becomes its own ledger row,
   * outbox row and retry budget, so one platform failing can never fail another.
   */
  static targetNames(target: TargetConfig): string[] {
    return targetDeliveryNames(target);
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

  /**
   * Multi-target preflight: is this work CONFIRMED on EVERY route? False as soon
   * as one route still owes a delivery, so a partially delivered work stays
   * selectable instead of being skipped entirely.
   */
  isDeliveredToAllTargets(deliveryTargets: string[], workType: string, pixivId: string): boolean {
    const names = [...new Set(deliveryTargets.filter((name) => name?.trim()))];
    if (names.length === 0) return false;
    return names.every((name) => this.database.deliveries.isDelivered(name, workType, String(pixivId)));
  }

  /** Batch form for pre-lock candidate filtering. */
  deliveredIds(deliveryTarget: string, workType: string, pixivIds: string[]): Set<string> {
    return this.database.deliveries.deliveredIds(deliveryTarget, workType, pixivIds);
  }

  /** Multi-target batch form: only works confirmed on ALL routes. */
  deliveredIdsForAllTargets(
    deliveryTargets: string[],
    workType: string,
    pixivIds: string[]
  ): Set<string> {
    return this.database.deliveries.deliveredIdsForAllTargets(deliveryTargets, workType, pixivIds);
  }

  /**
   * Bulk CANDIDATE SELECTION dedupe: works already delivered to this target, or
   * whose review submission is still PENDING an answer. A pending work is
   * already submitted for review, so it must not be selected (and submitted)
   * again; the scan moves on to the next candidate instead. Within-slot RESUME
   * keeps using `isAlreadyDelivered` — a cell continuing its OWN pending work is
   * resuming it, not duplicating it.
   */
  submittedIds(deliveryTarget: string, workType: string, pixivIds: string[]): Set<string> {
    return this.database.deliveries.submittedIds(deliveryTarget, workType, pixivIds);
  }

  /** Multi-target batch form: works submitted (or confirmed) on ALL routes. */
  submittedIdsForAllTargets(
    deliveryTargets: string[],
    workType: string,
    pixivIds: string[]
  ): Set<string> {
    return this.database.deliveries.submittedIdsForAllTargets(deliveryTargets, workType, pixivIds);
  }

  /**
   * Atomically create the delivery intent + outbox row and advance the cell, for
   * EVERY delivery target this download target declares.
   *
   * Each route is an independent ledger row, outbox row and retry budget: one
   * platform failing never fails another, and a retry only re-sends the routes
   * that are not yet confirmed. `duplicate` is true only when EVERY route was
   * already confirmed — a work whose second platform still owes a delivery must
   * stay actionable, not be skipped as a duplicate.
   *
   * Missing local artifact files are treated as a recoverable error (the caller
   * re-runs the download); a crash leaves the intent pending for the
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
  ): FanoutResult {
    const deliveryTargets = DeliveryService.targetNames(target);
    if (deliveryTargets.length === 0) {
      throw new Error('enqueue called for a non-delivery (non-cache) target');
    }
    const files = deliveryFilePaths(artifact);
    if (files.length === 0) {
      throw new Error(`no deliverable artifacts produced for ${artifact.type} ${artifact.pixivId}`);
    }
    const missing = files.find((file) => !existsSync(file));
    if (missing) {
      // Crash between download and intent, or cache eviction. Recoverable: the
      // cell stays selected and a resume re-downloads the SAME locked work.
      throw new Error(`artifact file missing before enqueue: ${missing}`);
    }

    const routes = deliveryTargets.map((deliveryTarget) =>
      this.enqueueOne(artifact, target, deliveryTarget, context, files)
    );
    const first = routes[0];
    return {
      // Per-route detail, in config-declared order.
      routes,
      // Backward-compatible single-route projection: the first route's ids, and
      // `duplicate` only when nothing is left owed on ANY route.
      deliveryId: first?.deliveryId ?? '',
      idempotencyKey: first?.idempotencyKey ?? '',
      duplicate: routes.every((route) => route.duplicate),
      created: routes.some((route) => route.created),
    };
  }

  /** One route of a fan-out: the whole atomic intent + outbox + cell sequence. */
  private enqueueOne(
    artifact: DownloadedArtifact,
    target: TargetConfig,
    deliveryTarget: string,
    context: {
      slotId?: string;
      idempotencyKey?: string;
      fields?: Record<string, unknown>;
      extraContext?: Record<string, unknown>;
    },
    files: string[]
  ): RouteResult {
    // Ledger short-circuit: a confirmed fact must never create a new intent.
    if (this.database.deliveries.isDelivered(deliveryTarget, artifact.type, artifact.pixivId)) {
      return { deliveryTarget, deliveryId: '', idempotencyKey: '', duplicate: true, created: false };
    }

    const idempotencyKey =
      context.idempotencyKey ??
      DeliveryService.idempotencyKey(deliveryTarget, artifact, context.slotId, target.id);

    const deliveryContext = {
      ...this.contextFrom(artifact, target, deliveryTarget),
      // The occurrence identity must reach the ADAPTER, not just the ledger
      // column: a gateway uses `slotId` to attribute what it received, and
      // without it the durable payload silently loses which run produced this.
      ...(context.slotId ? { slotId: context.slotId } : {}),
      idempotencyKey,
      ...(context.extraContext ?? {}),
    };

    // The neutral, platform-agnostic content model is frozen INTO the durable
    // payload at enqueue time (durable intent before transport). Adapters read
    // this instead of re-deriving media from downloader structures, and an
    // outbox row enqueued by an older build (no content) still works because
    // providers rebuild it from `files` + `context` when it is absent.
    const content = buildContent({
      context: {
        pixivId: artifact.pixivId,
        type: artifact.type,
        title: artifact.title,
        ...(artifact.spoiler !== undefined ? { spoiler: artifact.spoiler } : {}),
      },
      files,
      previewFiles: artifact.previewFiles,
      mediaAssets: artifact.mediaAssets,
      artifactFacts: artifact.artifacts,
    });
    const payload = {
      files,
      previewFiles: artifact.previewFiles ?? [],
      mediaAssets: artifact.mediaAssets,
      cleanupFiles: artifact.cleanupFiles ?? [],
      fields: context.fields ?? null,
      content,
      context: deliveryContext,
    };

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
            payload,
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
        payload,
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
    return { ...result, deliveryTarget, idempotencyKey };
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
  enqueueNotification(
    deliveryTarget: string,
    text: string,
    idempotencyKey: string,
    refetchOutcome?: RefetchOutcomePayload,
    scheduleOutcome?: ScheduleOutcomePayload
  ): void {
    this.database.outbox.enqueue({
      kind: 'notification',
      deliveryTarget,
      idempotencyKey,
      payload: refetchOutcome
        ? { text, refetchOutcome }
        : scheduleOutcome
          ? { text, scheduleOutcome }
          : { text },
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

  private contextFrom(
    artifact: DownloadedArtifact,
    target: TargetConfig,
    deliveryTarget: string
  ): Record<string, unknown> {
    return {
      deliveryTarget,
      title: artifact.title,
      pixivId: artifact.pixivId,
      type: artifact.type,
      targetId: target.id,
      tag: target.filterTag || target.tag || '',
      topic: target.topic?.trim() || undefined,
      workTags: artifact.tags,
      author: artifact.author,
      spoiler: artifact.spoiler,
      xRestrict: artifact.xRestrict,
      publishedAt: artifact.publishedAt,
      language: artifact.language,
      bookmarkCount: artifact.bookmarkCount,
      viewCount: artifact.viewCount,
    };
  }
}
