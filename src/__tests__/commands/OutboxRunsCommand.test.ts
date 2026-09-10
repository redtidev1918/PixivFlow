/**
 * CLI audit behavior: operator retry/cancel record actor=cli events, and
 * outbox inspect surfaces deferred (no-attempt) vs attempt-consuming events.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { OutboxCommand } from '../../commands/OutboxCommand';

function ctx(dbPath: string) {
  return {
    config: { storage: { databasePath: dbPath } } as any,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    configPath: '',
  };
}

describe('OutboxCommand audit events', () => {
  let dir: string;
  let dbPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-cli-'));
    dbPath = join(dir, 't.db');
    const db = new Database(dbPath);
    db.migrate();
    db.close();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('retry records outbox.replay_requested with actor=cli, zero attempts', async () => {
    const db = new Database(dbPath);
    const row = db.outbox.enqueue({
      kind: 'notification', deliveryTarget: 't', idempotencyKey: 'k1',
      payload: { text: 'x' },
    });
    db.outbox.markRetry(row.id, Date.now(), 'boom');
    // exhaust to dead
    for (let i = 0; i < 20 && db.outbox.get(row.id)!.status !== 'dead'; i++) {
      db.outbox.markRetry(row.id, Date.now(), 'boom');
    }
    db.close();

    const command = new OutboxCommand();
    const result = await command.execute(ctx(dbPath), { options: {}, positional: ['retry', row.id] });
    expect(result.success).toBe(true);

    const db2 = new Database(dbPath);
    const event = db2.outbox.listEvents({ outboxId: row.id })[0];
    expect(event).toMatchObject({ event: 'outbox.replay_requested', actor: 'cli', countsAsAttempt: 0 });
    db2.close();
  });

  it('cancel records outbox.cancelled with actor=cli and inspect prints the event trail', async () => {
    const file = join(dir, 'f.txt');
    writeFileSync(file, 'x');
    const db = new Database(dbPath);
    const { row: delivery } = db.deliveries.insertIntent({
      id: 'd-1', deliveryTarget: 't', workType: 'illustration',
      pixivId: '7', idempotencyKey: 'dk1',
    });
    const row = db.outbox.enqueue({
      kind: 'delivery', deliveryTarget: 't', idempotencyKey: 'k2',
      deliveryId: delivery.id,
      payload: { files: [file], context: { executionId: 'e1', slotId: 'e1', pixivId: '7' } },
    });
    db.outbox.recordEvent({
      outboxId: row.id, event: 'outbox.deferred', errorClass: 'dependency_not_ready',
      retryable: true, countsAsAttempt: 0, detail: { reason: 'http_503', status: 503 },
    });
    db.close();

    const command = new OutboxCommand();
    const cancel = await command.execute(ctx(dbPath), { options: {}, positional: ['cancel', row.id] });
    expect(cancel.success).toBe(true);

    const inspect = await command.execute(ctx(dbPath), { options: {}, positional: ['inspect', row.id] });
    expect(inspect.success).toBe(true);
    const events = (inspect.data as { events: Array<{ event: string; actor: string | null; countsAsAttempt: number }> }).events;
    expect(events.some((e) => e.event === 'outbox.cancelled' && e.actor === 'cli')).toBe(true);
    const deferred = events.find((e) => e.event === 'outbox.deferred')!;
    expect(deferred.countsAsAttempt).toBe(0);
  });
});
