import DatabaseDriver from 'better-sqlite3';

/**
 * Base repository class that provides access to the database instance
 * All repositories should extend this class
 */
export abstract class BaseRepository {
  constructor(protected readonly db: DatabaseDriver.Database) {}

  /**
   * Get the database instance
   */
  protected getDatabase(): DatabaseDriver.Database {
    return this.db;
  }
}

