import { DeliveryFieldValue } from '../config';

export type DeliveryItemType = 'illustration' | 'novel';

/** Files produced for one Pixiv work and needed by a delivery provider. */
export interface DownloadedArtifact {
  pixivId: string;
  type: DeliveryItemType;
  title: string;
  /** Pixiv tags attached to the concrete work (not the configured search topic). */
  tags?: string[];
  /** Files sent to the configured delivery target. */
  files: string[];
  /** Optional per-file lightweight preview sources, aligned with ``files``. */
  previewFiles?: string[];
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

export interface DeliveryContext {
  title: string;
  pixivId: string;
  type: DeliveryItemType;
  /** The PixivFlow target id (e.g. "bot1-illust-tag-a") that produced this work. */
  targetId?: string;
  tag?: string;
  topic?: string;
  workTags?: string[];
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
  files: string[];
  /** Optional per-file preview sources, aligned with ``files``. */
  previewFiles?: string[];
  fields?: Record<string, DeliveryFieldValue>;
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
}

export interface DeliveryProvider {
  deliver(request: DeliveryRequest): Promise<DeliveryResult>;
  /** One notification attempt; the durable outbox owns retries. */
  notify?(request: DeliveryNotificationRequest): Promise<DeliveryResult>;
}
