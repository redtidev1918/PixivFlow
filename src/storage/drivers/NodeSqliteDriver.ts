import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { SqliteDriver, SqliteRunResult, SqliteStatement } from './SqliteDriver';

/**
 * SQLite driver backed by Node's built-in `node:sqlite`.
 *
 * Why this binding: it ships inside Node, so installing pixivflow requires no compiler
 * toolchain, no node-gyp, and no install-time build step. `node:sqlite` is unflagged from
 * Node v22.13.0 (the `engines` floor); before that it needs `--experimental-sqlite` and
 * prints an ExperimentalWarning, which is why the floor is what it is.
 *
 * Two binding defaults differ from better-sqlite3 and are corrected here rather than
 * inherited silently:
 *
 *   1. Lock wait. better-sqlite3 waits up to 5s for a competing writer before returning
 *      SQLITE_BUSY. `node:sqlite` defaults to 0 (fail immediately), and the CLI and the
 *      scheduler do open the same file. Left alone this would turn a brief overlap into a
 *      spurious "database is locked" failure.
 *   2. Foreign keys. better-sqlite3 defaults them OFF; `node:sqlite` defaults them ON. The
 *      schema declares no FOREIGN KEY constraints, so the pragma is what keeps behaviour
 *      identical either way.
 *
 * Both are applied as PRAGMAs rather than constructor options on purpose: the option forms
 * (and their names) landed across different Node minors, while the pragma behaves the same
 * on every supported version.
 */
const BUSY_TIMEOUT_MS = 5000;

export class NodeSqliteDriver implements SqliteDriver {
  private readonly db: DatabaseSync;
  private transactionDepth = 0;
  private savepointCounter = 0;
  private closed = false;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.pragma('foreign_keys = OFF');
    this.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  }

  public prepare(sql: string): SqliteStatement {
    const statement: StatementSync = this.db.prepare(sql);
    return {
      // `never[]` keeps the spread assignable to the binding's parameter types
      // (`null | number | bigint | string | Uint8Array`) without weakening the public
      // signature to `any`.
      run: (...params: unknown[]): SqliteRunResult => {
        const result = statement.run(...(params as never[]));
        return {
          // better-sqlite3 hands back plain numbers; the binding may hand back BigInt, and
          // `changes === 0` / `> 0` comparisons downstream would silently break on `0n`.
          changes: Number(result.changes),
          lastInsertRowid: Number(result.lastInsertRowid),
        };
      },
      get: (...params: unknown[]): unknown => statement.get(...(params as never[])),
      all: (...params: unknown[]): unknown[] => statement.all(...(params as never[])),
    };
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public pragma(sql: string): unknown {
    // better-sqlite3's `.pragma()` takes the pragma body (`journal_mode = WAL`) and adds
    // the keyword itself, while direct SQL callers pass a full statement. Accept both so
    // neither call style silently becomes a syntax error.
    const statement = /^\s*pragma\b/i.test(sql) ? sql : `PRAGMA ${sql}`;
    try {
      const rows = this.db.prepare(statement).all();
      if (rows.length === 0) return undefined;
      if (rows.length > 1) return rows;
      const row = rows[0];
      if (row !== null && typeof row === 'object') {
        const values = Object.values(row as Record<string, unknown>);
        return values.length === 1 ? values[0] : row;
      }
      return row;
    } catch {
      // Not every statement can be read as a row source. Run it for its side effect and
      // report no value, the way a fire-and-forget pragma behaves.
      this.db.exec(statement);
      return undefined;
    }
  }

  public transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      // Nested transactions are legitimate here (a service-level transaction calling
      // repository methods that are themselves transactional). SQLite cannot nest BEGIN,
      // so inner scopes become savepoints — the same strategy better-sqlite3 uses.
      const nested = this.transactionDepth > 0;
      const savepoint = `pixivflow_sp_${(this.savepointCounter += 1)}`;

      this.db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      this.transactionDepth += 1;
      try {
        const result = fn(...args);
        this.transactionDepth -= 1;
        this.db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        this.transactionDepth -= 1;
        try {
          this.db.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK');
          if (nested) this.db.exec(`RELEASE ${savepoint}`);
        } catch {
          // The connection is already unwound (or closed). Surface the original error.
        }
        throw error;
      }
    };
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
