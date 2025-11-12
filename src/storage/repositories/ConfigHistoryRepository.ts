import { BaseRepository } from './BaseRepository';

/**
 * Repository for managing configuration history
 */
export class ConfigHistoryRepository extends BaseRepository {
  /**
   * Save configuration to history
   */
  public saveConfigHistory(name: string, config: any, description?: string): number {
    const stmt = this.db.prepare(
      `INSERT INTO config_history (name, description, config_json, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    );
    const result = stmt.run(name, description || null, JSON.stringify(config));
    return result.lastInsertRowid as number;
  }

  /**
   * Get all configuration history entries
   */
  public getConfigHistory(): Array<{
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  }> {
    const stmt = this.db.prepare(
      `SELECT id, name, description, config_json, created_at, updated_at, COALESCE(is_active, 0) as is_active
       FROM config_history
       ORDER BY updated_at DESC`
    );
    return stmt.all() as Array<{
      id: number;
      name: string;
      description: string | null;
      config_json: string;
      created_at: string;
      updated_at: string;
      is_active: number;
    }>;
  }

  /**
   * Get a specific configuration history entry by ID
   */
  public getConfigHistoryById(id: number): {
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  } | null {
    const stmt = this.db.prepare(
      `SELECT id, name, description, config_json, created_at, updated_at, COALESCE(is_active, 0) as is_active
       FROM config_history
       WHERE id = ?`
    );
    const result = stmt.get(id) as {
      id: number;
      name: string;
      description: string | null;
      config_json: string;
      created_at: string;
      updated_at: string;
      is_active: number;
    } | undefined;
    return result || null;
  }

  /**
   * Delete a configuration history entry by ID
   */
  public deleteConfigHistory(id: number): boolean {
    const stmt = this.db.prepare(`DELETE FROM config_history WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update a configuration history entry
   */
  public updateConfigHistory(id: number, name: string, config: any, description?: string): boolean {
    const stmt = this.db.prepare(
      `UPDATE config_history
       SET name = ?, description = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    const result = stmt.run(name, description || null, JSON.stringify(config), id);
    return result.changes > 0;
  }

  /**
   * Set active configuration history entry
   * This will deactivate all other entries and activate the specified one
   */
  public setActiveConfigHistory(id: number): boolean {
    const transaction = this.db.transaction(() => {
      // Deactivate all entries
      this.db.prepare(`UPDATE config_history SET is_active = 0`).run();
      // Activate the specified entry
      const stmt = this.db.prepare(`UPDATE config_history SET is_active = 1 WHERE id = ?`);
      const result = stmt.run(id);
      return result.changes > 0;
    });
    return transaction();
  }

  /**
   * Get the active configuration history entry
   */
  public getActiveConfigHistory(): {
    id: number;
    name: string;
    description: string | null;
    config_json: string;
    created_at: string;
    updated_at: string;
    is_active: number;
  } | null {
    const stmt = this.db.prepare(
      `SELECT id, name, description, config_json, created_at, updated_at, COALESCE(is_active, 0) as is_active
       FROM config_history
       WHERE COALESCE(is_active, 0) = 1
       LIMIT 1`
    );
    const result = stmt.get() as {
      id: number;
      name: string;
      description: string | null;
      config_json: string;
      created_at: string;
      updated_at: string;
      is_active: number;
    } | undefined;
    return result || null;
  }
}





















