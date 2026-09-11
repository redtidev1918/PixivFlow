import type { SqliteDriver } from '../drivers/SqliteDriver';

/**
 * Base repository class that provides access to the database instance
 * All repositories should extend this class
 */
export abstract class BaseRepository {
  constructor(protected readonly db: SqliteDriver) {}

  /**
   * Get the database instance
   */
  protected getDatabase(): SqliteDriver {
    return this.db;
  }
}
