import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TargetConfig } from '../config';
import { logger } from '../logger';
import { ConfigError, PendingDeliveryError } from '../utils/errors';
import { DeliveryDispatcher } from './DeliveryDispatcher';
import { DeliveryRequest, DeliveryResult, DownloadedArtifact } from './types';

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
}

export interface PendingRetryResult {
  succeeded: number;
  failed: number;
}

/** Durable, provider-independent delivery outbox for cache-mode downloads. */
export class DeliveryOutbox {
  constructor(
    private readonly directory: string,
    private readonly dispatcher: DeliveryDispatcher,
    private readonly deleteAfterDelivery = true
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
          tag: target.filterTag ?? target.tag,
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
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { succeeded: 0, failed: 0 };
      throw error;
    }

    let succeeded = 0;
    let failed = 0;
    for (const name of names) {
      const manifestPath = join(this.directory, name);
      try {
        const entry = await this.readManifest(manifestPath);
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
    return { succeeded, failed };
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
        await this.writeManifest(manifestPath, entry);
      } catch (error) {
        entry.attempts++;
        entry.updatedAt = new Date().toISOString();
        entry.lastError = error instanceof Error ? error.message : String(error);
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

  private async writeNewManifest(manifestPath: string, entry: PendingDelivery): Promise<void> {
    const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(entry, null, 2), 'utf8');
    await fs.rename(temporaryPath, manifestPath);
  }

  private async writeManifest(manifestPath: string, entry: PendingDelivery): Promise<void> {
    await fs.writeFile(manifestPath, JSON.stringify(entry, null, 2), 'utf8');
  }
}
