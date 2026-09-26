/**
 * Messaging Gateway connection registry (P3).
 *
 * A row here is a POINTER to an external gateway plus PixivFlow's last
 * observation of its pairing state. Two properties matter and are pinned here:
 *
 *  - the table is created by the ordinary idempotent migration (no version
 *    number, no schema rebuild) and stays stable across repeated `migrate()`;
 *  - the row never becomes a credential store, and a status observation never
 *    clobbers the configured `type`/`endpoint`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from '../../storage/Database';
import { redactUrl } from '../../utils/redact';

function withDb<T>(fn: (db: Database, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-gateway-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db, dir);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('gateway connection registry', () => {
  it('is created by the ordinary migration and survives repeated migrate()', () => {
    withDb((db) => {
      // A missing table would throw from this write, so this is the observable
      // proof that the ordinary idempotent migration created it.
      expect(() => db.gatewayConnections.upsert({ name: 'probe', type: 'webhook' })).not.toThrow();
      expect(db.gatewayConnections.getByName('probe')?.type).toBe('webhook');
    });

    withDb((db, dir) => {
      db.gatewayConnections.upsert({ name: 'onebot-main', type: 'onebot', endpoint: 'http://127.0.0.1:5700' });
      // A second migrate on an existing database must be a no-op, not a reset.
      const reopened = new Database(join(dir, 'test.db'));
      reopened.migrate();
      reopened.migrate();
      expect(reopened.gatewayConnections.getByName('onebot-main')?.type).toBe('onebot');
      reopened.close();
    });
  });

  it('upserts by name and keeps the observed status without touching the endpoint', () => {
    withDb((db) => {
      const first = db.gatewayConnections.upsert({
        name: 'napcat',
        type: 'onebot',
        endpoint: 'http://gateway.internal:5700',
        metadata: { implementation: 'napcat' },
      });
      expect(first.status).toBe('unknown');
      expect(first.id).toBe('gateway:napcat');

      db.gatewayConnections.recordStatus('napcat', 'connected');
      const observed = db.gatewayConnections.getByName('napcat')!;
      expect(observed.status).toBe('connected');
      // The probe path must not rewrite configuration facts.
      expect(observed.type).toBe('onebot');
      expect(observed.endpoint).toBe('http://gateway.internal:5700');
      expect(observed.metadata).toEqual({ implementation: 'napcat' });

      // Re-declaring the same name updates in place (no duplicate row).
      db.gatewayConnections.upsert({ name: 'napcat', type: 'onebot', endpoint: 'http://other:5700' });
      expect(db.gatewayConnections.list()).toHaveLength(1);
      expect(db.gatewayConnections.getByName('napcat')?.endpoint).toBe('http://other:5700');
    });
  });

  it('normalizes an unknown status instead of trusting the column', () => {
    withDb((db) => {
      db.gatewayConnections.upsert({ name: 'legacy', type: 'httpMultipart' });
      db.exec(`UPDATE gateway_connections SET status = 'weird' WHERE name = 'legacy'`);
      expect(db.gatewayConnections.getByName('legacy')?.status).toBe('unknown');
    });
  });

  it('tolerates corrupt metadata JSON and removes rows by name', () => {
    withDb((db) => {
      db.gatewayConnections.upsert({ name: 'broken', type: 'webhook', metadata: { a: 1 } });
      db.exec(`UPDATE gateway_connections SET metadata = 'not json' WHERE name = 'broken'`);
      expect(db.gatewayConnections.getByName('broken')?.metadata).toBeNull();

      expect(db.gatewayConnections.remove('broken')).toBe(true);
      expect(db.gatewayConnections.remove('broken')).toBe(false);
      expect(db.gatewayConnections.list()).toEqual([]);
    });
  });

  it('redacts endpoint secrets before a projection can expose them', () => {
    // The projection contract: credentials and query secrets never leave the
    // server, because a gateway endpoint is exactly where a token would live.
    expect(redactUrl('https://user:pass@gateway.example/hook?token=abc')).toBe(
      'https://redacted@gateway.example/hook?…'
    );
    expect(redactUrl('http://127.0.0.1:5700/')).toBe('http://127.0.0.1:5700/');
    expect(redactUrl(null)).toBeNull();
    expect(redactUrl(undefined)).toBeNull();
  });
});
