import { BaseRepository } from './BaseRepository';
import { AccessTokenStore } from '../Database';

/**
 * Repository for managing access tokens
 */
export class TokenRepository extends BaseRepository {
  /**
   * Get a token by key
   */
  public getToken(key: string): AccessTokenStore | null {
    const stmt = this.db.prepare(`SELECT value FROM tokens WHERE key = ?`);
    const row = stmt.get(key) as { value: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.value) as AccessTokenStore;
  }

  /**
   * Set a token (insert or update)
   */
  public setToken(key: string, value: AccessTokenStore): void {
    const stmt = this.db.prepare(
      `INSERT INTO tokens (key, value, updated_at)
       VALUES (@key, @value, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    );

    stmt.run({ key, value: JSON.stringify(value) });
  }

  /**
   * Delete a token by key
   */
  public deleteToken(key: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM tokens WHERE key = ?`);
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * Save token (alias for setToken)
   */
  public saveToken(key: string, token: AccessTokenStore): void {
    this.setToken(key, token);
  }
}




























































