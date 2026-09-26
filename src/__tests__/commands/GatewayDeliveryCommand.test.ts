/**
 * Operator CLI for the Messaging Gateway plane (P4).
 *
 * Three properties are pinned here because they are the ones an operator relies
 * on when a delivery went wrong:
 *
 *  - the route list is CONFIG truth, so a declared route shows up even when no
 *    enabled download target points at it any more (its ledger rows persist);
 *  - `gateway test` never turns "the endpoint answered" into a delivery claim,
 *    and persists only a redacted endpoint (never a credential);
 *  - `delivery retry` is preview-by-default and refuses to re-arm a route whose
 *    outbox row is still actionable, so a manual retry can never double-send.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { GatewayCommand } from '../../commands/GatewayCommand';
import { DeliveryCommand } from '../../commands/DeliveryCommand';

function ctx(config: Record<string, unknown>, dbPath: string) {
  return {
    config: { ...config, storage: { databasePath: dbPath } } as any,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    configPath: '',
  };
}

const WEBHOOK_ROUTE = {
  url: 'https://user:secret@gateway.internal/hook?token=abc123',
  type: 'webhook',
  signingSecret: 'shh',
};

function configWithRoutes(): Record<string, unknown> {
  return {
    targets: [
      {
        name: 't1',
        storageMode: 'cache',
        delivery: { target: 'primary-route', targets: ['primary-route', 'second-route'] },
      },
      // Declared but referenced by nothing: still a real route.
      { name: 't2', storageMode: 'persistent', delivery: { target: 'orphan-route' } },
    ],
    delivery: {
      targets: {
        'primary-route': WEBHOOK_ROUTE,
        'second-route': { type: 'webhook', url: 'https://second.internal/hook' },
        'orphan-route': { type: 'webhook', url: 'https://orphan.internal/hook' },
      },
    },
  };
}

describe('GatewayCommand', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-gateway-cli-'));
    dbPath = join(dir, 't.db');
    const db = new Database(dbPath);
    db.migrate();
    db.close();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists config truth including routes no enabled target points at', async () => {
    const result = await new GatewayCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { json: true },
      positional: ['list'],
    });
    expect(result.success).toBe(true);
    const data = result.data as { gateways: Array<Record<string, unknown>> };
    expect(data.gateways.map((g) => g.name)).toEqual([
      'orphan-route',
      'primary-route',
      'second-route',
    ]);
    const primary = data.gateways.find((g) => g.name === 'primary-route')!;
    const orphan = data.gateways.find((g) => g.name === 'orphan-route')!;
    expect(primary.enabled).toBe(true);
    expect(orphan.enabled).toBe(false);
    // Credentials in the URL must never reach the operator view.
    // redactUrl drops userinfo and the whole query string.
    expect(primary.endpoint).toBe('https://redacted@gateway.internal/hook?…');
    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('reports an empty plane without failing when no route is configured', async () => {
    const result = await new GatewayCommand().execute(ctx({ targets: [], delivery: { targets: {} } }, dbPath), {
      options: {},
      positional: ['list'],
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('No delivery targets are configured');
  });

  it('persists a redacted endpoint and a weak verdict when probed', async () => {
    const probe = jest.fn().mockResolvedValue({
      probe: 'http-reachability',
      reachable: true,
      status: 'connected',
      httpStatus: 405,
      note: 'the endpoint answered HTTP',
    });
    const result = await new GatewayCommand(probe).execute(ctx(configWithRoutes(), dbPath), {
      options: { json: true },
      positional: ['test', 'primary-route'],
    });
    expect(result.success).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);

    const db = new Database(dbPath);
    const row = db.gatewayConnections.getByName('primary-route')!;
    expect(row.status).toBe('connected');
    expect(row.endpoint).toBe('https://redacted@gateway.internal/hook?…');
    expect(JSON.stringify(row)).not.toContain('secret');
    const data = result.data as Record<string, unknown>;
    expect(data.httpStatus).toBe(405);
    db.close();
  });

  it('fails loudly for an unknown route and for unknown actions', async () => {
    const command = new GatewayCommand();
    const missing = await command.execute(ctx(configWithRoutes(), dbPath), {
      options: {},
      positional: ['status', 'nope'],
    });
    expect(missing.success).toBe(false);
    const invalid = command.validate({ options: {}, positional: ['frobnicate'] });
    expect(invalid.valid).toBe(false);
    const needsName = command.validate({ options: {}, positional: ['test'] });
    expect(needsName.valid).toBe(false);
  });

  it('prints ledger counts per route', async () => {
    const db = new Database(dbPath);
    db.deliveries.insertIntent({
      id: 'd-1',
      deliveryTarget: 'primary-route',
      workType: 'illustration',
      pixivId: '7',
      idempotencyKey: 'k1',
    });
    db.deliveries.recordAck('d-1', { status: 'delivered', remoteId: 'r1' });
    db.close();

    const result = await new GatewayCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: {},
      positional: ['list'],
    });
    expect(result.message).toContain('primary-route');
    const status = await new GatewayCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { json: true },
      positional: ['status', 'primary-route'],
    });
    const data = status.data as { deliveryCounts: Record<string, number>; history: unknown[] };
    expect(data.deliveryCounts.delivered).toBe(1);
    expect(data.history.length).toBe(1);
  });
});

describe('DeliveryCommand', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-delivery-cli-'));
    dbPath = join(dir, 't.db');
    const db = new Database(dbPath);
    db.migrate();
    db.close();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** One failed delivery with a dead outbox row (the retryable shape). */
  function seedDeadFailed(deliveryTarget: string, key: string): { deliveryId: string; outboxId: string } {
    const db = new Database(dbPath);
    const { row: delivery } = db.deliveries.insertIntent({
      id: `d-${key}`,
      deliveryTarget,
      workType: 'illustration',
      pixivId: key,
      idempotencyKey: `key-${key}`,
    });
    const outbox = db.outbox.enqueue({
      kind: 'delivery',
      deliveryTarget,
      idempotencyKey: `outbox:key-${key}`,
      deliveryId: delivery.id,
      payload: { files: [], context: { pixivId: key } },
    });
    db.deliveries.recordAck(delivery.id, { status: 'failed', error: 'remote 500' });
    db.outbox.markDead(outbox.id, 'remote 500');
    db.close();
    return { deliveryId: delivery.id, outboxId: outbox.id };
  }

  it('previews by default and changes nothing without --yes', async () => {
    const { deliveryId, outboxId } = seedDeadFailed('primary-route', 'a');
    const result = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { json: true },
      positional: ['retry', '--target', 'primary-route'],
    });
    expect(result.success).toBe(true);
    const data = result.data as { applied: boolean; retried: Array<Record<string, unknown>> };
    expect(data.applied).toBe(false);
    expect(data.retried.map((r) => r.id)).toEqual([deliveryId]);

    const db = new Database(dbPath);
    expect(db.outbox.get(outboxId)!.status).toBe('dead');
    expect(db.outbox.listEvents({ outboxId }).length).toBe(0);
    db.close();
  });

  it('re-arms a dead route with --yes and records an actor=cli event without spending an attempt', async () => {
    const { deliveryId, outboxId } = seedDeadFailed('primary-route', 'b');
    const result = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { yes: true, json: true, target: 'primary-route' },
      positional: ['retry'],
    });
    expect(result.success).toBe(true);
    expect((result.data as { applied: boolean }).applied).toBe(true);

    const db = new Database(dbPath);
    const row = db.outbox.get(outboxId)!;
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(0);
    expect(row.lastError).toBeNull();
    const events = db.outbox.listEvents({ outboxId });
    expect(events[0]).toMatchObject({
      event: 'outbox.replay_requested',
      actor: 'cli',
      countsAsAttempt: 0,
      deliveryId,
    });
    db.close();
  });

  it('refuses to re-arm a failed delivery whose outbox row is still actionable', async () => {
    const db = new Database(dbPath);
    const { row: delivery } = db.deliveries.insertIntent({
      id: 'd-pending',
      deliveryTarget: 'primary-route',
      workType: 'illustration',
      pixivId: 'p1',
      idempotencyKey: 'key-pending',
    });
    const outbox = db.outbox.enqueue({
      kind: 'delivery',
      deliveryTarget: 'primary-route',
      idempotencyKey: 'outbox:key-pending',
      deliveryId: delivery.id,
      payload: { files: [], context: { pixivId: 'p1' } },
    });
    // Ledger says failed, but the worker still owns the attempt.
    db.deliveries.recordAck(delivery.id, { status: 'failed', error: 'transient' });
    db.close();

    const result = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { yes: true, json: true, target: 'primary-route' },
      positional: ['retry'],
    });
    const data = result.data as { retried: unknown[]; skipped: Array<Record<string, unknown>> };
    expect(data.retried).toEqual([]);
    expect(data.skipped.map((s) => s.id)).toEqual([delivery.id]);
    expect(String(data.skipped[0].note)).toContain('still actionable');

    const db2 = new Database(dbPath);
    expect(db2.outbox.get(outbox.id)!.attempts).toBe(0);
    expect(db2.outbox.listEvents({ outboxId: outbox.id }).length).toBe(0);
    db2.close();
  });

  it('refuses to re-arm delivered or duplicate work', async () => {
    const db = new Database(dbPath);
    db.deliveries.insertIntent({
      id: 'd-done',
      deliveryTarget: 'primary-route',
      workType: 'illustration',
      pixivId: 'done-1',
      idempotencyKey: 'key-done',
    });
    db.deliveries.recordAck('d-done', { status: 'delivered', remoteId: 'r1' });
    db.close();

    const result = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { yes: true, json: true, target: 'primary-route', status: 'delivered' },
      positional: ['retry'],
    });
    expect((result.data as { retried: unknown[] }).retried).toEqual([]);

    const byId = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { yes: true, json: true, id: 'd-done' },
      positional: ['retry'],
    });
    expect((byId.data as { retried: unknown[] }).retried).toEqual([]);

    const db2 = new Database(dbPath);
    expect(db2.deliveries.getById('d-done')!.status).toBe('delivered');
    db2.close();
  });

  it('shows per-gateway counts with no filter and rejects an unknown status', async () => {
    seedDeadFailed('primary-route', 'c');
    const result = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { json: true },
      positional: ['status'],
    });
    const data = result.data as { counts: Record<string, Record<string, number>> };
    expect(data.counts['primary-route'].failed).toBe(1);

    const invalid = new DeliveryCommand().validate({ options: { status: 'exploded' }, positional: ['status'] });
    expect(invalid.valid).toBe(false);
  });

  it('takes the delivery id positionally, the way an operator types it', async () => {
    const { deliveryId, outboxId } = seedDeadFailed('primary-route', 'd');

    const looked = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { json: true },
      positional: ['status', deliveryId],
    });
    expect(looked.success).toBe(true);
    expect((looked.data as { delivery: Record<string, unknown> }).delivery.id).toBe(deliveryId);

    const retried = await new DeliveryCommand().execute(ctx(configWithRoutes(), dbPath), {
      options: { yes: true, json: true },
      positional: ['retry', deliveryId],
    });
    expect((retried.data as { applied: boolean }).applied).toBe(true);

    const db = new Database(dbPath);
    expect(db.outbox.get(outboxId)!.status).toBe('pending');
    expect(db.outbox.listEvents({ outboxId })[0]).toMatchObject({
      event: 'outbox.replay_requested',
      actor: 'cli',
      deliveryId,
    });
    db.close();
  });

  it('refuses two different delivery ids in one command', async () => {
    const command = new DeliveryCommand();
    const accepted = command.validate({ options: {}, positional: ['retry', 'd-1'] });
    expect(accepted.valid).toBe(true);

    const agreed = command.validate({ options: { id: 'd-1' }, positional: ['retry', 'd-1'] });
    expect(agreed.valid).toBe(true);

    const conflicting = command.validate({ options: { id: 'd-1' }, positional: ['retry', 'd-2'] });
    expect(conflicting.valid).toBe(false);
    expect(conflicting.errors.join(' ')).toContain('d-2');
    expect(conflicting.errors.join(' ')).toContain('d-1');
  });
});
