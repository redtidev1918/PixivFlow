import { BaseRepository } from './BaseRepository';

export interface PixivMetadata {
  pixivId: string;
  workType: string;
  language: string | null;
  xRestrict: number | null;
  publishedAt: string | null;
  title: string | null;
  checkedAt: number;
}

/**
 * Lightweight SQLite metadata cache. Novel language filtering otherwise issues
 * a full detail + full-text request for every candidate on every fallback run;
 * caching the classified result bounds request volume and reduces 429 storms.
 * Entries expire after a TTL so fresh classifications still happen eventually.
 */
export class MetadataRepository extends BaseRepository {
  get(pixivId: string, workType: string): PixivMetadata | null {
    const row = this.db
      .prepare(`SELECT * FROM pixiv_metadata WHERE pixiv_id = ? AND work_type = ?`)
      .get(String(pixivId), workType) as any;
    if (!row) return null;
    return {
      pixivId: row.pixiv_id,
      workType: row.work_type,
      language: row.language,
      xRestrict: row.x_restrict,
      publishedAt: row.published_at,
      title: row.title,
      checkedAt: row.checked_at,
    };
  }

  fresh(pixivId: string, workType: string, ttlMs: number, now: number = Date.now()): PixivMetadata | null {
    const row = this.get(pixivId, workType);
    if (!row) return null;
    if (now - row.checkedAt > ttlMs) return null;
    return row;
  }

  put(
    pixivId: string,
    workType: string,
    data: { language?: string | null; xRestrict?: number | null; publishedAt?: string | null; title?: string | null },
    now: number = Date.now()
  ): void {
    this.db
      .prepare(
        `INSERT INTO pixiv_metadata (pixiv_id, work_type, language, x_restrict, published_at, title, checked_at)
         VALUES (@pixivId, @workType, @language, @xRestrict, @publishedAt, @title, @now)
         ON CONFLICT(pixiv_id, work_type) DO UPDATE SET
           language=excluded.language,
           x_restrict=excluded.x_restrict,
           published_at=excluded.published_at,
           title=excluded.title,
           checked_at=excluded.checked_at`
      )
      .run({
        pixivId: String(pixivId),
        workType,
        language: data.language ?? null,
        xRestrict: data.xRestrict ?? null,
        publishedAt: data.publishedAt ?? null,
        title: data.title ?? null,
        now,
      });
  }
}
