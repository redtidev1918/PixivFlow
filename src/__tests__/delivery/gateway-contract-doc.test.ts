/**
 * The gateway wire example in `docs/GATEWAY.md` is a CONTRACT with external
 * gateway authors: if the JSON in the documentation drifts from what
 * `buildGatewayMessagePayload` actually produces, integrators will write code
 * against a shape PixivFlow no longer sends.
 *
 * So the example is pinned twice: verbatim against the committed fixture, and
 * field-by-field against a real builder call.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGatewayMessagePayload } from '../../delivery/WebhookDelivery';
import type { DeliveryRequest } from '../../delivery/types';

const ROOT = join(__dirname, '..', '..', '..');
const EXAMPLE = JSON.parse(
  readFileSync(join(ROOT, 'src', '__tests__', 'fixtures', 'gateway-wire-example.json'), 'utf8')
);

describe('gateway wire contract documentation', () => {
  it('documents the request example verbatim', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'GATEWAY.md'), 'utf8');
    const fences = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1]);
    const requestExamples = fences.filter((body) => {
      try {
        const parsed = JSON.parse(body);
        return parsed.schemaVersion === 1 && parsed.message && parsed.delivery;
      } catch {
        return false;
      }
    });
    expect(requestExamples.length).toBeGreaterThan(0);
    expect(requestExamples.some((body) => body.trim() === JSON.stringify(EXAMPLE, null, 2).trim())).toBe(true);
  });

  it('still matches what the builder produces for the documented fields', async () => {
    const request = {
      files: ['/data/artifacts/12345678_p0.jpg'],
      context: {
        title: '作品标题',
        pixivId: '12345678',
        type: 'illustration',
        targetId: 'daily-hot',
        tag: 'daily-hot',
        slotId: 'daily-hot',
        triggerSource: 'schedule',
        idempotencyKey: EXAMPLE.idempotencyKey,
        deliveryTarget: 'my-gateway',
        workTags: ['オリジナル', '風景'],
      },
    } as unknown as DeliveryRequest;

    const payload = await buildGatewayMessagePayload(request, {
      mediaTransport: 'reference',
      deliveryTarget: 'my-gateway',
    });

    expect(payload.schemaVersion).toBe(1);
    expect(payload.idempotencyKey).toBe(EXAMPLE.idempotencyKey);
    expect(payload.deliveryTarget).toBe(EXAMPLE.deliveryTarget);
    expect(payload.work.id).toBe(EXAMPLE.work.id);
    expect(payload.work.type).toBe(EXAMPLE.work.type);
    expect(payload.work.sourceUrl).toBe(EXAMPLE.work.sourceUrl);
    expect(payload.work.spoiler).toBe(EXAMPLE.work.spoiler);
    // Tags are a reserved field today: documenting them as populated would be
    // a lie, so the example says `[]` and this asserts it stays that way.
    expect(payload.work.tags).toEqual(EXAMPLE.work.tags);
    expect(payload.work.tags).toEqual([]);
    expect(payload.message.text).toBe(EXAMPLE.message.text);
    expect(payload.message.mediaTransport).toBe(EXAMPLE.message.mediaTransport);
    expect(payload.message.parts.map((part) => part.kind)).toEqual(
      EXAMPLE.message.parts.map((part: { kind: string }) => part.kind)
    );
    // `size` is only present when an artifact fact carried one, so the example
    // must not claim a value the builder cannot always produce.
    expect(payload.message.media[0]).toMatchObject({
      kind: EXAMPLE.message.media[0].kind,
      mime: EXAMPLE.message.media[0].mime,
      path: expect.stringMatching(/12345678_p0\.jpg$/),
    });
    expect(payload.delivery.slotId).toBe(EXAMPLE.delivery.slotId);
    expect(payload.delivery.targetId).toBe(EXAMPLE.delivery.targetId);
    expect(payload.delivery.triggerSource).toBe(EXAMPLE.delivery.triggerSource);
  });
});
