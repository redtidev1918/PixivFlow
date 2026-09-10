/**
 * Telegram review delivery.
 *
 * The behaviour under test is not "does it upload" — it is that a retry can never
 * publish the same media twice, because the media is already sitting in front of a
 * human who will press a button.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { TelegramReviewDelivery } from '../../delivery/TelegramReviewDelivery';
import type { DeliveryRequest } from '../../delivery/types';
import type { TelegramReviewDeliveryConfig } from '../../config';

const CONTROL = 'https://control.example/control';
const REVIEW_CHAT = '-100review';
const CHANNEL = '-100channel';

let dir: string;
let files: string[];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pixivflow-tg-review-'));
  files = [join(dir, 'a.png'), join(dir, 'b.png')];
  for (const file of files) writeFileSync(file, Buffer.from('not-a-real-image'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function config(overrides: Partial<TelegramReviewDeliveryConfig> = {}): TelegramReviewDeliveryConfig {
  return {
    type: 'telegram',
    botId: 'bot1',
    botToken: 'test-bot-token',
    chatId: REVIEW_CHAT,
    publishChatId: CHANNEL,
    controlPlaneUrl: CONTROL,
    controlPlaneToken: 'control-secret',
    caption: '{{title}} · {{pixivId}} · {{topicTag}}',
    ...overrides,
  };
}

function request(overrides: Partial<DeliveryRequest> = {}): DeliveryRequest {
  return {
    files: [files[0]!],
    context: {
      title: 'A work',
      pixivId: '29088506',
      type: 'illustration',
      targetId: 'bot1-illust-botefuku',
      topic: 'ボテ腹',
      slotId: 'bot1-daily@2026-09-11T1800',
      executionId: 'bot1-daily@2026-09-11T1800#1',
    },
    ...overrides,
  } as DeliveryRequest;
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** Scripted fetch: routes by URL shape and records every call. */
function fakeFetch(script: {
  lookup?: () => Response | Error;
  telegram?: (call: Call) => Response | Error;
  report?: (call: Call) => Response | Error;
}): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body;
    calls.push({ url, method, body });

    if (method === 'GET') {
      const result = script.lookup?.() ?? new Response('{"error":"unknown review"}', { status: 404 });
      if (result instanceof Error) throw result;
      return result;
    }
    if (url.includes('api.telegram.org')) {
      const result = script.telegram?.({ url, method, body }) ?? jsonResponse({ ok: true, result: { message_id: 42 } });
      if (result instanceof Error) throw result;
      return result;
    }
    const result = script.report?.({ url, method, body }) ?? jsonResponse({ ok: true, created: true });
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

function telegramCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.url.includes('api.telegram.org'));
}

function reportBodies(calls: Call[]): Array<Record<string, unknown>> {
  return calls
    .filter((call) => call.method === 'POST' && call.url.endsWith('/reviews'))
    .map((call) => JSON.parse(String(call.body)) as Record<string, unknown>);
}

describe('review identity', () => {
  it('is derived from bot+target+work so a retry addresses the same review', () => {
    const delivery = new TelegramReviewDelivery(config(), fakeFetch({}).fetchImpl);
    const first = delivery.reviewId(request());
    const second = delivery.reviewId(request());
    expect(first).toBe(second);
    expect(first).toMatch(/^rv_[0-9a-f]{16}$/);
  });

  it('differs for a different work or target', () => {
    const delivery = new TelegramReviewDelivery(config(), fakeFetch({}).fetchImpl);
    const base = delivery.reviewId(request());
    const otherWork = delivery.reviewId(request({ context: { ...request().context, pixivId: '1' } as never }));
    const otherTarget = delivery.reviewId(request({ context: { ...request().context, targetId: 'other' } as never }));
    expect(otherWork).not.toBe(base);
    expect(otherTarget).not.toBe(base);
  });
});

describe('the pre-flight check is what makes retries safe', () => {
  it('does not post again when the review already exists', async () => {
    const { fetchImpl, calls } = fakeFetch({ lookup: () => jsonResponse({ ok: true, status: 'pending' }) });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());

    expect(result.ack).toMatchObject({ kind: 'idempotent_replay' });
    expect(telegramCalls(calls)).toHaveLength(0);
  });

  it('does not post at all when the control plane cannot be reached', async () => {
    const { fetchImpl, calls } = fakeFetch({ lookup: () => new Error('ENOTFOUND') });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());

    expect(result.ack).toMatchObject({ kind: 'retryable_failure' });
    expect(String((result.ack as { error?: string }).error)).toMatch(/before posting/);
    // Posting without being able to record the review would create media nobody
    // can approve, and a retry would duplicate it.
    expect(telegramCalls(calls)).toHaveLength(0);
  });

  it('treats a 5xx lookup as unknown rather than "missing"', async () => {
    const { fetchImpl, calls } = fakeFetch({ lookup: () => new Response('boom', { status: 500 }) });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());
    expect(result.ack).toMatchObject({ kind: 'retryable_failure' });
    expect(telegramCalls(calls)).toHaveLength(0);
  });
});

