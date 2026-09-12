/**
 * Regression: date-aware pagination must advance the kit's next_url cursor.
 *
 * Root cause of CONTROLLED_V4_E2E_ATTEMPT_2 (2026-09-12):
 * TargetSearchRunner passed the cursor inside the options object, but the kit's
 * `searchPage(options, cursor)` reads it from its SECOND POSITIONAL argument.
 * The cursor therefore stayed `null`, page 1 (the newest works) was re-fetched
 * on every iteration, and a fallback day whose page 1 holds no in-range work
 * never terminated: the tag search never returned, the pipeline never moved on,
 * and the run burned the full 1800s schedule timeout while hammering
 * /v1/search/illust until Pixiv answered 429.
 *
 * The date bounds below are deliberately far apart so the assertions hold in
 * any host timezone.
 */

import type {
  PixivClient as KitPixivClient,
  PixivIllust,
  PixivNovel,
  IllustSearchOptions,
  NovelSearchOptions,
} from '@redtidev/pixiv-client';

import { TargetSearchRunner } from '../../pixiv-client/TargetSearchRunner';
import { PaginationError } from '../../utils/errors';
import type { TargetConfig } from '../../config';

jest.mock('../../logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/** A day that predates the newest page, exactly like a lookback/fallback day. */
const TARGET_DAY = { startDate: '2026-09-01', endDate: '2026-09-11' };
const NEWER_THAN_RANGE = '2026-09-20T12:00:00Z';
const INSIDE_RANGE = '2026-09-10T12:00:00Z';

/** Fail fast when a pager stops advancing instead of looping forever. */
const MAX_PAGE_FETCHES = 4;

function makeTarget(): TargetConfig {
  return {
    tag: 'botehara',
    sort: 'date_desc',
    searchTarget: 'partial_match_for_tags',
    limit: 1,
    ...TARGET_DAY,
  } as unknown as TargetConfig;
}

interface Recorded {
  word: string;
  cursor: string | null;
}

describe('TargetSearchRunner pagination cursor', () => {
  it('walks the kit next_url cursor instead of re-fetching page 1 (fallback-day hang)', async () => {
    const calls: Recorded[] = [];
    const kit = {
      illustrations: {
        searchPage: async (options: IllustSearchOptions, cursor: string | null = null) => {
          calls.push({ word: options.word, cursor });
          if (calls.length > MAX_PAGE_FETCHES) {
            throw new Error(
              `pager never advanced: /v1/search/illust page 1 fetched ${calls.length} times`
            );
          }
          if (cursor === null) {
            // Newest page: every work is newer than the target day -> the date
            // walk can neither include nor stop, so only the cursor can end it.
            return {
              items: [1, 2, 3].map(
                (n) => ({ id: 1000 + n, create_date: NEWER_THAN_RANGE }) as unknown as PixivIllust
              ),
              next: 'PAGE2',
            };
          }
          if (cursor === 'PAGE2') {
            return {
              items: [{ id: 2001, create_date: INSIDE_RANGE } as unknown as PixivIllust],
              next: null,
            };
          }
          throw new Error(`unexpected cursor: ${cursor}`);
        },
      },
    } as unknown as KitPixivClient;

    const result = await new TargetSearchRunner(kit).searchIllustrations(makeTarget(), 0);

    expect(result.map((i) => i.id)).toEqual([2001]);
    expect(calls).toHaveLength(2);
    expect(calls[0].cursor).toBeNull();
    // The regression: the cursor returned by page 1 must be handed back to the kit.
    expect(calls[1].cursor).toBe('PAGE2');
  });

  it('walks the kit next_url cursor for novels too', async () => {
    const calls: Recorded[] = [];
    const kit = {
      novels: {
        searchPage: async (options: NovelSearchOptions, cursor: string | null = null) => {
          calls.push({ word: options.word, cursor });
          if (calls.length > MAX_PAGE_FETCHES) {
            throw new Error(
              `pager never advanced: /v1/search/novel page 1 fetched ${calls.length} times`
            );
          }
          if (cursor === null) {
            return {
              items: [{ id: 3001, create_date: NEWER_THAN_RANGE } as unknown as PixivNovel],
              next: 'NOVEL2',
            };
          }
          if (cursor === 'NOVEL2') {
            return {
              items: [{ id: 3002, create_date: INSIDE_RANGE } as unknown as PixivNovel],
              next: null,
            };
          }
          throw new Error(`unexpected cursor: ${cursor}`);
        },
      },
    } as unknown as KitPixivClient;

    const result = await new TargetSearchRunner(kit).searchNovels(makeTarget(), 0);

    expect(result.map((i) => i.id)).toEqual([3002]);
    expect(calls.map((c) => c.cursor)).toEqual([null, 'NOVEL2']);
  });

  it('fails explicitly when the adapter keeps handing back the same cursor', async () => {
    const calls: Recorded[] = [];
    const kit = {
      illustrations: {
        searchPage: async (options: IllustSearchOptions, cursor: string | null = null) => {
          calls.push({ word: options.word, cursor });
          // Every page advertises the same next cursor. Even with a correct
          // passthrough this would repeat the same page forever, so the pager
          // must refuse rather than keep issuing requests.
          return {
            items: [1, 2, 3].map(
              (n) => ({ id: 1000 + n, create_date: NEWER_THAN_RANGE }) as unknown as PixivIllust
            ),
            next: 'STUCK',
          };
        },
      },
    } as unknown as KitPixivClient;

    await expect(
      new TargetSearchRunner(kit).searchIllustrations(makeTarget(), 0)
    ).rejects.toBeInstanceOf(PaginationError);
    // Bounded: page 1 once, then the repeat is detected on the second request.
    expect(calls).toHaveLength(2);
  });

  it('fails explicitly on a cursor cycle (A -> B -> A)', async () => {
    const calls: Recorded[] = [];
    const cycle: Record<string, string> = { A: 'B', B: 'A' };
    const kit = {
      illustrations: {
        searchPage: async (options: IllustSearchOptions, cursor: string | null = null) => {
          calls.push({ word: options.word, cursor });
          return {
            items: [{ id: 1001, create_date: NEWER_THAN_RANGE } as unknown as PixivIllust],
            next: cursor === null ? 'A' : cycle[cursor],
          };
        },
      },
    } as unknown as KitPixivClient;

    await expect(
      new TargetSearchRunner(kit).searchIllustrations(makeTarget(), 0)
    ).rejects.toBeInstanceOf(PaginationError);
    // null -> A -> B -> (A repeats) => three bounded requests, never an infinite loop.
    expect(calls.map((c) => c.cursor)).toEqual([null, 'A', 'B']);
  });
});
