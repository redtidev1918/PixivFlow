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
  /** Pixiv publish timestamp (create_date, ISO) — rendered as {{publishedDate}}. */
  publishedAt?: string;
  /** Detected language label for novels (e.g. "Chinese (Mandarin) (cmn)"). */
  language?: string;
}

export interface DeliveryContext {
  title: string;
  pixivId: string;
  type: DeliveryItemType;
  tag?: string;
  topic?: string;
  workTags?: string[];
  spoiler?: boolean;
  /** Ranking/list day in YYYY-MM-DD (JST) — which day's hot works this is. */
  rankingDate?: string;
  /** Pixiv publish date, ISO — when the work was released. */
  publishedAt?: string;
  /** Detected language label for novels. */
  language?: string;
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

export interface DeliveryProvider {
  deliver(request: DeliveryRequest): Promise<DeliveryResult>;
}