describe('a successful delivery posts once and records only ids', () => {
  it('posts the media, the text and the control card, and records all three', async () => {
    const { fetchImpl, calls } = fakeFetch({
      telegram: () => jsonResponse({ ok: true, result: { message_id: 77 } }),
    });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());

    expect(result.ack).toMatchObject({ kind: 'accepted', remoteId: expect.stringMatching(/^rv_/) });

    const telegram = telegramCalls(calls);
    // The file (carrying its caption) and the card. The text is NOT a message.
    expect(telegram.map((call) => call.url.split('/').pop())).toEqual(['sendPhoto', 'sendMessage']);

    const reports = reportBodies(calls);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      bot_id: 'bot1',
      chat_id: REVIEW_CHAT,
      publish_chat_id: CHANNEL,
      status: 'pending',
      // The text is a caption on the media, so there is no caption message to report.
      media_message_ids: [77],
      control_message_id: 77,
      work_id: '29088506',
      target_id: 'bot1-illust-botefuku',
      slot_id: 'bot1-daily@2026-09-11T1800',
      caption: 'A work · 29088506 · ボテ腹',
    });
  });

  it('sends an album as one media group and records every message', async () => {
    const { fetchImpl, calls } = fakeFetch({
      telegram: (call) =>
        call.url.endsWith('/sendMediaGroup')
          ? jsonResponse({
              ok: true,
              result: [
                { message_id: 1, media_group_id: 'mg-9' },
                { message_id: 2, media_group_id: 'mg-9' },
              ],
            })
          : jsonResponse({ ok: true, result: { message_id: 500 } }),
    });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request({ files: [...files] }));

    expect(result.ack).toMatchObject({ kind: 'accepted' });
    expect(telegramCalls(calls)[0]!.url).toContain('/sendMediaGroup');
    expect(reportBodies(calls)[0]).toMatchObject({
      // Media and the control card. The text rides on the media, so it is not reported
      // as a message of its own.
      media_message_ids: [1, 2],
      media_group_id: 'mg-9',
    });
    expect(reportBodies(calls)[0]!.caption_message_id).toBeUndefined();
    expect(typeof reportBodies(calls)[0]!.control_message_id).toBe('number');
  });
});

describe('failures are never turned into duplicates', () => {
  it('records an uncertain review when the Telegram answer is ambiguous', async () => {
    const { fetchImpl, calls } = fakeFetch({ telegram: () => new Error('socket hang up') });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());

    expect(result.ack).toMatchObject({ kind: 'retryable_failure' });
    const statuses = reportBodies(calls).map((body) => body.status);
    // The second report is what stops the retry from posting a copy.
    expect(statuses).toEqual(['uncertain']);
  });

  it('records an uncertain review when the media posted but was not recorded', async () => {
    const { fetchImpl, calls } = fakeFetch({
      telegram: () => jsonResponse({ ok: true, result: { message_id: 5 } }),
      report: () => new Response('nope', { status: 500 }),
    });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());

    expect(result.ack).toMatchObject({ kind: 'retryable_failure' });
    const statuses = reportBodies(calls).map((body) => body.status);
    expect(statuses).toEqual(['pending', 'uncertain']);
  });

  it('treats a definitive Telegram rejection as a visible permanent failure', async () => {
    const { fetchImpl, calls } = fakeFetch({
      telegram: () => jsonResponse({ ok: false, description: 'Bad Request: chat not found' }, 400),
    });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());

    expect(result.ack).toMatchObject({ kind: 'permanent_failure' });
    expect(String((result.ack as { error?: string }).error)).toContain('chat not found');
    // Nothing was posted, so nothing is recorded either.
    expect(reportBodies(calls)).toHaveLength(0);
  });

  it('never leaks the bot token into an error', async () => {
    const { fetchImpl } = fakeFetch({ telegram: () => new Error('connect ECONNREFUSED') });
    const result = await new TelegramReviewDelivery(config(), fetchImpl).deliver(request());
    const error = String((result.ack as { error?: string }).error);
    expect(error).not.toContain('test-bot-token');
    expect(error).not.toContain('control-secret');
  });
});

