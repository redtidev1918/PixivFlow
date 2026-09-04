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
}

export interface DeliveryRequest {
  files: string[];
  fields?: Record<string, DeliveryFieldValue>;
  context: DeliveryContext;
}

export interface DeliveryResult {
  status?: number;
  body?: unknown;
}

export interface DeliveryNotificationRequest {
  text: string;
  idempotencyKey: string;
}

export interface DeliveryProvider {
  deliver(request: DeliveryRequest): Promise<DeliveryResult>;
  notify?(request: DeliveryNotificationRequest): Promise<DeliveryResult>;
}
