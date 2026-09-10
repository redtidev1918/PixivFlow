import { DownloadPlanner } from '../../download/plan/DownloadPlanner';

const target = { id: 't1', type: 'illustration', limit: 1 } as never;

function database() {
  return {
    getDownloadedIds: () => new Set<string>(),
    getValidItemIds: (ids: string[]) => ids,
    getDownloadedIllustrationIds: () => new Set<string>(),
    getDownloadedNovelIds: () => new Set<string>(),
  } as never;
}

const items = [
  { id: 1, title: 'a', create_date: '2026-09-11T00:00:00+09:00', tags: [] },
  { id: 2, title: 'b', create_date: '2026-09-10T00:00:00+09:00', tags: [] },
] as never[];

describe('durable duplicate history', () => {
  it('skips works the bot already handled', () => {
    const planner = new DownloadPlanner(database(), {
      processedIds: (type, ids) => new Set(type === 'illustration' ? ids.filter((id) => id === '2') : []),
    });
    const planned = planner.planDownloads(items as never, target, 'illustration');
    expect((planned.queue as Array<{ id: number }>).map((item) => item.id)).toEqual([1]);
  });

  it('does not depend on a local delivery target being configured', () => {
    // The batch/shadow config strips every delivery target; the durable history
    // must still apply, otherwise a fresh runner re-selects old work.
    const planner = new DownloadPlanner(database(), {
      processedIds: () => new Set(['1', '2']),
    });
    const planned = planner.planDownloads(items as never, target, 'illustration');
    expect(planned.queue).toHaveLength(0);
  });

  it('leaves planning alone when no history is supplied', () => {
    const planner = new DownloadPlanner(database(), {});
    const planned = planner.planDownloads(items as never, target, 'illustration');
    expect((planned.queue as Array<{ id: number }>).length).toBeGreaterThan(0);
  });

  it('continues loudly when the history lookup throws', () => {
    const planner = new DownloadPlanner(database(), {
      processedIds: () => {
        throw new Error('control plane down');
      },
    });
    const planned = planner.planDownloads(items as never, target, 'illustration');
    expect((planned.queue as Array<{ id: number }>).length).toBeGreaterThan(0);
  });
});