/**
 * The reviewer must read every file first and the text after it:
 *
 *   [file1 | file2 | file3]   <- media, consecutive, no text inside
 *   正文                       <- one message, after ALL media
 *   审核控制卡                  <- the buttons, last
 *
 * The old shape put the caption on the first album item and the keyboard on the media
 * message, which made the text logically part of one file and left the review with no
 * control card of its own. Telegram's caption rules are what force the split: a
 * caption belongs to a message.
 */
describe('review layout', () => {
  // The media are read from disk before being attached, so the fixtures are real files.
  let layoutDir = '';
  let manyFiles: string[] = [];
  beforeAll(() => {
    layoutDir = mkdtempSync(join(tmpdir(), 'review-layout-'));
    manyFiles = Array.from({ length: 23 }, (_, i) => {
      const file = join(layoutDir, `media-${i}.png`);
      writeFileSync(file, Buffer.from('not-a-real-image'));
      return file;
    });
  });
  afterAll(() => {
    rmSync(layoutDir, { recursive: true, force: true });
  });

  async function run(
    files: string[],
    type = 'illustration'
  ): Promise<Array<{ method: string; form?: FormData; body?: Record<string, unknown> }>> {
    const { fetchImpl, calls } = fakeFetch({
      telegram: (call) => {
        const method = call.url.split('/').pop()!;
        return jsonResponse({ ok: true, result: method === 'sendMediaGroup' ? [{ message_id: 1 }] : { message_id: 2 } });
      },
    });
    const delivery = new TelegramReviewDelivery(config(), fetchImpl);
    await delivery.deliver({ ...request({ context: { ...request().context, type } as never }), files });
    return telegramCalls(calls).map((call) => {
      const method = call.url.split('/').pop()!;
      if (call.body instanceof FormData) return { method, form: call.body };
      return { method, body: JSON.parse(String(call.body)) as Record<string, unknown> };
    });
  }

  it('puts the text on the LAST item of the album, not on a separate message', async () => {
    const calls = await run([files[0]!, files[1]!]);

    // One album, then the control card. No second text bubble.
    expect(calls.map((call) => call.method)).toEqual(['sendMediaGroup', 'sendMessage']);

    const media = JSON.parse(String(calls[0]!.form!.get('media'))) as Array<{ caption?: string }>;
    expect(media).toHaveLength(2);
    // The text belongs to the whole group, so it appears once, on the final item.
    expect(media[0]!.caption).toBeUndefined();
    expect(typeof media[1]!.caption).toBe('string');

    // The album itself carries no group-level reply_markup; only the card has buttons.
    expect(calls[0]!.form!.get('reply_markup')).toBeNull();
    const keyboard = (calls[1]!.body!.reply_markup as { inline_keyboard: unknown[][] }).inline_keyboard;
    expect(keyboard[0]).toHaveLength(2);
  });

  it('keeps the same shape for a single file', async () => {
    const calls = await run([files[0]!]);
    // One document with its caption, then the card. Still no separate text message.
    expect(calls.map((call) => call.method)).toEqual(['sendPhoto', 'sendMessage']);
    expect(calls[0]!.form!.get('caption')).toBeTruthy();
  });

  it('sends documents when the work is a novel, with the caption on the last one', async () => {
    const calls = await run([files[0]!, files[1]!], 'novel');
    const media = JSON.parse(String(calls[0]!.form!.get('media'))) as Array<{ type: string; caption?: string }>;
    expect(media.map((item) => item.type)).toEqual(['document', 'document']);
    expect(media[0]!.caption).toBeUndefined();
    expect(media[1]!.caption).toBeTruthy();
  });

  it('carries the text only in the final group when more than ten files split the album', async () => {
    const calls = await run(manyFiles);

    // 23 files -> 10 + 10 + 3 consecutive groups, then the card.
    expect(calls.map((call) => call.method)).toEqual([
      'sendMediaGroup',
      'sendMediaGroup',
      'sendMediaGroup',
      'sendMessage',
    ]);

    const captions = calls.slice(0, 3).map((call) => {
      const media = JSON.parse(String(call.form!.get('media'))) as Array<{ caption?: string }>;
      return media.filter((item) => typeof item.caption === 'string').length;
    });
    // Exactly one caption in the whole album, in the final group.
    expect(captions).toEqual([0, 0, 1]);
  });
});
