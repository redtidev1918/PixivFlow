import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../../storage/Database';
import { SlotCoordinator } from '../../scheduler/SlotCoordinator';
import { RunsCommand } from '../../commands/RunsCommand';

function ctx(dbPath: string) {
  return {
    config: { storage: { databasePath: dbPath } } as any,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    configPath: '',
  };
}

describe('executionSummary + runs command', () => {
  let dir: string;
  let db: Database;
  const slotId = 'plan-a@2026-09-08:morning';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pf-runs-'));
    db = new Database(join(dir, 't.db'));
    db.migrate();
    // One partial occurrence: one delivered target + one no_candidate target.
    db.slots.getOrCreateSlot(slotId, { scheduleId: 'plan-a', targetIds: ['bot1-novel', 'bot2-illust'] });
    db.slots.materializeCells(slotId, ['bot1-novel', 'bot2-illust'], (id) =>
      id.includes('novel') ? 'novel' : 'illustration');
    const coord = new SlotCoordinator(db);
    coord.applyOutcome(slotId, 'bot1-novel', {
      kind: 'submitted', workId: '9001', workType: 'novel',
    });
    coord.applyOutcome(slotId, 'bot2-illust', {
      kind: 'no_candidate', reason: 'no matching illustration after filtering/dedupe',
    });
    db.deliveries.insertIntent({
      id: 'dl-1', deliveryTarget: 'bot1-novel', workType: 'novel',
      pixivId: '9001', slotId, targetId: 'bot1-novel', idempotencyKey: 'idem-1',
    });
    db.deliveries.recordAck('dl-1', {
      status: 'delivered', remoteId: 'r-42', remoteStatus: 'accepted',
    });
    db.insertDownload({
      pixivId: '9001', type: 'novel', tag: 'topic', title: 'T',
      filePath: join(dir, '9001.txt'),
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('renders a partial summary with a no_candidate target and a delivered target', () => {
    const summary = db.outbox.executionSummary(slotId) as any;
    expect(summary.status).toBe('partial');
    expect(summary.scheduleId).toBe('plan-a');
    expect(summary.candidates.selected).toBe(1);
    expect(summary.candidates.none).toEqual([
      { target: 'bot2-illust', reason: 'no matching illustration after filtering/dedupe' },
    ]);
    expect(summary.deliveries).toHaveLength(1);
    expect(summary.deliveries[0]).toMatchObject({
      target: 'bot1-novel', pixivId: '9001', status: 'delivered', remoteStatus: 'accepted', reviewId: 'r-42',
    });
    expect(summary.downloads[0]).toMatchObject({ pixivId: '9001', workType: 'novel', files: 1 });
    expect(summary.warnings.some((w: string) => w.startsWith('no_candidate: bot2-illust'))).toBe(true);
  });

  it('persists an execution.summary event when the slot occurrence finishes (once)', () => {
    const coord = new SlotCoordinator(db);
    coord.finish(
      { slotId, scheduleId: 'plan-a' } as any,
      { id: 'plan-a' } as any,
      [{ id: 'bot1-novel' } as any, { id: 'bot2-illust' } as any],
    );
    coord.finish(
      { slotId, scheduleId: 'plan-a' } as any,
      { id: 'plan-a' } as any,
      [{ id: 'bot1-novel' } as any, { id: 'bot2-illust' } as any],
    );
    const summaries = db.outbox.listEvents({ executionId: slotId })
      .filter((e) => e.event === 'execution.summary');
    expect(summaries).toHaveLength(1);
  });

  it('runs list and runs show work through the command harness', async () => {
    db.logSchedulerExecution(1, 'success', new Date(Date.now() - 1000), new Date(), 1000, null, 1, 'plan-a');
    const dbPath = db.getDatabasePath();
    db.close();

    const command = new RunsCommand();
    const list = await command.execute(ctx(dbPath), { options: { limit: '20' }, positional: ['list'] });
    expect(list.success).toBe(true);
    expect((list.data as any[])[0]).toMatchObject({ number: 1, scheduleId: 'plan-a', status: 'success' });

    const show = await command.execute(ctx(dbPath), { options: {}, positional: ['show', slotId] });
    expect(show.success).toBe(true);
    expect((show.data as any).status).toBe('partial');
  });
});
