/**
 * The delivery ledger port answers the ONLY delivery question crash recovery may
 * ask about a `delivery_pending` cell: does something downstream still own it?
 *
 * Getting this wrong is how a recovery becomes a second post, so each answer is
 * pinned down here from real ledger rows (no mocks): live intents are delegated,
 * terminal ones are converged, and nothing is ever "repaired" by re-selecting.
 */
import { Database } from '../../storage/Database';
import { createDeliveryLedgerPort } from '../../delivery/DeliveryLedgerPort';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SLOT = 'slot-1';
const TARGET = 'daily-illust';

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-ledger-port-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function insertIntent(db: Database, pixivId: string, id = `delivery-${pixivId}`) {
  return db.deliveries.insertIntent({
    id,
    deliveryTarget: 'telepost',
    workType: 'illustration',
    pixivId,
    slotId: SLOT,
    targetId: TARGET,
    idempotencyKey: `pixivflow:telepost:illustration:${pixivId}:${SLOT}:${TARGET}`,
  }).row;
}

function ask(db: Database) {
  return createDeliveryLedgerPort(db).stateFor({
    deliveryTarget: 'telepost',
    slotId: SLOT,
    targetId: TARGET,
  });
}

describe('createDeliveryLedgerPort', () => {
  it('reports unknown when the cell never produced an intent', () => {
    withDb((db) => {
      expect(ask(db)).toEqual({ kind: 'unknown' });
    });
  });

  it('reports live while the outbox still has an actionable row for the intent', () => {
    withDb((db) => {
      const row = insertIntent(db, '100');
      db.outbox.enqueue({
        kind: 'delivery',
        deliveryTarget: 'telepost',
        deliveryId: row.id,
        idempotencyKey: `outbox:${row.idempotencyKey}`,
        payload: {},
      });

      expect(ask(db)).toEqual({ kind: 'live' });
    });
  });

  it('reports lost once the outbox exhausted the intent without an ACK', () => {
    withDb((db) => {
      const row = insertIntent(db, '100');
      const outbox = db.outbox.enqueue({
        kind: 'delivery',
        deliveryTarget: 'telepost',
        deliveryId: row.id,
        idempotencyKey: `outbox:${row.idempotencyKey}`,
        payload: {},
      });
      db.outbox.markDead(outbox.id, 'max attempts exhausted');

      expect(ask(db)).toEqual({
        kind: 'lost',
        reason: expect.stringContaining('terminal failure'),
      });
    });
  });

  it('reports lost for a pending intent that never reached the outbox', () => {
    withDb((db) => {
      insertIntent(db, '100');

      // Nothing will ever retry this: the worker only pumps outbox rows.
      expect(ask(db)).toEqual({ kind: 'lost', reason: expect.stringContaining('terminal failure') });
    });
  });

  it('reports confirmed (with the work identity) when the ACK already landed', () => {
    withDb((db) => {
      const row = insertIntent(db, '100');
      db.deliveries.recordAck(row.id, { status: 'delivered', remoteId: 'msg-1' });

      expect(ask(db)).toEqual({ kind: 'confirmed', workId: '100', workType: 'illustration' });
    });
  });

  it('treats a downstream-attested duplicate as confirmed, not as something to retry', () => {
    withDb((db) => {
      const row = insertIntent(db, '100');
      db.deliveries.recordAck(row.id, { status: 'duplicate', reuseReason: 'telepost already had it' });

      expect(ask(db)).toEqual({ kind: 'confirmed', workId: '100', workType: 'illustration' });
    });
  });

  it('scopes the answer to the cell, so another cell\'s delivery never stops a run', () => {
    withDb((db) => {
      insertIntent(db, '100');

      expect(
        createDeliveryLedgerPort(db).stateFor({
          deliveryTarget: 'telepost',
          slotId: SLOT,
          targetId: 'a-different-target',
        })
      ).toEqual({ kind: 'unknown' });
    });
  });
});
