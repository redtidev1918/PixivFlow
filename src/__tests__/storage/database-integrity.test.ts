/**
 * Database integrity check and corrupt-file isolation tests.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database, isolateCorruptDatabase } from '../../storage/Database';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pixivflow-integrity-'));
}

describe('database integrity self-check', () => {
  it('reports ok for a healthy database', () => {
    const directory = tempDir();
    try {
      const db = new Database(join(directory, 'test.db'));
      db.migrate();
      expect(db.checkIntegrity()).toBe('ok');
      db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('isolates a corrupt database file (and sidecars) aside', () => {
    const directory = tempDir();
    try {
      const dbPath = join(directory, 'broken.db');
      writeFileSync(dbPath, 'this is not a sqlite database at all');
      writeFileSync(`${dbPath}-wal`, 'garbage');
      const isolated = isolateCorruptDatabase(dbPath);

      expect(isolated).not.toBe(dbPath);
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(isolated)).toBe(true);
      expect(existsSync(`${isolated}-wal`)).toBe(true);

      // A fresh database can be created at the original path afterwards.
      const db = new Database(dbPath);
      db.migrate();
      expect(db.checkIntegrity()).toBe('ok');
      db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
