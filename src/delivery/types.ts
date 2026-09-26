import { DeliveryFieldValue } from '../config';
import type { MediaAsset } from '../domain/media/MediaAsset';
import { type Artifact } from '../domain/media/Artifact';

export type DeliveryItemType = 'illustration' | 'novel';

/**
 * One materialized/resolved Pixiv work.
 *
 * `artifacts` is the canonical file fact. There is intentionally no legacy
 * `files[]` projection here anymore: delivery providers receive paths through
 * `deliveryFilePaths`, which always derives them from `artifacts` (and keeps
 * historically enqueued payloads untouched).
 */
export interface DownloadedArtifact {
  pixivId: string;
  type: DeliveryItemType;
  title: string;
  /**
   * Pixiv author (artist) display name, when the API response carried one.
   *
   * Attribution is part of the artifact, not a downloader-private detail: a
   * publishing provider renders it into its own submission fields
   * (TelePost: `source_label`/caption署名), and the delivery layer must never
   * re-derive it by re-reading the `downloads` table.
   */
  author?: string;
  /** Pixiv tags attached to the concrete work (not the configured search topic). */
  tags?: string[];
  /** Canonical materialized file facts. */
  artifacts?: Artifact[];
  /** Optional per-file lightweight preview sources, aligned with the deliverable files. */
  previewFiles?: string[];
  /** Canonical media facts for the work (remote source, stable id). */
  mediaAssets?: MediaAsset[];
  /** Local sidecars deleted with cache files after successful delivery. */
  cleanupFiles?: string[];
  /** R-18 work (x_restrict > 0): delivery templates may open Telegram spoiler. */
  spoiler?: boolean;
  /** Raw Pixiv content restriction level: 0 = all-ages, 1 = R-18, 2 = R-18G. */
  xRestrict?: number;
  /** Pixiv publish timestamp (create_date, ISO) — rendered as {{publishedDate}}. */
  publishedAt?: string;
  /** Detected language label for novels (e.g. "Chinese (Mandarin) (cmn)"). */
  language?: string;
  /** Pixiv bookmark count (popularity signal). */
  bookmarkCount?: number;
  /** Pixiv view count (popularity signal). */
  viewCount?: number;
}

/**
 * Delivery file paths derived from canonical artifacts.
 *
 * The rule mirrors the pre-migration transport contract exactly:
 * novels ship their text (plus ZIP when present), illustrations ship their
 * original media. Metadata, markdown-only sidecars and preview/delivery
 * variants are never sent as independent Telegram attachments.
 */
export function deliveryFilePaths(artifact: DownloadedArtifact): string[] {
  const chosen: string[] = [];
  for (const item of artifact.artifacts ?? []) {
    const deliverable =
      item.variant === 'text' ||
      item.variant === 'zip' ||
      (artifact.type === 'illustration' && item.variant === 'original');
    if (!deliverable) continue;
    const path = item.path.trim();
    if (path && !chosen.includes(path)) chosen.push(path);
  }
  if (chosen.length > 0) return chosen;

  // Recovery-only fallback: files discovered on disk before the DB record
  // (no artifact metadata exists to rebuild a canonical projection).
  const mediaPaths = (artifact.mediaAssets ?? [])
    .map((asset) => asset.artifactId?.trim())
    .filter((path): path is string => Boolean(path));
  return [...new Set(mediaPaths)];
}

