/**
 * Multi-target delivery fan-out contract.
 *
 * A work published to SEVERAL external platforms must behave as N independent
 * deliveries, never as one all-or-nothing submission:
 *
 *  - one ledger intent + one outbox row per platform,
 *  - a retry only re-sends the platforms that are not confirmed yet,
 *  - one platform failing never blocks or fails another,
 *  - re-running the same artifact+platform never double-sends,
 *  - declaring no delivery target keeps the historical (download-only) behaviour.
 *
 * These are the load-bearing properties of the delivery plane, so they are
 * pinned against a real SQLite ledger here, not against mocks.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from '../../storage/Database';
import { DeliveryService } from '../../delivery/DeliveryService';
import { createDeliveryLedgerPort } from '../../delivery/DeliveryLedgerPort';
import { targetDeliveryNames } from '../../delivery/targetRoutes';
import type { DownloadedArtifact } from '../../delivery/types';
import type { TargetConfig } from '../../config';

const SLOT = 'slot-2026-01-01T00:00';
const TARGET_ID = 'daily-illust';

function withDb<T>(fn: (db: Database, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-fanout-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db, dir);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function artifactFor(dir: string, pixivId = '1001'): DownloadedArtifact {
  const file = join(dir, `illust-${pixivId}.jpg`);
  writeFileSync(file, 'image-bytes');
  return {
    pixivId,
    type: 'illustration',
    title: `Work ${pixivId}`,
    artifacts: [
      {
        id: `pixiv:${pixivId}:original:0`,
        workId: pixivId,
        variant: 'original',
        path: file,
        mimeType: 'image/jpeg',
      },
    ],
  };
}

function fanoutTarget(names: string[]): TargetConfig {
  return {
    id: TARGET_ID,
    type: 'illustration',
    tag: 'original',
    storageMode: 'cache',
    delivery: {
      target: names[0],
      targets: names,
      executionContext: {
        slotId: SLOT,
        slotName: 'morning',
        slotDate: '2026-01-01',
        scheduleId: 'daily',
        occurrenceAt: 1,
        occurrenceAtIso: new Date(1).toISOString(),
        triggerSource: 'cron',
      },
    },
  } as TargetConfig;
}

const ROUTES = ['telegram-main', 'discord-main', 'feishu-main'];

function deliveriesFor(db: Database, pixivId = '1001') {
  return db.deliveries.listForCell('telegram-main', SLOT, TARGET_ID).length === 0
    ? []
    : ROUTES.flatMap((route) => db.deliveries.listForCell(route, SLOT, TARGET_ID))
        .filter((row) => row.pixivId === pixivId);
}

function outboxRows(db: Database) {
  return db.outbox.list(undefined, 200).filter((row) => row.kind === 'delivery');
}

describe('multi-target delivery fan-out', () => {
  it('enqueues one independent ledger intent + outbox row per delivery target', () => {
    withDb((db, dir) => {
      const service = new DeliveryService(db);
      const artifact = artifactFor(dir);

      const result = service.enqueue(artifact, fanoutTarget(ROUTES), { slotId: SLOT });

      expect(result.routes.map((route) => route.deliveryTarget)).toEqual(ROUTES);
      expect(new Set(result.routes.map((route) => route.idempotencyKey)).size).toBe(ROUTES.length);
      expect(result.created).toBe(true);
      // Nothing is fully confirmed yet, so the work is NOT a duplicate.
      expect(result.duplicate).toBe(false);

      const rows = deliveriesFor(db);
      expect(rows.map((row) => row.deliveryTarget).sort()).toEqual([...ROUTES].sort());
      expect(rows.every((row) => row.status === 'pending')).toBe(true);
      expect(outboxRows(db)).toHaveLength(ROUTES.length);
      // The adapter must always be able to tell which platform it serves.
      for (const route of ROUTES) {
        const outbox = db.outbox.getByKey(
          'delivery',
          `outbox:${DeliveryService.idempotencyKey(route, artifact, SLOT, TARGET_ID)}`
        );
        expect(outbox).not.toBeNull();
        const payload = JSON.parse(outbox!.payloadJson) as { context: { deliveryTarget: string } };
        expect(payload.context.deliveryTarget).toBe(route);
      }
    });
  });

  it('never double-sends on re-run: the same artifact + route stays one intent', () => {
    withDb((db, dir) => {
      const service = new DeliveryService(db);
      const artifact = artifactFor(dir);
      const target = fanoutTarget(ROUTES);

      service.enqueue(artifact, target, { slotId: SLOT });
      const second = service.enqueue(artifact, target, { slotId: SLOT });

      expect(deliveriesFor(db)).toHaveLength(ROUTES.length);
      expect(outboxRows(db)).toHaveLength(ROUTES.length);
      // Every route was already owed a delivery: nothing new was created.
      expect(second.routes.every((route) => route.created === false)).toBe(true);
      expect(second.duplicate).toBe(false);
    });
  });

  it('retries ONLY the failed platform after a partial fan-out (Telegram ok / Discord failed / Feishu ok)', () => {
    withDb((db, dir) => {
      const service = new DeliveryService(db);
      const artifact = artifactFor(dir);
      const target = fanoutTarget(ROUTES);

      const first = service.enqueue(artifact, target, { slotId: SLOT });
      const byRoute = new Map(first.routes.map((route) => [route.deliveryTarget, route]));

      // Telegram ✓ and Feishu ✓ ACK; Discord's outbox row exhausted its retries.
      db.deliveries.recordAck(byRoute.get('telegram-main')!.deliveryId, { status: 'delivered', remoteId: 'tg-1' });
      db.deliveries.recordAck(byRoute.get('feishu-main')!.deliveryId, { status: 'delivered', remoteId: 'fs-1' });
      const discordKey = byRoute.get('discord-main')!.idempotencyKey;
      const discordOutbox = db.outbox.getByKey('delivery', `outbox:${discordKey}`);
      db.outbox.markDead(discordOutbox!.id, 'discord 500');

      expect(service.isDeliveredToAllTargets(ROUTES, 'illustration', artifact.pixivId)).toBe(false);
      expect(db.outbox.hasActionableDelivery(byRoute.get('discord-main')!.deliveryId)).toBe(false);

      // Recovery re-runs the SAME work. The two confirmed platforms must not be
      // touched at all, and Discord's own intent is the one that gets re-armed.
      const retry = service.enqueue(artifact, target, { slotId: SLOT });

      expect(retry.routes.map((route) => route.created)).toEqual([false, false, false]);
      expect(retry.duplicate).toBe(false);
      expect(retry.routes.map((route) => route.deliveryTarget)).toEqual(ROUTES);
      // Discord reuses its OWN existing intent (no second ledger row) and its
      // outbox row is actionable again.
      expect(retry.routes[2].created).toBe(false);
      expect(db.outbox.hasActionableDelivery(byRoute.get('discord-main')!.deliveryId)).toBe(true);

      // Still exactly one intent (and one outbox row) per platform — no duplicate sends.
      expect(deliveriesFor(db)).toHaveLength(ROUTES.length);
      expect(outboxRows(db)).toHaveLength(ROUTES.length);
      expect(
        db.deliveries.listForCell('telegram-main', SLOT, TARGET_ID).filter((r) => r.status === 'delivered')
      ).toHaveLength(1);
      expect(
        db.deliveries.listForCell('feishu-main', SLOT, TARGET_ID).filter((r) => r.status === 'delivered')
      ).toHaveLength(1);
      // ...and the two successful platforms were left exactly as they were: no
      // re-armed retry, no reset attempt budget.
      const tgRow = db.outbox.getByKey('delivery', `outbox:${byRoute.get('telegram-main')!.idempotencyKey}`)!;
      const fsRow = db.outbox.getByKey('delivery', `outbox:${byRoute.get('feishu-main')!.idempotencyKey}`)!;
      expect(tgRow.attempts).toBe(0);
      expect(fsRow.attempts).toBe(0);
      expect(db.outbox.list('dead', 200).filter((row) => row.kind === 'delivery')).toHaveLength(0);

      // Once Discord also ACKs, the work is done everywhere.
      db.deliveries.recordAck(byRoute.get('discord-main')!.deliveryId, { status: 'delivered', remoteId: 'dc-1' });
      expect(service.isDeliveredToAllTargets(ROUTES, 'illustration', artifact.pixivId)).toBe(true);
    });
  });

  it('reports duplicate only when EVERY platform already has the work', () => {
    withDb((db, dir) => {
      const service = new DeliveryService(db);
      const artifact = artifactFor(dir);
      const target = fanoutTarget(ROUTES);

      const first = service.enqueue(artifact, target, { slotId: SLOT });
      for (const route of first.routes) {
        db.deliveries.recordAck(route.deliveryId, { status: 'delivered' });
      }

      const again = service.enqueue(artifact, target, { slotId: SLOT });
      expect(again.duplicate).toBe(true);
      expect(again.routes.every((route) => route.created === false)).toBe(true);
      expect(deliveriesFor(db)).toHaveLength(ROUTES.length);
    });
  });

  it('keeps the historical single-target shape working (delivery.target only)', () => {
    withDb((db, dir) => {
      const service = new DeliveryService(db);
      const artifact = artifactFor(dir);
      const target = {
        id: TARGET_ID,
        type: 'illustration',
        tag: 'original',
        storageMode: 'cache',
        delivery: { target: 'telepost' },
      } as TargetConfig;

      const result = service.enqueue(artifact, target, { slotId: SLOT });

      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].deliveryTarget).toBe('telepost');
      expect(db.deliveries.listForCell('telepost', SLOT, TARGET_ID)).toHaveLength(1);
    });
  });

  it('resolves no route at all when nothing is configured (delivery stays optional)', () => {
    const bare = {
      id: TARGET_ID,
      type: 'illustration',
      tag: 'original',
      storageMode: 'cache',
      delivery: { target: '' },
    } as TargetConfig;

    expect(targetDeliveryNames(bare)).toEqual([]);
    expect(
      targetDeliveryNames({ ...bare, storageMode: 'persistent' } as TargetConfig)
    ).toEqual([]);
    expect(
      targetDeliveryNames({
        ...bare,
        delivery: { target: 'telepost', targets: ['a', 'b', 'a'] },
      } as TargetConfig)
    ).toEqual(['a', 'b']);
  });

  it('aggregates the slot cell state across routes: one platform confirmed is not "confirmed"', () => {
    withDb((db, dir) => {
      const service = new DeliveryService(db);
      const artifact = artifactFor(dir);
      const first = service.enqueue(artifact, fanoutTarget(ROUTES), { slotId: SLOT });
      const port = createDeliveryLedgerPort(db);

      // All three intents are live in the outbox.
      expect(port.stateFor({ deliveryTargets: ROUTES, slotId: SLOT, targetId: TARGET_ID })).toEqual({
        kind: 'live',
      });

      const byRoute = new Map(first.routes.map((route) => [route.deliveryTarget, route]));
      db.deliveries.recordAck(byRoute.get('telegram-main')!.deliveryId, { status: 'delivered' });
      // Two routes still owed: the cell is NOT done.
      expect(port.stateFor({ deliveryTargets: ROUTES, slotId: SLOT, targetId: TARGET_ID })).toEqual({
        kind: 'live',
      });

      for (const route of ROUTES) {
        db.deliveries.recordAck(byRoute.get(route)!.deliveryId, { status: 'delivered' });
      }
      expect(port.stateFor({ deliveryTargets: ROUTES, slotId: SLOT, targetId: TARGET_ID })).toEqual({
        kind: 'confirmed',
        workId: '1001',
        workType: 'illustration',
      });
    });
  });
});

/**
 * Durable intent before transport: the neutral content model is frozen into the
 * outbox payload at enqueue time, for EVERY route, so a provider never has to
 * re-derive media from downloader structures on a retry that runs in another
 * process days later.
 */
describe('multi-target fan-out freezes the content model into the outbox payload', () => {
  it('carries one content model per route, built from the resolved delivery files', () => {
    withDb((db, dir) => {
      const artifact = artifactFor(dir, '4242');
      const service = new DeliveryService(db);
      const names = ['telegram-main', 'discord-main'];
      const result = service.enqueue(artifact, fanoutTarget(names));

      expect(result.routes).toHaveLength(2);
      for (const route of result.routes) {
        const row = db.outbox.getByKey('delivery', `outbox:${route.idempotencyKey}`);
        expect(row).toBeTruthy();
        const payload = JSON.parse(row!.payloadJson) as {
          content?: { parts: Array<{ kind: string }>; workId: string; title: string };
        };
        expect(payload.content).toBeDefined();
        expect(payload.content!.workId).toBe('4242');
        expect(payload.content!.title).toBe('Work 4242');
        // One local jpg -> text part + standalone image part (never a 1-item album).
        expect(payload.content!.parts.map((part) => part.kind)).toEqual(['text', 'image']);
      }
    });
  });
});
