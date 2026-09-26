/**
 * WebUI Delivery History projection (P4).
 *
 * Pinned here:
 *  - the endpoint is a READ-ONLY projection of the existing ledger — it adds no
 *    state, and reading it never changes a delivery row;
 *  - a delivery is shown with the outbox state that will actually act on it, so
 *    "nothing will retry this" is visible;
 *  - no credential, path or stack ever appears in the payload.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { getDelivery, listDeliveries } from '../../webui/routes/handlers/delivery-handlers';

const DIR = mkdtempSync(join(tmpdir(), 'webui-deliveries-'));
const TEMP_DB = join(DIR, 'test.db');

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/pixivflow.yml',
  loadConfig: () => ({
    storage: { databasePath: join(DIR, 'test.db') },
    targets: [
      { name: 't1', storageMode: 'cache', delivery: { target: 'qq-main' } },
    ],
    delivery: {
      targets: {
        'qq-main': { type: 'webhook', url: 'https://gw.internal/hook' },
        'retired-route': { type: 'webhook', url: 'https://old.internal/hook' },
      },
    },
  }),
}));

function responder() {
  const state: { status: number; payload: any } = { status: 200, payload: null };
  const res: any = {
    json: (v: any) => { state.payload = v; return res; },
    status: (c: number) => { state.status = c; return res; },
  };
  return { state, res };
}

describe('WebUI delivery history projection', () => {
  beforeAll(() => {
    const db = new Database(TEMP_DB);
    db.migrate();
    // One delivered route, one failed route whose outbox row is still owed.
    db.deliveries.insertIntent({
      id: 'd-ok', deliveryTarget: 'qq-main', workType: 'illustration',
      pixivId: '100', idempotencyKey: 'k-ok',
    });
    db.deliveries.recordAck('d-ok', { status: 'delivered', remoteId: 'r1' });
    db.deliveries.insertIntent({
      id: 'd-bad', deliveryTarget: 'qq-main', workType: 'novel',
      pixivId: '200', idempotencyKey: 'k-bad',
    });
    const outbox = db.outbox.enqueue({
      kind: 'delivery', deliveryTarget: 'qq-main', idempotencyKey: 'outbox:k-bad',
      deliveryId: 'd-bad', payload: { files: [], context: { pixivId: '200' } },
    });
    db.deliveries.recordAck('d-bad', { status: 'failed', error: 'remote 500 from gateway' });
    db.outbox.recordEvent({
      outboxId: outbox.id, deliveryId: 'd-bad', event: 'outbox.retry_scheduled',
      errorClass: 'remote_5xx', retryable: true, countsAsAttempt: 1, actor: 'worker',
    });
    // A retired route still has ledger rows; history must not hide them.
    db.deliveries.insertIntent({
      id: 'd-old', deliveryTarget: 'retired-route', workType: 'illustration',
      pixivId: '300', idempotencyKey: 'k-old',
    });
    db.deliveries.recordAck('d-old', { status: 'failed', error: 'route retired' });
    db.close();
  });

  afterAll(() => rmSync(DIR, { recursive: true, force: true }));

  it('lists every route with counts and joins the outbox state per intent', async () => {
    const { state, res } = responder();
    await listDeliveries({ query: {} } as any, res);

    expect(state.status).toBe(200);
    const data = state.payload.data;
    expect(data.schemaVersion).toBe(1);
    expect(data.readOnly).toBe(true);
    expect(data.counts.delivered).toBe(1);
    expect(data.counts.failed).toBe(2);
    expect(data.perRoute['qq-main'].delivered).toBe(1);
    expect(data.perRoute['qq-main'].failed).toBe(1);
    expect(data.perRoute['retired-route'].failed).toBe(1);

    const bad = data.deliveries.find((d: any) => d.id === 'd-bad');
    expect(bad.outboxStatus).toBe('pending');
    expect(bad.lastError).toContain('remote 500');
    // Routes are config truth, including one no download target enables.
    expect(data.routes.map((r: any) => r.name).sort()).toEqual(['qq-main', 'retired-route']);
    expect(data.routes.find((r: any) => r.name === 'qq-main').enabled).toBe(true);
    expect(data.routes.find((r: any) => r.name === 'retired-route').enabled).toBe(false);

    const serialized = JSON.stringify(state.payload);
    expect(serialized).not.toMatch(/token|secret|password/i);
    expect(serialized).not.toContain(DIR);
  });

  it('filters by status and rejects an unknown status', async () => {
    const failed = responder();
    await listDeliveries({ query: { status: 'failed' } } as any, failed.res);
    expect(failed.state.payload.data.deliveries.map((d: any) => d.id)).toEqual(['d-bad', 'd-old']);

    const invalid = responder();
    await listDeliveries({ query: { status: 'exploded' } } as any, invalid.res);
    expect(invalid.state.status).toBe(400);
    expect(invalid.state.payload.errorCode).toBe('DELIVERY_STATUS_INVALID');
  });

  it('returns one intent with its outbox row and event trail', async () => {
    const { state, res } = responder();
    await getDelivery({ params: { id: 'd-bad' } } as any, res);

    expect(state.status).toBe(200);
    expect(state.payload.data.delivery.id).toBe('d-bad');
    expect(state.payload.data.delivery.status).toBe('failed');
    expect(state.payload.data.outbox.status).toBe('pending');
    expect(state.payload.data.events[0]).toMatchObject({
      event: 'outbox.retry_scheduled',
      errorClass: 'remote_5xx',
      countsAsAttempt: 1,
      actor: 'worker',
    });
  });

  it('404s for an unknown intent and 400s for a malformed id', async () => {
    const missing = responder();
    await getDelivery({ params: { id: 'nope' } } as any, missing.res);
    expect(missing.state.status).toBe(404);
    expect(missing.state.payload.errorCode).toBe('DELIVERY_NOT_FOUND');

    const malformed = responder();
    await getDelivery({ params: { id: '' } } as any, malformed.res);
    expect(malformed.state.status).toBe(400);
  });

  it('never mutates the ledger when read', async () => {
    const before = new Database(TEMP_DB);
    const snapshot = before.deliveries.listRecent({ limit: 50 }).map((d) => `${d.id}:${d.status}:${d.attempts}`);
    before.close();

    const { res } = responder();
    await listDeliveries({ query: {} } as any, res);

    const after = new Database(TEMP_DB);
    expect(after.deliveries.listRecent({ limit: 50 }).map((d) => `${d.id}:${d.status}:${d.attempts}`)).toEqual(snapshot);
    after.close();
  });
});
