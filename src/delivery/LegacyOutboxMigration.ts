import { existsSync, readdirSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { Database } from '../storage/Database';
import { logger } from '../logger';

/**
 * Idempotent migration from the legacy file-based outbox
 * (delivery-outbox/*.json manifests) to the SQLite transactional outbox.
 *
 * It is crash-safe: a manifest is only ARCHIVED after its outbox row is
 * committed, and re-running finds the row via the same idempotency key (no
 * duplicate side effects). Pending/retryable manifests become due rows;
 * already-delivered manifests are archived without a new intent (their work is
 * also backfilled into the delivery ledger when resolvable).
 */
export interface LegacyMigrationResult {
  scanned: number;
  imported: number;
  delivered: number;
  skipped: number;
  failed: number;
}

interface LegacyManifest {
  version?: number;
  id?: string;
  kind?: 'delivery' | 'notification';
  status?: 'pending' | 'delivered';
  deliveryTarget?: string;
  attempts?: number;
  nextAttemptAt?: string;
  lastError?: string;
  artifact?: {
    pixivId: string;
    type: string;
    files: string[];
    cleanupFiles?: string[];
    title?: string;
    tags?: string[];
    [k: string]: unknown;
  };
  request?: { fields?: Record<string, unknown>; context?: Record<string, unknown> };
  notification?: { text: string; idempotencyKey?: string };
}

export function legacyOutboxDir(databasePath: string): string {
  return join(dirname(databasePath), 'delivery-outbox');
}

export function migrateLegacyOutbox(
  database: Database,
  outboxDir: string = legacyOutboxDir(database.getDatabasePath())
): LegacyMigrationResult {
  const result: LegacyMigrationResult = { scanned: 0, imported: 0, delivered: 0, skipped: 0, failed: 0 };
  if (!existsSync(outboxDir)) return result;

  const files = readdirSync(outboxDir).filter((f) => f.endsWith('.json'));
  const archiveDir = join(outboxDir, 'migrated');
  for (const file of files) {
    result.scanned++;
    const full = join(outboxDir, file);
    let manifest: LegacyManifest;
    try {
      manifest = JSON.parse(readFileSync(full, 'utf8')) as LegacyManifest;
    } catch (error) {
      logger.warn('Legacy outbox manifest unreadable; leaving in place', {
        file,
        error: error instanceof Error ? error.message : String(error),
      });
      result.failed++;
      continue;
    }

    try {
      const kind = manifest.kind ?? (manifest.notification ? 'notification' : 'delivery');
      const target = manifest.deliveryTarget ?? 'default';

      if (kind === 'notification') {
        const key = manifest.notification?.idempotencyKey ?? `legacy-notify:${manifest.id ?? file}`;
        if (manifest.status === 'delivered') {
          result.delivered++;
        } else {
          database.outbox.enqueue({
            kind: 'notification',
            deliveryTarget: target,
            idempotencyKey: key,
            payload: { text: manifest.notification?.text ?? '' },
          });
          result.imported++;
        }
      } else {
        const artifact = manifest.artifact;
        if (!artifact) {
          result.skipped++;
        } else if (manifest.status === 'delivered') {
          // Backfill the ledger fact so delivery dedupe survives the migration.
          const key = `legacy-delivery:${target}:${artifact.type}:${artifact.pixivId}:${manifest.id ?? file}`;
          if (!database.deliveries.isDelivered(target, artifact.type, String(artifact.pixivId))) {
            database.deliveries.backfill({
              id: require('node:crypto').randomUUID(),
              deliveryTarget: target,
              workType: artifact.type,
              pixivId: String(artifact.pixivId),
              idempotencyKey: key,
              remoteStatus: 'legacy_delivered',
            });
          }
          result.delivered++;
        } else {
          const idemKey = `legacy-delivery:${target}:${artifact.type}:${artifact.pixivId}:${manifest.id ?? file}`;
          // Create the ledger intent + outbox row atomically.
          const { row, created } = database.deliveries.insertIntent({
            id: require('node:crypto').randomUUID(),
            deliveryTarget: target,
            workType: artifact.type,
            pixivId: String(artifact.pixivId),
            idempotencyKey: idemKey,
          });
          if (created) {
            const due = manifest.nextAttemptAt ? Date.parse(manifest.nextAttemptAt) : Date.now();
            database.outbox.enqueue({
              kind: 'delivery',
              deliveryTarget: target,
              idempotencyKey: `outbox:${idemKey}`,
              deliveryId: row.id,
              dueAt: Number.isFinite(due) ? due : Date.now(),
              payload: {
                files: artifact.files,
                cleanupFiles: artifact.cleanupFiles ?? [],
                fields: manifest.request?.fields ?? null,
                context: {
                  title: artifact.title,
                  pixivId: artifact.pixivId,
                  type: artifact.type,
                  workTags: artifact.tags,
                  ...(manifest.request?.context ?? {}),
                },
              },
            });
            result.imported++;
          } else {
            result.skipped++;
          }
        }
      }

      // Commit succeeded (better-sqlite3 is synchronous): archive the manifest.
      mkdirSync(archiveDir, { recursive: true });
      renameSync(full, join(archiveDir, file));
    } catch (error) {
      result.failed++;
      logger.warn('Legacy outbox manifest migration failed; will retry next start', {
        file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (result.imported > 0 || result.delivered > 0) {
    logger.info('Legacy JSON outbox migrated to SQLite', result as unknown as Record<string, number>);
  }
  return result;
}
