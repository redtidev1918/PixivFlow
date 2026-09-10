import { PixivClient } from '../../client';
import { StaticTokenProvider } from '../../auth/types';
import type { FetchLike } from '../../types';
import { PixivApiError, PixivNotFoundError } from '../../errors/errors';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function jsonClient(handler: (url: URL, call: Call) => unknown | Promise<unknown>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const call: Call = { url, method: (init.method as string) ?? 'GET', headers: init.headers as Record<string, string> };
    calls.push(call);
    const data = await handler(u, call);
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    return {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: { get: () => null },
      json: async () => JSON.parse(body),
      text: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  const client = new PixivClient({
    auth: new StaticTokenProvider('tok'),
    fetchImpl,
    rateLimit: { minIntervalMs: 0, jitterRatio: 0, random: () => 0, initialCooldownMs: 1000 },
  });
  return { client, calls };
}

describe('IllustrationsApi', () => {
  it('detail / get hit v1/illust/detail', async () => {
    const { client, calls } = jsonClient(() => ({ illust: { id: 5 } }));
    const illust = await client.illustrations.get(5);
    expect(illust.id).toBe(5);
    expect(calls[0].url).toContain('/v1/illust/detail?illust_id=5');
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
  });

  it('searchPage maps IllustSearchOptions to Pixiv params (r18 omits filter, dates sent)', async () => {
    const { client, calls } = jsonClient((u) => ({
      illusts: [{ id: 1 }, { id: 2 }],
      next_url: u.searchParams.get('start_date') ? `${u.origin}${u.pathname}?illust_id=next` : null,
    }));
    const page = await client.illustrations.searchPage({
      word: 'cat',
      sort: 'date_asc',
      searchTarget: 'exact_match_for_tags',
      includeR18: true,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
    expect(page.items).toHaveLength(2);
    const u = new URL(calls[0].url);
    expect(u.searchParams.get('word')).toBe('cat');
    expect(u.searchParams.get('sort')).toBe('date_asc');
    expect(u.searchParams.get('search_target')).toBe('exact_match_for_tags');
    expect(u.searchParams.get('filter')).toBeNull();
    expect(u.searchParams.get('start_date')).toBe('2024-01-01');
    expect(u.searchParams.get('end_date')).toBe('2024-01-31');
  });

  it('search walks next_url until limit', async () => {
    const { client, calls } = jsonClient((u) => {
      const page = Number(u.searchParams.get('p') ?? '1');
      return { illusts: [{ id: page * 10 }, { id: page * 10 + 1 }], next_url: `https://x/v1/search/illust?p=${page + 1}` };
    });
    const result = await client.illustrations.search({ word: 'dog', limit: 3 });
    expect(result.items.map((i) => i.id)).toEqual([10, 11, 20]);
    // Page 2 still advertises a cursor; the caller decides whether to walk on.
    expect(result.nextCursor).toContain('p=3');
    expect(calls).toHaveLength(2);
  });

  it('ranking walks next_url and respects limit', async () => {
    const { client, calls } = jsonClient((u) => {
      const page = Number(u.searchParams.get('p') ?? '1');
      return { illusts: [{ id: page }], next_url: page < 3 ? `https://x/v1/illust/ranking?p=${page + 1}` : null };
    });
    const items = await client.illustrations.ranking('week', { date: '2024-01-01', limit: 2 });
    expect(items).toHaveLength(2);
    expect(new URL(calls[0].url).searchParams.get('mode')).toBe('week');
  });

  it('listByUser paginates and slices to limit', async () => {
    const { client } = jsonClient((u) => {
      const page = Number(u.searchParams.get('p') ?? '1');
      return { illusts: [{ id: page }], next_url: page < 3 ? `https://x/v1/user/illusts?p=${page + 1}` : null };
    });
    const items = await client.illustrations.listByUser('99', { limit: 2 });
    expect(items.map((i) => i.id)).toEqual([1, 2]);
  });

  it('ugoiraMetadata unwraps ugoira_metadata', async () => {
    const { client } = jsonClient(() => ({
      ugoira_metadata: { zip_urls: { medium: 'm' }, frames: [{ file: '000.jpg', delay: 60 }] },
    }));
    const meta = await client.illustrations.ugoiraMetadata(42);
    expect(meta.frames[0].delay).toBe(60);
    expect(meta.zip_urls.medium).toBe('m');
  });
});

describe('NovelsApi', () => {
  it('detail hits v2; detailCompatible/detailWithTags fall back to v1 on a missing endpoint', async () => {
    const client1 = jsonClient(() => ({ novel: { id: 1 } })).client;
    expect((await client1.novels.detail(1)).id).toBe(1);

    const client2 = jsonClient((u) => {
      if (u.pathname === '/v2/novel/detail') {
        return Promise.reject(new PixivNotFoundError('Pixiv API error: 404 Not Found', { endpoint: u.href }));
      }
      return { novel: { id: 7, tags: [{ name: 't' }] } };
    }).client;
    expect((await client2.novels.detailCompatible(7)).id).toBe(7);
    const withTags = await client2.novels.detailWithTags(7);
    expect(withTags.tags).toEqual([{ name: 't' }]);
    expect(withTags.novel.id).toBe(7);
  });

  it('text uses the webview marker chain first', async () => {
    // The parser looks for 'novel: ' and slices until the next ',\n'.
    const html = `prefix\nnovel: {"text":"hello"},\nrest`;
    const { client, calls } = jsonClient(() => html);
    const res = await client.novels.text(3);
    expect(res.novel_text).toBe('hello');
    expect(calls[0].url).toContain('/webview/v2/novel');
  });

  it('text falls through webview -> app-api -> www ajax, dropping the App Bearer for ajax', async () => {
    let stage = 0;
    const { client, calls } = jsonClient((u) => {
      stage++;
      if (u.pathname === '/webview/v2/novel') return 'no marker here';
      if (u.pathname === '/v1/novel/text') return { novel_text: '   ' };
      if (u.hostname === 'www.pixiv.net') return { error: false, body: { content: 'ajax-body' } };
      throw new Error('unexpected ' + u.href);
    });
    const res = await client.novels.text(9);
    expect(res.novel_text).toBe('ajax-body');
    const ajaxCall = calls.find((c) => c.url.includes('www.pixiv.net'))!;
    expect(ajaxCall.headers.Authorization).toBeUndefined();
    expect(ajaxCall.headers['App-OS']).toBeUndefined();
    expect(ajaxCall.headers.Referer).toBe('https://www.pixiv.net/');
  });

  it('text throws PixivApiError when every endpoint fails', async () => {
    const client = jsonClient(() => '').client;
    await expect(client.novels.text(11)).rejects.toBeInstanceOf(PixivApiError);
  });

  it('ranking and user novels paginate', async () => {
    const { client } = jsonClient((u) => {
      if (u.pathname === '/v1/novel/ranking') {
        const page = Number(u.searchParams.get('p') ?? '1');
        return { novels: [{ id: page }], next_url: page < 2 ? `https://x/v1/novel/ranking?p=${page + 1}` : null };
      }
      const page = Number(u.searchParams.get('p') ?? '1');
      return { novels: [{ id: 100 + page }], next_url: page < 2 ? `https://x/v1/user/novels?p=${page + 1}` : null };
    });
    expect(await client.novels.ranking('day', { limit: 5 })).toHaveLength(2);
    expect((await client.novels.listByUser('3', { limit: 1 })).map((n) => n.id)).toEqual([101]);
  });

  it('listSeries normalizes the series_content envelope and walks pages', async () => {
    const { client } = jsonClient((u) => {
      const page = Number(u.searchParams.get('p') ?? '1');
      return {
        novel_series_detail: {
          series_content: [{ id: page, title: 't', user: { id: '1', name: 'u' }, create_date: '2024-01-01' }],
        },
        next_url: page < 2 ? `https://x/v1/novel/series?p=${page + 1}` : null,
      };
    });
    const novels = await client.novels.listSeries(55);
    expect(novels).toHaveLength(2);
    expect(novels[0].user.name).toBe('u');
  });
});

describe('TagsApi / UsersApi', () => {
  it('autocomplete returns tag objects', async () => {
    const { client } = jsonClient(() => ({ tags: [{ name: 'a' }, { name: 'b' }] }));
    const tags = await client.tags.autocomplete('a');
    expect(tags.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('users.me unwraps user_profile', async () => {
    const { client } = jsonClient(() => ({ user_profile: { user: { id: '42', name: 'me' } } }));
    expect((await client.users.me()).id).toBe('42');
  });
});