export interface DeliveryContext {
  title: string;
  pixivId: string;
  type: DeliveryItemType;
  /**
   * The `delivery.targets` route this delivery publishes to (e.g. "tg-review",
   * "qq-main"). One work fans out to one outbox row per route, so an adapter can
   * always tell which configured platform it is serving.
   */
  deliveryTarget?: string;
  /** The PixivFlow target id (e.g. "bot1-illust-tag-a") that produced this work. */
  targetId?: string;
  tag?: string;
  topic?: string;
  workTags?: string[];
  /** Pixiv author display name — rendered as {{author}}; empty when unknown. */
  author?: string;
  spoiler?: boolean;
  /** Raw Pixiv x_restrict value; kept separate from the channel spoiler policy. */
  xRestrict?: number;
  /** Ranking/list day in YYYY-MM-DD (JST) — which day's hot works this is. */
  rankingDate?: string;
  /** Pixiv publish date, ISO — when the work was released. */
  publishedAt?: string;
  /** Detected language label for novels. */
  language?: string;
  /** Pixiv bookmark count — rendered as {{bookmarkCount}}. */
  bookmarkCount?: number;
  /** Pixiv view count — rendered as {{viewCount}}. */
  viewCount?: number;
  /**
   * Request UUID of the remote manual replacement ("重抓") that produced this
   * delivery; EMPTY for scheduled/original runs. The receiving service uses it
   * to correlate the review with its durable refetch attempt.
   */
  refetchRequestId?: string;
  /**
   * Generic schedule-execution provenance. Attached to scheduled runs only
   * (absent for ad-hoc/manual runs). Delivery-agnostic: any adapter may surface
   * these to its endpoint; they are never parsed by PixivFlow Core.
   */
  scheduleId?: string;
  /** Durable occurrence identity (same as slotId); the stable execution ref. */
  executionId?: string;
  /** Canonical scheduled fire time, ISO-8601 with the schedule tz offset. */
  occurrenceAt?: string;
  /** Why the run started: cron | http | manual | catchup. */
  triggerSource?: string;
  /**
   * Occurrence-scoped intent key (e.g. pixivflow:<target>:<type>:<id>:<slot>:<targetId>).
   * Sent downstream as idempotency_key so an ACK-loss retry carrying the SAME
   * key converges to one remote record (idempotent_replay), distinct from a
   * historical duplicate of the same work from a different occurrence.
   */
  idempotencyKey?: string;
  /** Schedule slot provenance for review-source labelling (external/scheduled runs). */
  slotId?: string;
  slotName?: string;
  slotDate?: string;
}

export interface DeliveryRequest {
  /** Transport file paths, derived from canonical artifacts before enqueue. */
  files: string[];
  /** Optional per-file preview sources, aligned with ``files``. */
  previewFiles?: string[];
  /**
   * Optional explicit text body. When absent the neutral content model derives
   * one from the work title plus its canonical Pixiv link.
   */
  caption?: string;
  /**
   * Neutral platform-agnostic content frozen at enqueue time. Adapters plan
   * their platform messages from THIS (see `content.ts`); when it is absent
   * (a row enqueued by an older build) they rebuild it from the paths below.
   */
  content?: import('./content').Content;
  fields?: Record<string, DeliveryFieldValue>;
  /** Optional canonical media facts sent to providers that understand them. */
  mediaAssets?: MediaAsset[];
  context: DeliveryContext;
}

import type { DeliveryAck } from './DeliveryAck';

export interface DeliveryResult {
  status?: number;
  body?: unknown;
  /** Normalized business acknowledgement (present on delivery attempts). */
  ack?: DeliveryAck;
}

export interface DeliveryNotificationRequest {
  text: string;
  idempotencyKey: string;
  /**
   * Optional structured remote-manual-replacement verdict. When present the
   * delivery sends a JSON body to the target's `refetchOutcomeUrl` instead of
   * a plain text notification to `notificationUrl` (auth reuses `headers`).
   */
  refetchOutcome?: {
    requestId: string;
    disposition: 'no_alternative' | 'failed';
    reason?: string;
    workId?: string;
    scanned?: number;
    skipped?: { total: number; duplicate: number; invalid: number; unavailable: number };
  };
  /**
   * Structured terminal schedule verdict for a SCHEDULED occurrence. When
   * present the delivery posts JSON to `scheduleOutcomeUrl` instead of
   * `notificationUrl` (auth reuses `headers`).
   */
  scheduleOutcome?: {
    scheduleId: string;
    slotId: string;
    status: 'success' | 'partial' | 'failed';
    /**
     * Present when this terminal outcome belongs to a MANUAL RECOVERY run
     * (§manual-recovery): the request id and the policy preset used. Lets the
     * receiving service render "已恢复" instead of the daily summary.
     */
    recovery?: {
      mode: 'normal' | 'relaxed';
      requestId: string;
    };
    targets?: Array<{
      targetId: string;
      workType: string;
      status: string;
      workId?: string | null;
      /** Raw cell error (request-level observability; NOT user-safe text). */
      error?: string | null;
      /** Normalized terminal failure code (§terminal-reason). */
      terminal_reason_code?: string | null;
      /** User-facing business reason message for the failure. */
      reason?: string | null;
      stage?: string | null;
      /** Whether a later/manual attempt may succeed; terminal does not mean auto-retry pending. */
      retryable?: boolean | null;
      operator_hint?: string | null;
      /** Phase 1 Candidate Supply Report ({fetched, selected, rejected, reasons}). */
      candidate_report?: Record<string, unknown> | null;
    }>;
  };
}

export interface DeliveryProvider {
  deliver(request: DeliveryRequest): Promise<DeliveryResult>;
  /** One notification attempt; the durable outbox owns retries. */
  notify?(request: DeliveryNotificationRequest): Promise<DeliveryResult>;
}
