import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TargetConfig } from '../config';
import { logger } from '../logger';
import { ConfigError, PendingDeliveryError } from '../utils/errors';
import { DeliveryDispatcher } from './DeliveryDispatcher';
import { DeliveryRequest, DeliveryResult, DownloadedArtifact } from './types';
import { getTargetLabel } from '../utils/target-label';

interface PendingDelivery {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: 'pending' | 'delivered';
  deliveryTarget: string;
  artifact: DownloadedArtifact;
  request: Omit<DeliveryRequest, 'files'>;
  result?: DeliveryResult;
  lastError?: string;
  nextAttemptAt?: string;
}

export interface PendingRetryResult {
  succeeded: number;
  failed: number;
  deferred: number;
}

export interface DeliveryOutboxOptions {
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  now?: () => number;
}

/** Durable, provider-independent delivery outbox for cache-mode downloads. */
export class DeliveryOutbox {
  constructor(
    private readonly directory: string,
    private readonly dispatcher: DeliveryDispatcher,
    private readonly deleteAfterDelivery = true,
    private readonly options: DeliveryOutboxOptions = {}
  ) {}

  async deliver(artifact: DownloadedArtifact, target: TargetConfig): Promise<void> {
    if (target.storageMode !== 'cache') return;

    const deliveryTarget = target.delivery?.target?.trim();
    if (!deliveryTarget) {
      throw new ConfigError('cache storageMode requires target.delivery.target');
    }
    if (!this.dispatcher.hasTarget(deliveryTarget)) {
      throw new ConfigError(`Delivery target is not configured: ${deliveryTarget}`);
    }
    if (artifact.files.length === 0) {
      throw new Error(`No files were produced for ${artifact.type} ${artifact.pixivId}`);
    }

    await fs.mkdir(this.directory, { recursive: true });
    const now = new Date().toISOString();
    const entry: PendingDelivery = {
      version: 1,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      status: 'pending',
      deliveryTarget,
      artifact: {
        ...artifact,
        files: [...new Set(artifact.files.map((file) => resolve(file)))],
        cleanupFiles: [...new Set((artifact.cleanupFiles ?? []).map((file) => resolve(file)))],
      },
      request: {
        fields: target.delivery?.fields,
        context: {
          title: artifact.title,
          pixivId: artifact.pixivId,
          type: artifact.type,
          // `tag` is the configured target label used by existing templates.
          // Topic targets have neither tag nor filterTag, so include topic in
          // the fallback instead of silently rendering {{tag}} as empty.
          tag: getTargetLabel(target, ''),
          topic: target.topic?.trim() || undefined,
          workTags: artifact.tags,
          spoiler: artifact.spoiler,
        },
      },
    };
    const manifestPath = join(
      this.directory,
      `${artifact.type}-${artifact.pixivId}-${entry.id}.json`
    );
    await this.writeNewManifest(manifestPath, entry);

    try {
      await this.processManifest(manifestPath, entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PendingDeliveryError(
        `Delivery failed; files retained for retry in ${manifestPath}: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async retryPending(): Promise<PendingRetryResult> {
    let names: string[];
    try {
      names = (await fs.readdir(this.directory)).filter((name) => name.endsWith('.json')).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { succeeded: 0, failed: 0, deferred: 0 };
      }
      throw error;
    }

    let succeeded = 0;
    let failed = 0;
    let deferred = 0;
    for (const name of names) {
      const manifestPath = join(this.directory, name);
      try {
        const entry = await this.readManifest(manifestPath);
        if (this.shouldDefer(entry)) {
          deferred++;
          continue;
        }
        await this.processManifest(manifestPath, entry);
        succeeded++;
      } catch (error) {
        failed++;
        logger.warn('Pending delivery remains queued', {
          manifestPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { succeeded, failed, deferred };
  }

  private async processManifest(manifestPath: string, entry: PendingDelivery): Promise<void> {
    if (entry.status === 'pending') {
      await this.assertFilesExist(entry.artifact.files);
      try {
        const result = await this.dispatcher.deliver(entry.deliveryTarget, {
          ...entry.request,
          files: entry.artifact.files,
        });
        entry.result = { status: result.status };
        entry.status = 'delivered';
        entry.attempts++;
        entry.updatedAt = new Date().toISOString();
        delete entry.lastError;
        delete entry.nextAttemptAt;
        await this.writeManifest(manifestPath, entry);
      } catch (error) {
        entry.attempts++;
        entry.updatedAt = new Date().toISOString();
        entry.lastError = error instanceof Error ? error.message : String(error);
        entry.nextAttemptAt = new Date(
          this.now() + this.retryDelayMs(entry.attempts)
        ).toISOString();
        await this.writeManifest(manifestPath, entry);
        throw error;
      }
    }

    if (this.deleteAfterDelivery) {
      await this.deleteFiles([...entry.artifact.files, ...(entry.artifact.cleanupFiles ?? [])]);
    }
    await fs.unlink(manifestPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    logger.info('Delivery outbox item completed', {
      deliveryTarget: entry.deliveryTarget,
      pixivId: entry.artifact.pixivId,
      type: entry.artifact.type,
      status: entry.result?.status,
    });
  }

  private async assertFilesExist(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await fs.access(file);
      } catch {
        throw new Error(`Pending delivery file is missing: ${file}`);
      }
    }
  }

  private async deleteFiles(files: string[]): Promise<void> {
    for (const file of new Set(files)) {
      await fs.unlink(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  private async readManifest(manifestPath: string): Promise<PendingDelivery> {
    const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as PendingDelivery;
    if (
      parsed.version !== 1 ||
      !parsed.deliveryTarget ||
      !parsed.artifact ||
      !Array.isArray(parsed.artifact.files) ||
      !parsed.request?.context
    ) {
      throw new Error(`Invalid delivery outbox manifest: ${manifestPath}`);
    }
    return parsed;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private shouldDefer(entry: PendingDelivery): boolean {
    if (entry.status !== 'pending' || !entry.nextAttemptAt) return false;
    const timestamp = Date.parse(entry.nextAttemptAt);
    return Number.isFinite(timestamp) && timestamp > this.now();
  }

  private retryDelayMs(attempts: number): number {
    const base = Math.max(0, this.options.retryBaseDelayMs ?? 5 * 60_000);
    const maximum = Math.max(base, this.options.retryMaxDelayMs ?? 6 * 60 * 60_000);
    return Math.min(maximum, base * 2 ** Math.min(Math.max(0, attempts - 1), 20));
  }

  private async writeNewManifest(manifestPath: string, entry: PendingDelivery): Promise<void> {
    await this.writeManifest(manifestPath, entry);
  }

  private async writeManifest(manifestPath: string, entry: PendingDelivery): Promise<void> {
    const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(entry, null, 2), 'utf8');
      await fs.rename(temporaryPath, manifestPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
