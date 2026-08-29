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
}

export interface DeliveryContext {
  title: string;
  pixivId: string;
  type: DeliveryItemType;
  tag?: string;
  topic?: string;
  workTags?: string[];
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
