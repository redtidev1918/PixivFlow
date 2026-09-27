/**
 * Job projection tests (§liveness).
 *
 * The manual-refetch status endpoint is the first consumer of the generic Job
 * projection. The invariant pinned here: a caller must be able to tell "queued
 * two seconds ago" from "pending for three days behind a stopped scheduler"
 * from durable ledger state ALONE — without new endpoints, new columns, or
 * knowledge of this service's table layout.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { Database } from '../../storage/Database';
import { buildJobProjection } from '../../scheduler/JobProjection';

const REQUEST_ID = '6eb50329-20f2-4ea7-b95b-e4676b50d9f1';
const SLOT_ID = `plan-a@manual-${REQUEST_ID}`;

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-projection-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedManualSlot(db: Database): void {
  db.slots.getOrCreateSlot(SLOT_ID, {
    scheduleId: 'plan-a',
    occurrenceAt: Date.now(),
    occurrenceDate: '2026-09-27',
    occurrenceLabel: 'manual',
    timezone: 'Asia/Shanghai',
    targetIds: ['target-a'],
    triggerSource: 'manual',
    slotDate: '2026-09-27',
    slotName: '审核群重抓',
    manualRequestId: REQUEST_ID,
    correlationId: 'chain-1',
  });
  db.slots.materializeCells(SLOT_ID, ['target-a'], () => 'illustration');
}

describe('buildJobProjection', () => {
  it('projects an unclaimed queued job as not-claimed, no lease, no progress', () => {
    withDb((db) => {
      seedManualSlot(db);
      const now = Date.now();
      const slot = db.slots.getSlot(SLOT_ID)!;
      const cell = db.slots.getCell(SLOT_ID, 'target-a')!;
      const projection = buildJobProjection(REQUEST_ID, slot, cell, now);

      // Legacy aliases keep their exact meaning.
      expect(projection).toMatchObject({
        requestId: REQUEST_ID,
        slotId: SLOT_ID,
        state: 'pending',
        slotStatus: 'pending',
      });
      // Liveness facts a watchdog needs.
      expect(projection.leaseActive).toBe(false);
      expect(projection.claimed).toBe(false);
      expect(projection.leaseExpiresAt).toBeNull();
      expect(projection.heartbeatAt).toBeNull();
      expect(projection.startedAt).toBeNull();
      expect(projection.attemptCount).toBe(0);
      expect(projection.terminalReasonCode).toBeNull();
      expect(projection.terminalReasonMessage).toBeNull();
      // The opaque keys the consumer correlates on.
      expect(projection.manualRequestId).toBe(REQUEST_ID);
      expect(projection.idempotencyKey).toBe(REQUEST_ID);
      expect(projection.correlationId).toBe('chain-1');
    });
  });

  it('normalises SQLite UTC datetimes to epoch ms (a local-time misread is 8h off in Asia/Shanghai)', () => {
    withDb((db) => {
      seedManualSlot(db);
      const now = Date.now();
      const projection = buildJobProjection(
        REQUEST_ID,
        db.slots.getSlot(SLOT_ID)!,
        db.slots.getCell(SLOT_ID, 'target-a')!,
        now
      );
      for (const value of [projection.createdAt, projection.updatedAt]) {
        expect(typeof value).toBe('number');
        // CURRENT_TIMESTAMP has second granularity; the zone must still be UTC.
        expect(Math.abs(now - (value as number))).toBeLessThan(60_000);
      }
    });
  });

  it('reports a live lease and a claimed, started job', () => {
    withDb((db) => {
      seedManualSlot(db);
      const now = Date.now();
      const leaseUntil = now + 3 * 60 * 1000;
      expect(db.slots.claimSlotLease(SLOT_ID, 'run-1', leaseUntil, now)).toBe(true);
      db.slots.markSlotStatus(SLOT_ID, 'running', undefined);

      const projection = buildJobProjection(
        REQUEST_ID,
        db.slots.getSlot(SLOT_ID)!,
        db.slots.getCell(SLOT_ID, 'target-a')!,
        now
      );
      expect(projection.leaseActive).toBe(true);
      expect(projection.claimed).toBe(true);
      expect(projection.slotStatus).toBe('running');
      expect(projection.leaseExpiresAt).toBe(leaseUntil);
      expect(projection.heartbeatAt).toBe(now);
      expect(projection.startedAt).not.toBeNull();
    });
  });

  it('reports an expired lease as inactive while keeping the claim', () => {
    withDb((db) => {
      seedManualSlot(db);
      const past = Date.now() - 10 * 60 * 1000;
      db.slots.claimSlotLease(SLOT_ID, 'dead-worker', past, past);
      db.slots.markSlotStatus(SLOT_ID, 'running');

      const projection = buildJobProjection(
        REQUEST_ID,
        db.slots.getSlot(SLOT_ID)!,
        db.slots.getCell(SLOT_ID, 'target-a')!
      );
      expect(projection.leaseActive).toBe(false);
      expect(projection.claimed).toBe(true);
      expect(projection.leaseExpiresAt).toBe(past);
    });
  });

  it('carries the terminal reason of a finished job', () => {
    withDb((db) => {
      seedManualSlot(db);
      db.slots.transitionCell(SLOT_ID, 'target-a', 'failed', 'queued too long');
      db.slots.setCellTerminalReason(SLOT_ID, 'target-a', 'queued_too_long', '排队超时，未能开始执行');
      db.slots.markSlotStatus(SLOT_ID, 'failed', '排队超时，未能开始执行');

      const projection = buildJobProjection(
        REQUEST_ID,
        db.slots.getSlot(SLOT_ID)!,
        db.slots.getCell(SLOT_ID, 'target-a')!
      );
      expect(projection.state).toBe('failed');
      expect(projection.slotStatus).toBe('failed');
      expect(projection.terminalReasonCode).toBe('queued_too_long');
      expect(projection.terminalReasonMessage).toBe('排队超时，未能开始执行');
      expect(projection.claimed).toBe(true);
    });
  });
});
