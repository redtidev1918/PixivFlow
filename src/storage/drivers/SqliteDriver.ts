/**
 * Minimal SQLite driver contract for the storage layer.
 *
 * Everything under `src/storage/` talks to SQLite through this interface and nothing
 * else. The binding is a deployment concern (it decides whether `npm install -g pixivflow`
 * compiles native code), so it lives behind one seam: swapping `node:sqlite` for another
 * binding stays a change to one file instead of a sweep over every repository.
 *
 * The shapes intentionally mirror the synchronous better-sqlite3 API the repositories were
 * written against, so call sites keep working unchanged:
 *   - `prepare()` returns a reusable statement;
 *   - a statement accepts an optional leading named-parameter object followed by
 *     positional parameters (`stmt.run({ id }, 'extra')`);
 *   - `.get()` returns `undefined` when no row matches.
 *
 * Bindings differ in their defaults, so implementations are responsible for normalising
 * them (see `NodeSqliteDriver` for the lock-wait and foreign-key details).
 */

export interface SqliteRunResult {
  /** Number of rows changed. Normalised to `number` so `changes === 0` keeps working. */
  changes: number;
  /** Rowid of the last inserted row. Normalised to `number` for the same reason. */
  lastInsertRowid: number;
}

export interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDriver {
  prepare(sql: string): SqliteStatement;

  /** Execute one or more statements, discarding any result rows. */
  exec(sql: string): void;

  /**
   * Apply or read a PRAGMA.
   *
   * Accepts either the pragma body (`journal_mode = WAL`) or a full statement
   * (`PRAGMA integrity_check;`), so both calling styles survive the binding swap.
   *
   * Follows better-sqlite3's shape: a single-row/single-column result collapses to that
   * scalar, a multi-row result (e.g. `table_info`) comes back as an array of row objects,
   * and a statement that yields nothing returns `undefined`.
   */
  pragma(sql: string): unknown;

  /**
   * Wrap `fn` in a transaction and return a function that runs it.
   *
   * Nested calls join the outer transaction rather than starting a second one — the
   * storage layer nests legitimately (a service-level transaction calling repository
   * methods that are themselves transactional).
   */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;

  close(): void;
}
