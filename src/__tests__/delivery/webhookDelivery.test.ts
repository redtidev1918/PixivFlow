import { promises as fs } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WebhookDelivery,
  buildGatewayMessagePayload,
  parseWebhookAck,
  webhookSignature,
} from '../../delivery/WebhookDelivery';
import type { GatewayMessagePayload } from '../../delivery/WebhookDelivery';
import type { DeliveryRequest } from '../../delivery/types';

/**
 * The generic gateway webhook is PixivFlow's "Messaging Gateway client"
 * boundary. These tests pin the two things that must never drift:
 *   1. the unified message document (platform-agnostic, no credentials), and
 *   2. the acknowledgement vocabulary (a 2xx is not a business success).
 */
describe('WebhookDelivery', () => {
  let directory: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'pixivflow-webhook-'));
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await fs.rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function makeFile(name: string, body: string): Promise<string> {
    const filePath = join(directory, name);
    await fs.writeFile(filePath, body);
    return filePath;
  }

  function request(files: string[], overrides: Partial<DeliveryRequest['context']> = {}): DeliveryRequest {
    return {
      files,
      context: {
        title: '夜の海',
        pixivId: '12345',
        type: 'illustration',
        deliveryTarget: 'qq-main',
        slotId: 'slot-1',
        targetId: 'bot1-illust-tag-a',
        executionId: 'exec-9',
        triggerSource: 'schedule',
        idempotencyKey: 'pixivflow:qq-main:illustration:12345:slot-1:bot1-illust-tag-a',
        ...overrides,
      },
    };
  }

  describe('parseWebhookAck', () => {
    it('never reports a business terminal failure as success', () => {
      expect(parseWebhookAck({ status: 200, body: { status: 'failed', reason: 'upload rejected' } })).toEqual({
        kind: 'remote_failed',
        remoteId: undefined,
        remoteStatus: 'failed',
        error: 'upload rejected',
        raw: { status: 'failed', reason: 'upload rejected' },
      });
    });

    it('keeps a pending gateway record retryable instead of guessing', () => {
      for (const status of ['pending', 'queued', 'submitted', 'processing', 'accepted_pending']) {
        const ack = parseWebhookAck({ status: 202, body: { status } });
        expect(ack.kind).toBe('retryable_failure');
      }
    });

    it('maps 409 and duplicate status words to duplicate_existing', () => {
      expect(parseWebhookAck({ status: 409, body: null }).kind).toBe('duplicate_existing');
      expect(parseWebhookAck({ status: 200, body: { status: 'replayed' } }).kind).toBe('duplicate_existing');
    });

    it('classifies transport-level statuses: 429/5xx retryable, other 4xx permanent', () => {
      expect(parseWebhookAck({ status: 429, body: null }).kind).toBe('retryable_failure');
      expect(parseWebhookAck({ status: 503, body: null }).kind).toBe('retryable_failure');
      expect(parseWebhookAck({ status: 400, body: { message: 'bad payload' } })).toEqual({
        kind: 'permanent_failure',
        error: 'bad payload',
      });
      expect(parseWebhookAck({ status: 404, body: null }).kind).toBe('permanent_failure');
    });

    it('accepts a bare 2xx and an explicit accepted word, carrying the remote id', () => {
      expect(parseWebhookAck({ status: 204, body: null })).toEqual({
        kind: 'accepted',
        remoteId: undefined,
        remoteStatus: undefined,
        raw: null,
      });
      expect(parseWebhookAck({ status: 200, body: { status: 'published', message_id: 'm-7' } })).toEqual({
        kind: 'accepted',
        remoteId: 'm-7',
        remoteStatus: 'published',
        raw: { status: 'published', message_id: 'm-7' },
      });
    });

    it('treats an unknown 2xx status word as retryable, not as success', () => {
      const ack = parseWebhookAck({ status: 200, body: { status: 'weird' } });
      expect(ack.kind).toBe('retryable_failure');
      expect(ack).toMatchObject({ error: 'unrecognized gateway status: weird' });
    });
  });

  describe('webhookSignature', () => {
    it('is a reproducible sha256 HMAC over "<timestamp>.<rawBody>"', () => {
      const secret = 'top-secret';
      const timestamp = 1_700_000_000;
      const body = '{"hello":"world"}';
      const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
      expect(webhookSignature(secret, timestamp, body)).toBe(expected);
      // The timestamp is part of the signed material: replaying it is not free.
      expect(webhookSignature(secret, timestamp + 1, body)).not.toBe(expected);
    });
  });

  describe('buildGatewayMessagePayload', () => {
    it('freezes one media item per image and keeps the album flat on the wire', async () => {
      const files = [await makeFile('a.jpg', 'aa'), await makeFile('b.jpg', 'bb')];
      const payload = await buildGatewayMessagePayload(request(files), {
        mediaTransport: 'reference',
        deliveryTarget: 'qq-main',
      });

      expect(payload.schemaVersion).toBe(1);
      expect(payload.deliveryTarget).toBe('qq-main');
      expect(payload.idempotencyKey).toBe('pixivflow:qq-main:illustration:12345:slot-1:bot1-illust-tag-a');
      expect(payload.work).toMatchObject({ id: '12345', type: 'illustration', title: '夜の海' });
      expect(payload.message.parts.map((part) => part.kind)).toEqual(['text', 'album', 'album']);
      expect(payload.message.media).toHaveLength(2);
      // Reference transport carries absolute host paths, never relative ones.
      for (const item of payload.message.media) {
        expect(item.path?.startsWith('/')).toBe(true);
        expect(item.dataBase64).toBeUndefined();
        expect(item.mime).toBe('image/jpeg');
        expect(item.size).toBe(2);
      }
      expect(payload.delivery.slotId).toBe('slot-1');
      expect(payload.delivery.executionId).toBe('exec-9');
    });

    it('inlines base64 bytes for a gateway that is not co-located', async () => {
      const files = [await makeFile('only.png', 'PNGDATA')];
      const payload = await buildGatewayMessagePayload(request(files), {
        mediaTransport: 'base64',
        deliveryTarget: 'feishu-main',
      });
      // A single image stays its own part, never a one-item album.
      expect(payload.message.parts.map((part) => part.kind)).toEqual(['text', 'image']);
      expect(payload.message.media[0]).toMatchObject({
        kind: 'image',
        mime: 'image/png',
        dataBase64: Buffer.from('PNGDATA').toString('base64'),
        size: 7,
      });
      expect(payload.message.media[0].path).toBeUndefined();
    });

    it('carries the frozen Content model when the request already has one', async () => {
      const files = [await makeFile('c.jpg', 'cc')];
      const withContent: DeliveryRequest = {
        ...request(files),
        content: {
          text: 'frozen text',
          parts: [{ kind: 'text', text: 'frozen text' }],
          workId: '999',
          workType: 'novel',
          sourceUrl: 'https://www.pixiv.net/novel/show.php?id=999',
          title: 'Frozen',
        },
      };
      const payload = await buildGatewayMessagePayload(withContent, {
        mediaTransport: 'reference',
        deliveryTarget: 'gateway-a',
      });
      expect(payload.message.text).toBe('frozen text');
      expect(payload.work).toMatchObject({ id: '999', type: 'novel' });
      // No media parts: the frozen content is text-only, and files are not re-derived.
      expect(payload.message.media).toHaveLength(0);
    });
  });

  describe('deliver', () => {
    it('POSTs the unified document with idempotency and delivery headers', async () => {
      const filePath = await makeFile('cover.jpg', 'image');
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'accepted', id: 'gw-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      global.fetch = fetchMock as typeof fetch;

      const provider = new WebhookDelivery({
        type: 'webhook',
        url: 'https://gateway.test/hook',
        headers: { 'X-Custom': 'yes' },
      });
      const result = await provider.deliver(request([filePath]));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
      expect(url).toBe('https://gateway.test/hook');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers['X-PixivFlow-Delivery']).toBe('qq-main');
      expect(init.headers['X-Idempotency-Key']).toBe(
        'pixivflow:qq-main:illustration:12345:slot-1:bot1-illust-tag-a'
      );
      expect(init.headers['X-Custom']).toBe('yes');
      expect(init.headers.Authorization).toBeUndefined();
      expect(init.headers['X-Webhook-Signature']).toBeUndefined();
      const sent = JSON.parse(init.body) as GatewayMessagePayload;
      expect(sent.message.parts.map((part) => part.kind)).toEqual(['text', 'image']);
      expect(result).toMatchObject({ status: 200, ack: { kind: 'accepted', remoteId: 'gw-1' } });
    });

    it('signs and authenticates when a secret and token are declared', async () => {
      const filePath = await makeFile('cover.jpg', 'image');
      const fetchMock = jest.fn().mockResolvedValue(new Response('', { status: 202 }));
      global.fetch = fetchMock as typeof fetch;
      process.env.WEBHOOK_TEST_TOKEN = 'bearer-value';
      process.env.WEBHOOK_TEST_SECRET = 'signing-value';
      try {
        const provider = new WebhookDelivery({
          type: 'webhook',
          url: 'https://gateway.test/hook',
          token: '${WEBHOOK_TEST_TOKEN}',
          signingSecret: '${WEBHOOK_TEST_SECRET}',
        });
        await provider.deliver(request([filePath]));

        const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
        expect(init.headers.Authorization).toBe('Bearer bearer-value');
        const timestamp = Number(init.headers['X-Webhook-Timestamp']);
        expect(Number.isInteger(timestamp)).toBe(true);
        expect(init.headers['X-Webhook-Signature']).toBe(webhookSignature('signing-value', timestamp, init.body));
      } finally {
        delete process.env.WEBHOOK_TEST_TOKEN;
        delete process.env.WEBHOOK_TEST_SECRET;
      }
    });

    it('refuses to inline more bytes than the declared limit', async () => {
      const filePath = await makeFile('big.jpg', 'x'.repeat(64));
      const fetchMock = jest.fn();
      global.fetch = fetchMock as typeof fetch;
      const provider = new WebhookDelivery({
        type: 'webhook',
        url: 'https://gateway.test/hook',
        mediaTransport: 'base64',
        maxInlineBytes: 10,
      });

      await expect(provider.deliver(request([filePath]))).rejects.toThrow(/above maxInlineBytes=10/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propagates a transport failure so the durable outbox can retry it', async () => {
      const filePath = await makeFile('cover.jpg', 'image');
      const failure = new Error('socket hang up');
      global.fetch = jest.fn().mockRejectedValue(failure) as typeof fetch;
      const provider = new WebhookDelivery({ type: 'webhook', url: 'https://gateway.test/hook' });

      await expect(provider.deliver(request([filePath]))).rejects.toThrow('socket hang up');
    });

    it('fails loudly when a declared environment variable is missing', async () => {
      const filePath = await makeFile('cover.jpg', 'image');
      const fetchMock = jest.fn();
      global.fetch = fetchMock as typeof fetch;
      const provider = new WebhookDelivery({
        type: 'webhook',
        url: '${WEBHOOK_MISSING_URL}',
      });

      await expect(provider.deliver(request([filePath]))).rejects.toThrow(
        'Required delivery environment variable is not set: WEBHOOK_MISSING_URL'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('declares no preflight contract, so it is always ready', async () => {
      const provider = new WebhookDelivery({ type: 'webhook', url: 'https://gateway.test/hook' });
      await expect(provider.readinessProbe()).resolves.toEqual({ ready: true });
      await expect(provider.isReady()).resolves.toBe(true);
    });

    it('requires at least one resolved file', async () => {
      const provider = new WebhookDelivery({ type: 'webhook', url: 'https://gateway.test/hook' });
      await expect(provider.deliver(request([]))).rejects.toThrow('Webhook delivery requires at least one file');
    });
  });
});
