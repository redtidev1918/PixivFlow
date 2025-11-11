import type { TargetConfig } from '../../../config';
import type { IDatabase } from '../../../interfaces/IDatabase';
import type { PixivIllust } from '../../../pixiv/types';
import { DownloadPlanner } from '../../../download/plan/DownloadPlanner';

jest.mock('../../../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const createTarget = (overrides: Partial<TargetConfig> = {}): TargetConfig => ({
  type: 'illustration',
  ...overrides,
});

const createIllustration = (
  id: number,
  overrides: Partial<PixivIllust> = {}
): PixivIllust => ({
  id,
  title: `Illust ${id}`,
  page_count: 1,
  user: { id: 'user', name: 'User' },
  image_urls: {
    square_medium: `https://example.com/${id}/square`,
    medium: `https://example.com/${id}/medium`,
    large: `https://example.com/${id}/large`,
  },
  create_date: '2024-01-01T00:00:00+09:00',
  ...overrides,
});

const createDatabaseMock = (downloadedIds: string[] = []) => {
  const getDownloadedIds = jest.fn(
    () => new Set<string>(downloadedIds)
  );
  const database = {
    getDownloadedIds,
  } as unknown as IDatabase;

  return { database, getDownloadedIds };
};

describe('DownloadPlanner', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns an empty plan when no items are provided', () => {
    const { database, getDownloadedIds } = createDatabaseMock();
    const planner = new DownloadPlanner(database);
    const target = createTarget();

    const plan = planner.planDownloads([], target, 'illustration');

    expect(plan.queue).toHaveLength(0);
    expect(plan.mode).toBe('sequential');
    expect(plan.limit).toBe(10);
    expect(plan.filteredOut).toBe(0);
    expect(plan.deduplicated).toBe(0);
    expect(plan.alreadyDownloaded).toBe(0);
    expect(plan.availableCount).toBe(0);
    expect(plan.originalCount).toBe(0);
    expect(getDownloadedIds).not.toHaveBeenCalled();
  });

  it('deduplicates items by identifier before planning', () => {
    const { database, getDownloadedIds } = createDatabaseMock();
    const planner = new DownloadPlanner(database);
    const items = [
      createIllustration(1),
      createIllustration(1, { title: 'Duplicate' }),
      createIllustration(2),
    ];

    const plan = planner.planDownloads(items, createTarget({ limit: 5 }), 'illustration');

    expect(plan.queue.map((item) => item.id)).toEqual([1, 2]);
    expect(plan.deduplicated).toBe(1);
    expect(plan.filteredOut).toBe(0);
    expect(plan.availableCount).toBe(2);
    expect(plan.originalCount).toBe(3);
    expect(getDownloadedIds).toHaveBeenCalledWith(['1', '2'], 'illustration');
  });

  it('excludes items that were already downloaded', () => {
    const { database, getDownloadedIds } = createDatabaseMock(['2']);
    const planner = new DownloadPlanner(database);
    const items = [
      createIllustration(1),
      createIllustration(2),
      createIllustration(3),
    ];

    const plan = planner.planDownloads(items, createTarget({ limit: 10 }), 'illustration');

    expect(plan.queue.map((item) => item.id)).toEqual([1, 3]);
    expect(plan.availableCount).toBe(2);
    expect(plan.alreadyDownloaded).toBe(1);
    expect(plan.deduplicated).toBe(0);
    expect(plan.filteredOut).toBe(0);
    expect(plan.originalCount).toBe(3);
    expect(getDownloadedIds).toHaveBeenCalledWith(['1', '2', '3'], 'illustration');
  });

  it('applies bookmark and date filters before deduplication', () => {
    const { database } = createDatabaseMock();
    const planner = new DownloadPlanner(database);
    const items = [
      createIllustration(1, { total_bookmarks: 50 }),
      createIllustration(2, {
        total_bookmarks: 200,
        create_date: '2023-01-01T00:00:00+09:00',
      }),
      createIllustration(3, {
        total_bookmarks: 200,
        create_date: '2024-05-01T00:00:00+09:00',
      }),
    ];

    const target = createTarget({
      minBookmarks: 100,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });

    const plan = planner.planDownloads(items, target, 'illustration');

    expect(plan.queue.map((item) => item.id)).toEqual([3]);
    expect(plan.filteredOut).toBe(2);
    expect(plan.deduplicated).toBe(0);
    expect(plan.availableCount).toBe(1);
    expect(plan.originalCount).toBe(3);
  });

  it('enforces random mode with capped attempts', () => {
    const { database } = createDatabaseMock();
    const planner = new DownloadPlanner(database);
    const items = Array.from({ length: 60 }, (_, index) =>
      createIllustration(index + 1)
    );

    const plan = planner.planDownloads(
      items,
      createTarget({ random: true, limit: 5 }),
      'illustration'
    );

    expect(plan.mode).toBe('random');
    expect(plan.queue.length).toBe(50);
    expect(plan.random?.maxAttempts).toBe(50);
    expect(plan.limit).toBe(5);
    expect(plan.availableCount).toBe(60);
    expect(plan.originalCount).toBe(60);
    expect(new Set(plan.queue.map((item) => item.id)).size).toBe(plan.queue.length);
  });
});


