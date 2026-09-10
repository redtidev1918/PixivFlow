/**
 * Doctor + reconcile CLI tests: crash-recovery convergence actions and the
 * manual historical-duplicate ledger path.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { DoctorCommand } from '../../commands/DoctorCommand';
import { ReconcileCommand } from '../../commands/ReconcileCommand';
import { OutboxCommand } from '../../commands/OutboxCommand';
import { logger } from '../../logger';

function ctx(dbPath: string) {
  return {
    config: { storage: { databasePath: dbPath } } as any,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    configPath: '',
  };
}

let consoleSpy: jest.SpyInstance;
beforeEach(() => {
  consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => consoleSpy.mockRestore());

describe('doctor command', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-doctor-'));
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports a stale processing outbox row read-only and releases it only with --repair', async () => {
    const dbPath = join(dir, 't.db');
    const db = new Database(dbPath);
    db.migrate();
    const row = db.outbox.enqueue({
      kind: 'notification', deliveryTarget: 't', idempotencyKey: 'k1',
      payload: { text: 'x' },
    });
    // A crashed worker left the row claimed with an expired lease.
    db.outbox.claimDue('dead', 1, 5);
    db.close();

    const command = new DoctorCommand();
    const dry = await command.execute(ctx(dbPath), { options: {}, positional: [] });
    expect(dry.success).toBe(true);
    const codes = (dry.data as any).findings.map((f: any) => f.code);
    expect(codes).toContain('outbox-stale-processing');

    const db2 = new Database(dbPath);
    expect(db2.outbox.get(row.id)?.status).toBe('processing'); // untouched without --repair
    db2.close();

    const repaired = await command.execute(ctx(dbPath), { options: { repair: true }, positional: [] });
    expect(repaired.success).toBe(true);
    expect((repaired.data as any).repaired.some((x: string) => x.includes('stale processing'))).toBe(true);
    const db3 = new Database(dbPath);
    expect(db3.outbox.get(row.id)?.status).not.toBe('processing');
    db3.close();
  });

  it('flags dead outbox rows as critical', async () => {
    const dbPath = join(dir, 't2.db');
    const db = new Database(dbPath);
    db.migrate();
    const row = db.outbox.enqueue({
      kind: 'notification', deliveryTarget: 't', idempotencyKey: 'kdead',
      payload: { text: 'x' }, maxAttempts: 1,
    });
    db.outbox.markRetry(row.id, Date.now() - 1, 'boom');
    // markRetry with attempts exhausted marks dead
    db.close();

    const res = await new DoctorCommand().execute(ctx(dbPath), { options: {}, positional: [] });
    const crit = (res.data as any).findings.filter((f: any) => f.level === 'critical');
    expect(crit.map((f: any) => f.code)).toContain('outbox-dead');
  });
});

describe('reconcile command', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-reconcile-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('dry-run changes nothing; --repair records the historical duplicate and is idempotent', async () => {
    const dbPath = join(dir, 't.db');
    const db = new Database(dbPath);
    db.migrate();
    expect(db.deliveries.isDelivered('bot1', 'illustration', '777')).toBe(false);
    db.close();

    const command = new ReconcileCommand();
    const args = { options: { target: 'bot1', type: 'illustration', 'pixiv-id': '777', 'remote-id': '42' }, positional: [] };

    const dry = await command.execute(ctx(dbPath), args);
    expect(dry.success).toBe(true);
    expect((dry.data as any).dryRun).toBe(true);
    const db1 = new Database(dbPath);
    expect(db1.deliveries.isDelivered('bot1', 'illustration', '777')).toBe(false);
    db1.close();

    const applied = await command.execute(ctx(dbPath), {
      options: { ...args.options, repair: true }, positional: [],
    });
    expect(applied.success).toBe(true);
    const db2 = new Database(dbPath);
    expect(db2.deliveries.isDelivered('bot1', 'illustration', '777')).toBe(true);
    db2.close();

    // Second repair is a noop (already reconciled).
    const again = await command.execute(ctx(dbPath), {
      options: { ...args.options, repair: true }, positional: [],
    });
    expect((again.data as any).noop).toBe(true);
  });

  it('rejects invalid work type and missing required options', async () => {
    const dbPath = join(dir, 't2.db');
    const command = new ReconcileCommand();
    const badType = await command.execute(ctx(dbPath), {
      options: { target: 'bot1', type: 'video', 'pixiv-id': '1' }, positional: [],
    });
    expect(badType.success).toBe(false);
    const missing = await command.execute(ctx(dbPath), { options: { target: 'bot1' }, positional: [] });
    expect(missing.success).toBe(false);
  });
});

describe('outbox command', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-outbox-cli-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists, inspects, retries dead rows and cancels pending rows', async () => {
    const dbPath = join(dir, 't.db');
    const db = new Database(dbPath);
    db.migrate();
    const dead = db.outbox.enqueue({
      kind: 'notification', deliveryTarget: 't', idempotencyKey: 'dead',
      payload: { text: 'x' }, maxAttempts: 1,
    });
    db.outbox.markRetry(dead.id, Date.now(), 'boom');
    const pending = db.outbox.enqueue({
      kind: 'notification', deliveryTarget: 't', idempotencyKey: 'pending',
      payload: { text: 'y' },
    });
    db.close();

    const command = new OutboxCommand();
    expect((await command.execute(ctx(dbPath), {
      options: { status: 'dead' }, positional: ['list'],
    })).data).toEqual([expect.objectContaining({ id: dead.id, status: 'dead' })]);
    expect((await command.execute(ctx(dbPath), {
      options: {}, positional: ['inspect', dead.id],
    })).success).toBe(true);
    expect((await command.execute(ctx(dbPath), {
      options: { dead: true }, positional: ['retry'],
    })).success).toBe(true);
    expect((await command.execute(ctx(dbPath), {
      options: {}, positional: ['cancel', pending.id],
    })).success).toBe(true);

    const check = new Database(dbPath);
    expect(check.outbox.get(dead.id)).toMatchObject({ status: 'retry_wait', attempts: 0 });
    expect(check.outbox.get(pending.id)).toMatchObject({ status: 'cancelled' });
    check.close();
  });
});
