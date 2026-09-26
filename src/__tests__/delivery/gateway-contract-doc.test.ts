/**
 * The gateway wire example in `docs/GATEWAY.md` is a CONTRACT with external
 * gateway authors: if the JSON in the documentation drifts from the fixture
 * (and thus from what `buildGatewayMessagePayload` produces), integrators will
 * write code against a shape PixivFlow no longer sends.
 *
 * So the example is pinned twice: verbatim against the fixture, and by field
 * against the real builder output.
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
    const matching = fences.filter((body) => {
      try {
        return JSON.parse(body).schemaVersion === 1 && JSON.parse(body).message;
      } catch {
        return false;
      }
    });
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.some((body) => body.trim() === JSON.stringify(EXAMPLE, null, 2).trim())).toBe(true);
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
      },
    } as unknown as DeliveryRequest;

    const payload = await buildGatewayMessagePayload(request, {
      deliveryTarget: 'my-gateway',
      mediaTransport: 'reference',
    });

    expect(payload.schemaVersion).toBe(1);
    expect(payload.idempotencyKey).toBe(EXAMPLE.idempotencyKey);
    expect(payload.deliveryTarget).toBe(EXAMPLE.deliveryTarget);
    expect(payload.work.id).toBe(EXAMPLE.work.id);
    expect(payload.work.type).toBe(EXAMPLE.work.type);
    expect(payload.work.sourceUrl).toBe(EXAMPLE.work.sourceUrl);
    expect(payload.work.spoiler).toBe(EXAMPLE.work.spoiler);
    // Documented as reserved-and-empty: pinning it keeps the doc honest.
    expect(payload.work.tags).toEqual([]);
    expect(EXAMPLE.work.tags).toEqual([]);
    expect(payload.message.text).toBe(EXAMPLE.message.text);
    expect(payload.message.mediaTransport).toBe(EXAMPLE.message.mediaTransport);
    // The generated fixture is written with canonical path/size values, so the
    // structure is compared and the volatile fields are asserted separately.
    expect(payload.message.parts.map((part) => part.kind)).toEqual(
      EXAMPLE.message.parts.map((part: any) => part.kind)
    );
    expect(payload.message.parts.map((part) => part.media?.mime)).toEqual(
      EXAMPLE.message.parts.map((part: any) => part.media?.mime)
    );
    expect(payload.message.media[0]).toMatchObject({
      kind: EXAMPLE.message.media[0].kind,
      mime: EXAMPLE.message.media[0].mime,
    });
    expect(payload.message.media[0].path).toMatch(/\.jpg$/);
    expect(payload.delivery.slotId).toBe(EXAMPLE.delivery.slotId);
    expect(payload.delivery.targetId).toBe(EXAMPLE.delivery.targetId);
    expect(payload.delivery.triggerSource).toBe(EXAMPLE.delivery.triggerSource);
  });
});
