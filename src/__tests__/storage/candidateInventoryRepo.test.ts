import { Database } from '../../storage/Database';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-inventory-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  return fn(db).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

describe('CandidateInventoryRepository', () => {
  it('claims oldest pending and marks submitted/filtered/pending', async () => {
    await withDb(async (db) => {
      const repo = db.candidateInventory;
      const base = { workType: 'novel' as const, topic: '丸呑み', targetId: 'bot2-novel', maxAgeDays: 30 };
      repo.upsert({ pixivId: '101', workType: base.workType, topic: base.topic, targetId: base.targetId, snapshot: { id: 101 }, date: '2026-09-02', maxAgeDays: base.maxAgeDays });
      repo.upsert({ pixivId: '100', workType: base.workType, topic: base.topic, targetId: base.targetId, snapshot: { id: 100 }, date: '2026-09-01', maxAgeDays: base.maxAgeDays });
      const claimed = repo.claimNext({ topic: base.topic, targetId: base.targetId, reserveSize: 10, date: '2026-09-18' });
      expect(claimed!.pixivId).toBe('100');
      // The claimed row leaves the pending window; the unclaimed one stays.
      expect(repo.pendingSummary(base.topic, base.targetId).count).toBe(1);
      repo.markSubmitted('100', base.workType, base.topic, base.targetId);
      expect(repo.pendingSummary(base.topic, base.targetId).count).toBe(1);
      // filtered removes the unusable row too.
      const second = repo.claimNext({ topic: base.topic, targetId: base.targetId, reserveSize: 10, date: '2026-09-18' });
      expect(second!.pixivId).toBe('101');
      repo.markFiltered('101', base.workType, base.topic, base.targetId);
      expect(repo.pendingSummary(base.topic, base.targetId).count).toBe(0);
    });
  });

  it('expired rows stop being claimable', async () => {
    await withDb(async (db) => {
      const repo = db.candidateInventory;
      const topic = 'old-topic', targetId = 'old-target';
      repo.upsert({ pixivId: '1', workType: 'illustration', topic, targetId, snapshot: { id: 1 }, date: '2026-08-01', maxAgeDays: 5 });
      repo.evictExpired(topic, targetId);
      expect(repo.pendingSummary(topic, targetId).count).toBe(0);
      expect(repo.claimNext({ topic, targetId, reserveSize: 5, date: '2026-09-18' })).toBeNull();
    });
  });
});
