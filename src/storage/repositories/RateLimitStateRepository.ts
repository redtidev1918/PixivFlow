import type { RateLimitState, RateLimitStateStore } from '@redtidev/pixiv-client';
import { BaseRepository } from './BaseRepository';

/**
 * Host-side SQLite adapter for the kit's RateLimitStateStore port.
 * Sync SQLite calls satisfy the async interface trivially.
 */
export class SQLiteRateLimitStateStore extends BaseRepository implements RateLimitStateStore {
  load(scope: string): RateLimitState | null {
    const row = this.db
      .prepare(`SELECT state FROM rate_limit_state WHERE scope = ?`)
      .get(scope) as { state: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.state) as RateLimitState;
    } catch {
      return null;
    }
  }

  save(scope: string, state: RateLimitState): void {
    this.db
      .prepare(
        `INSERT INTO rate_limit_state (scope, state, updated_at)
         VALUES (@scope, @state, @updatedAt)
         ON CONFLICT(scope) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
      )
      .run({ scope, state: JSON.stringify(state), updatedAt: Date.now() });
  }

  /** All persisted gate states (doctor/health inspection). Read-only. */
  getAll(): Array<{ scope: string; state: RateLimitState; updatedAt: number }> {
    const rows = this.db.prepare(`SELECT scope, state, updated_at FROM rate_limit_state`).all() as Array<{
      scope: string;
      state: string;
      updatedAt: number;
    }>;
    const out: Array<{ scope: string; state: RateLimitState; updatedAt: number }> = [];
    for (const row of rows) {
      try {
        out.push({ scope: row.scope, state: JSON.parse(row.state) as RateLimitState, updatedAt: row.updatedAt });
      } catch {
        // Skip corrupt rows rather than failing diagnostics.
      }
    }
    return out;
  }
}
