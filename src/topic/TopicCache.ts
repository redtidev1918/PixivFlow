import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import type { TopicContentType, TopicSpace } from './types';

/**
 * Durable Topic cache stored beside the SQLite database (which lives on the
 * persistent data volume in Docker). One small JSON file per
 * `<topic, contentType>`, written atomically. No extra database or service.
 *
 * Daily scheduler runs normally hit the fresh cache; only a missing/expired
 * entry triggers discovery. A stale entry is kept and reused if refresh fails.
 */
export class TopicCache {
  constructor(
    private readonly directory: string,
    private readonly now: () => number = Date.now
  ) {}

  static forDatabase(databasePath: string): TopicCache {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { dirname } = require('node:path') as typeof import('node:path');
    return new TopicCache(join(dirname(databasePath), 'topic-cache'));
  }

  private pathFor(topic: string, contentType: TopicContentType): string {
    const digest = createHash('sha256')
      .update(`${contentType}:${topic.trim().normalize('NFKC').toLocaleLowerCase()}`)
      .digest('hex')
      .slice(0, 16);
    return join(this.directory, `topic-${digest}.json`);
  }

  private async read(path: string): Promise<TopicSpace | undefined> {
    try {
      const space = JSON.parse(await fs.readFile(path, 'utf8')) as TopicSpace;
      if (space.version !== 1 || !space.topic || !Array.isArray(space.tags)) return undefined;
      return space;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  /** Returns a cached space only if it has not expired. */
  async loadFresh(topic: string, contentType: TopicContentType): Promise<TopicSpace | undefined> {
    const space = await this.read(this.pathFor(topic, contentType));
    if (!space) return undefined;
    const expires = Date.parse(space.expiresAt);
    if (!Number.isFinite(expires) || expires <= this.now()) return undefined;
    return space;
  }

  /** Returns a cached space even if expired (used for graceful fallback). */
  async loadAny(topic: string, contentType: TopicContentType): Promise<TopicSpace | undefined> {
    return this.read(this.pathFor(topic, contentType));
  }

  async save(space: TopicSpace): Promise<string> {
    await fs.mkdir(this.directory, { recursive: true });
    const path = this.pathFor(space.topic, space.contentType);
    const tmp = `${path}.${process.pid}.${createHash('sha256').update(path + space.createdAt).digest('hex').slice(0, 8)}.tmp`;
    try {
      await fs.writeFile(tmp, `${JSON.stringify(space, null, 2)}\n`, 'utf8');
      await fs.rename(tmp, path);
    } catch (error) {
      await fs.unlink(tmp).catch(() => undefined);
      throw error;
    }
    return path;
  }
}
