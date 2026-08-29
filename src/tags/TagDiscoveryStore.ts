import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import type { TagDiscoveryContentType, TagDiscoveryManifest } from './types';

export interface TagDiscoveryCacheKey {
  seed: string;
  contentTypes: TagDiscoveryContentType[];
  sampleSize: number;
  limit: number;
}

/** Small, durable cache stored beside PixivFlow's database. */
export class TagDiscoveryStore {
  constructor(
    private readonly directory: string,
    private readonly now: () => number = Date.now
  ) {}

  pathFor(key: TagDiscoveryCacheKey): string {
    const digest = createHash('sha256')
      .update(JSON.stringify({
        seed: key.seed.trim().normalize('NFKC').toLocaleLowerCase(),
        contentTypes: [...key.contentTypes].sort(),
        sampleSize: key.sampleSize,
        limit: key.limit,
      }))
      .digest('hex')
      .slice(0, 16);
    return join(this.directory, `tag-discovery-${digest}.json`);
  }

  async loadFresh(key: TagDiscoveryCacheKey): Promise<{ manifest: TagDiscoveryManifest; path: string } | undefined> {
    const path = this.pathFor(key);
    try {
      const manifest = JSON.parse(await fs.readFile(path, 'utf8')) as TagDiscoveryManifest;
      if (manifest.version !== 1 || !Array.isArray(manifest.candidates)) return undefined;
      const expiresAt = Date.parse(manifest.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) return undefined;
      return { manifest, path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  async save(key: TagDiscoveryCacheKey, manifest: TagDiscoveryManifest): Promise<string> {
    await fs.mkdir(this.directory, { recursive: true });
    const path = this.pathFor(key);
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await fs.rename(temporaryPath, path);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    return path;
  }

  async read(path: string): Promise<TagDiscoveryManifest> {
    const manifest = JSON.parse(await fs.readFile(path, 'utf8')) as TagDiscoveryManifest;
    if (manifest.version !== 1 || !manifest.seed || !Array.isArray(manifest.candidates)) {
      throw new Error(`Invalid tag discovery manifest: ${path}`);
    }
    return manifest;
  }
}
