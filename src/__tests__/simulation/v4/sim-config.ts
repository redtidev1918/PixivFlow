/**
 * Canonical synthetic configuration for the V4 simulation.
 *
 * Every endpoint here is loopback. The delivery target posts real multipart
 * HTTP to the simulated TelePost server, which in turn talks to the fake
 * Telegram Bot API. There is no host name, path or default in this file that
 * can reach a production system.
 */
import type {
  HttpMultipartDeliveryConfig,
  ScheduleConfig,
  StandaloneConfig,
} from '../../../config';
import { syntheticCredentials } from './synthetic';

export const SIM_TAG = 'v4sim_synthetic_tag';
export const SIM_TARGET_ID = 'v4sim-illust';
export const SIM_DELIVERY_TARGET = 'v4sim-telepost';
export const SIM_SCHEDULE_ID = 'v4sim-schedule';
export const SIM_SCHEDULE_NAME = 'V4 Sim Schedule';

/** Fixed cron so the resolved occurrence id is deterministic. */
export const SIM_CRON = '0 3 * * *';
export const SIM_TIMEZONE = 'UTC';
/** Canonical trigger instant for the happy path: a distinct hour in the past. */
export const SIM_OCCURRENCE_AT = new Date('2026-09-12T03:00:00.000Z');

export interface SimPaths {
  root: string;
  download: string;
  illustration: string;
  novel: string;
  database: string;
}

export interface SimEndpoints {
  /**
   * Loopback base the delivery target posts to, e.g. `http://127.0.0.1:41234`.
   * The handshake's `api_base` already includes `/api/v1`, and the fault
   * injection transport mirrors that shape, so callers append only the leaf
   * path (`/submissions`, `/health`).
   */
  telepostBaseUrl: string;
  /** Synthetic bearer minted by the simulated TelePost server. */
  telepostApiToken: string;
}

/**
 * The delivery target: real `HttpMultipartDelivery` pointed at the loopback
 * control plane. `readinessUrl` makes a not-yet-ready server defer outbox
 * attempts instead of burning them.
 */
export function buildSimDeliveryTarget(endpoints: SimEndpoints): HttpMultipartDeliveryConfig {
  // `telepostBaseUrl` is the handshake's `api_base`, which already ends with
  // `/api/v1`; appending the prefix again would 404.
  const base = endpoints.telepostBaseUrl.replace(/\/$/, '');
  return {
    type: 'httpMultipart',
    url: `${base}/submissions`,
    method: 'POST',
    headers: { Authorization: `Bearer ${endpoints.telepostApiToken}` },
    fileField: 'files',
    previewFileField: 'previews',
    readinessUrl: `${base}/health`,
    // TelePost requires a non-empty `tags` field on every multipart submission;
    // the rest is provenance it stores verbatim. `idempotency_key` is the field
    // TelePost feeds into `normalize_idempotency_key`, so sending it is what
    // makes the downstream replay path reachable at all.
    fields: {
      tags: '{{tag}}',
      title: '{{title}}',
      work_type: '{{type}}',
      pixiv_id: '{{pixivId}}',
      target_id: SIM_TARGET_ID,
      idempotency_key: '{{idempotencyKey}}',
    },
    arrayFormat: 'comma',
    success: { statuses: [200, 201] },
    maxAttempts: 1,
    retryDelayMs: 0,
    ack: { dataPath: 'data' },
  };
}

export function buildSimSchedule(): ScheduleConfig {
  return {
    id: SIM_SCHEDULE_ID,
    name: SIM_SCHEDULE_NAME,
    cron: SIM_CRON,
    timezone: SIM_TIMEZONE,
    enabled: true,
    targetIds: [SIM_TARGET_ID],
  } as ScheduleConfig;
}

/**
 * `storageMode: 'cache'` plus `delivery.target` is what makes the real
 * `DeliveryService` treat this target as deliverable, so the durable outbox row
 * is produced by production code rather than by the harness.
 */
export function buildSimConfig(paths: SimPaths, endpoints: SimEndpoints): StandaloneConfig {
  const credentials = syntheticCredentials();
  return {
    pixiv: {
      clientId: 'v4sim-client-id',
      clientSecret: 'v4sim-client-secret',
      deviceToken: 'v4sim-device-token',
      refreshToken: credentials.pixivRefreshToken,
      userAgent: 'PixivFlow/v4sim',
    },
    network: { retries: 0, timeoutMs: 5000 },
    download: { requestDelay: 0, concurrency: 1 },
    storage: {
      downloadDirectory: paths.download,
      illustrationDirectory: paths.illustration,
      novelDirectory: paths.novel,
    },
    targets: [
      {
        id: SIM_TARGET_ID,
        type: 'illustration',
        tag: SIM_TAG,
        limit: 1,
        searchTarget: 'partial_match_for_tags',
        sort: 'date_desc',
        restrict: 'public',
        storageMode: 'cache',
        delivery: { target: SIM_DELIVERY_TARGET },
      },
    ],
    delivery: {
      targets: { [SIM_DELIVERY_TARGET]: buildSimDeliveryTarget(endpoints) },
      deleteAfterDelivery: true,
      // Deterministic retries: no wall-clock backoff inside the harness.
      outboxRetryBaseMs: 0,
      outboxRetryMaxMs: 0,
    },
    // `scheduler` keeps its legacy single-schedule shape (enabled + cron);
    // `schedules` is the multi-schedule view the canonical harness resolves.
    scheduler: {
      enabled: true,
      cron: SIM_CRON,
      mode: 'internal',
      catchUpMissedRuns: false,
      watchConfig: false,
      concurrency: 1,
    },
    schedules: [buildSimSchedule()],
  } as StandaloneConfig;
}
