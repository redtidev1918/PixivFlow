import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
  ALL_DELIVERY_CAPABILITIES,
  IDEMPOTENCY_MECHANISMS,
  TRUNCATE_POLICIES,
  UNKNOWN_PLATFORM_CAPABILITIES,
  applyCapabilityOverrides,
  capabilitiesOfDeliveryTarget,
  collectCapabilityOverrideErrors,
  collectCapabilityOverrideWarnings,
  platformCapabilities,
  resolveTargetCapabilities,
  supportsCapability,
} from '../../delivery/capabilities';
import type { DeliveryTargetConfig } from '../../config';
import {
  buildContent,
  buildDeliveryPlan,
  classifyMediaPath,
  contentText,
  defaultContentText,
  mimeTypeForPath,
  pixivSourceUrl,
  planDelivery,
  planMedia,
} from '../../delivery/content';
import type { DeliveryRequest } from '../../delivery/types';

describe('delivery capabilities', () => {
  it('declares a stable capability vocabulary', () => {
    expect(ALL_DELIVERY_CAPABILITIES).toEqual(['text', 'image', 'file', 'album', 'video']);
  });

  it('resolves platform defaults by type', () => {
    const telegram = platformCapabilities('telegram');
    expect(telegram.supported).toEqual(['text', 'image', 'file', 'album', 'video']);
    expect(telegram.maxCaptionLength).toBe(1024);
    expect(telegram.maxUploadBytes).toBe(50 * 1024 * 1024);
    expect(telegram.album).toEqual({ min: 2, max: 10 });

    const http = platformCapabilities('httpMultipart');
    expect(http.supported).toEqual([...ALL_DELIVERY_CAPABILITIES]);
    // Opaque multipart contract: PixivFlow must not invent limits it cannot know.
    expect(http.maxUploadBytes).toBe(0);
    expect(http.album).toBeNull();
  });

  it('falls back to a conservative text-only profile for unknown types', () => {
    const unknown = platformCapabilities('some-future-platform');
    expect(unknown.supported).toEqual(['text']);
    expect(unknown.album).toBeNull();
    expect(unknown.type).toBe('some-future-platform');
    // Unknown is total (never throws) and never shares mutable array identity.
    unknown.supported.push('image');
    expect(UNKNOWN_PLATFORM_CAPABILITIES.supported).toEqual(['text']);
  });

  it('lets overrides add capabilities and tighten limits, never loosen them', () => {
    const base = platformCapabilities('telegram');
    const tightened = applyCapabilityOverrides(base, {
      maxUploadBytes: 5 * 1024 * 1024,
      maxCaptionLength: 200,
    });
    expect(tightened.maxUploadBytes).toBe(5 * 1024 * 1024);
    expect(tightened.maxCaptionLength).toBe(200);

    // An operator cannot raise a platform ceiling by config.
    const raised = applyCapabilityOverrides(base, {
      maxUploadBytes: 999 * 1024 * 1024,
      maxCaptionLength: 99999,
    });
    expect(raised.maxUploadBytes).toBe(base.maxUploadBytes);
    expect(raised.maxCaptionLength).toBe(base.maxCaptionLength);

    const added = applyCapabilityOverrides(platformCapabilities('unknown'), { image: true });
    expect(added.supported).toEqual(['text', 'image']);

    const removed = applyCapabilityOverrides(base, { album: false });
    expect(removed.supported).toEqual(['text', 'image', 'file', 'video']);
    expect(removed.album).toBeNull();

    // The original profile is never mutated in place.
    expect(base.supported).toEqual(['text', 'image', 'file', 'album', 'video']);
    expect(base.album).toEqual({ min: 2, max: 10 });
  });

  it('resolves declared overrides from a target config', () => {
    const target: DeliveryTargetConfig = {
      type: 'httpMultipart',
      url: 'https://example.test/deliver',
      capabilities: { album: false, text: true, maxTextLength: 1000 },
    };
    const resolved = resolveTargetCapabilities(target);
    expect(supportsCapability(resolved, 'album')).toBe(false);
    expect(supportsCapability(resolved, 'text')).toBe(true);
    expect(resolved.maxTextLength).toBe(1000);

    expect(supportsCapability(resolveTargetCapabilities({ type: 'telegram' } as DeliveryTargetConfig), 'album')).toBe(true);
  });

  it('projects the capabilities of a legacy single-route delivery name', () => {
    const registry: Record<string, DeliveryTargetConfig> = {
      'tg-review': { type: 'telegram' } as DeliveryTargetConfig,
    };
    const resolved = capabilitiesOfDeliveryTarget(
      { target: 'tg-review' } as never,
      (name) => registry[name]
    );
    expect(resolved.type).toBe('telegram');

    // Unresolvable name -> conservative profile, never an exception.
    expect(capabilitiesOfDeliveryTarget({ target: 'ghost' } as never, () => undefined)).toBe(
      UNKNOWN_PLATFORM_CAPABILITIES
    );
    expect(capabilitiesOfDeliveryTarget(undefined, () => undefined)).toBe(UNKNOWN_PLATFORM_CAPABILITIES);
  });

  it('validates malformed capability declarations with field-prefixed problems', () => {
    expect(collectCapabilityOverrideErrors(undefined, 'delivery.targets.x')).toEqual([]);
    expect(collectCapabilityOverrideErrors({}, 'delivery.targets.x')).toEqual([]);

    expect(collectCapabilityOverrideErrors([], 'p')).toEqual([
      { field: 'p.capabilities', message: 'Must be an object' },
    ]);
    expect(collectCapabilityOverrideErrors({ image: 'yes' }, 'p')).toEqual([
      { field: 'p.capabilities.image', message: 'Must be a boolean' },
    ]);
    expect(collectCapabilityOverrideErrors({ maxUploadBytes: -1 }, 'p')).toEqual([
      { field: 'p.capabilities.maxUploadBytes', message: 'Must be an integer greater than or equal to 0' },
    ]);
    expect(collectCapabilityOverrideErrors({ albumMin: 9, albumMax: 2 }, 'p')).toEqual([
      { field: 'p.capabilities.albumMin', message: 'Must not be greater than capabilities.albumMax' },
    ]);
    expect(collectCapabilityOverrideErrors({ albumMin: 2, albumMax: 4 }, 'p')).toEqual([]);
  });

  it('reports unknown capability keys instead of silently ignoring them', () => {
    // A correct config never warns: every known key is accepted as-is.
    expect(collectCapabilityOverrideWarnings(undefined, 'p')).toEqual([]);
    expect(collectCapabilityOverrideWarnings(null, 'p')).toEqual([]);
    expect(collectCapabilityOverrideWarnings({}, 'p')).toEqual([]);
    expect(collectCapabilityOverrideWarnings({ album: true, albumMin: 2, albumMax: 9 }, 'p')).toEqual([]);
    expect(
      collectCapabilityOverrideWarnings(
        {
          text: true,
          image: true,
          file: true,
          video: false,
          requiresTwoPhaseUpload: false,
          maxTextLength: 1,
          maxCaptionLength: 1,
          maxUploadBytes: 1,
          maxAttachmentsPerMessage: 1,
          minSendIntervalMs: 1,
          albumMin: 1,
          albumMax: 2,
          truncatePolicy: 'split',
          idempotencyMechanism: 'none',
        },
        'p'
      )
    ).toEqual([]);

    // The real-world misspelling this exists for: `supportsAlbum` vs `album`.
    // It must be named, not just flagged, so the fix is obvious.
    expect(collectCapabilityOverrideWarnings({ supportsAlbum: true }, 'delivery.targets.x')).toEqual([
      {
        field: 'delivery.targets.x.capabilities.supportsAlbum',
        message: 'Unknown capability field (ignored). Did you mean "album"?',
      },
    ]);
    // Case and separators are the same mistake.
    expect(collectCapabilityOverrideWarnings({ 'Supports_Album': true }, 'p')[0].message).toContain(
      'Did you mean "album"?'
    );
    // A key with no resemblance to any capability is listed with the real ones.
    expect(collectCapabilityOverrideWarnings({ maxInlineBytes: 10 }, 'p')).toEqual([
      {
        field: 'p.capabilities.maxInlineBytes',
        message: expect.stringContaining('Unknown capability field (ignored). Known fields:'),
      },
    ]);
    // Note: a near-miss on a KNOWN key is still an error from the error
    // collector, so warnings must not double-report it.
    expect(collectCapabilityOverrideWarnings({ album: 'yes' }, 'p')).toEqual([]);
  });
});

describe('delivery content model', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pixivflow-content-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const file = (name: string, body = 'x'): string => {
    const target = path.join(dir, name);
    writeFileSync(target, body);
    return target;
  };

  const request = (files: string[], overrides: Partial<DeliveryRequest> = {}): DeliveryRequest => ({
    files,
    context: {
      title: '夜の街',
      pixivId: '1234',
      type: 'illustration',
      spoiler: true,
    },
    ...overrides,
  });

  it('classifies media by extension and maps mime types', () => {
    expect(classifyMediaPath('/a/b.JPG')).toBe('image');
    expect(classifyMediaPath('/a/b.webp')).toBe('image');
    expect(classifyMediaPath('/a/b.mp4')).toBe('video');
    expect(classifyMediaPath('/a/b.zip')).toBe('file');
    expect(classifyMediaPath('/a/b.unknownext')).toBe('file');
    expect(mimeTypeForPath('/a/b.PNG')).toBe('image/png');
    expect(mimeTypeForPath('/a/b.weird')).toBe('application/octet-stream');
  });

  it('builds canonical Pixiv links and the default text body', () => {
    expect(pixivSourceUrl('9', 'illustration')).toBe('https://www.pixiv.net/artworks/9');
    expect(pixivSourceUrl('9', 'novel')).toBe('https://www.pixiv.net/novel/show.php?id=9');
    expect(defaultContentText('Title', 'illustration', '9')).toBe(
      'Title\nhttps://www.pixiv.net/artworks/9'
    );
    expect(defaultContentText('  ', 'illustration', '9')).toBe('https://www.pixiv.net/artworks/9');
  });

  it('groups multiple images of one work into a single album part', () => {
    const files = [file('1.png'), file('2.png'), file('3.png')];
    const content = buildContent({ context: request(files).context, files });

    expect(contentText(content)).toContain('夜の街');
    expect(content.workId).toBe('1234');
    expect(content.workType).toBe('illustration');
    expect(content.sourceUrl).toBe('https://www.pixiv.net/artworks/1234');
    expect(content.spoiler).toBe(true);

    const album = content.parts.find((part) => part.kind === 'album');
    expect(album).toBeDefined();
    expect(album && album.kind === 'album' ? album.items.length : 0).toBe(3);
    // No stray per-image parts next to the album.
    expect(content.parts.filter((part) => part.kind === 'image')).toHaveLength(0);
  });

  it('keeps a single image standalone and separates files from the gallery', () => {
    const files = [file('novel.txt'), file('cover.png')];
    const content = buildContent({
      context: { title: 'Novel', pixivId: '5', type: 'novel' },
      files,
    });
    expect(content.parts.map((part) => part.kind)).toEqual(['text', 'file', 'image']);
  });

  it('never mixes videos into an image album', () => {
    const files = [file('1.png'), file('2.png'), file('clip.mp4')];
    const content = buildContent({ context: request(files).context, files });
    const kinds = content.parts.map((part) => part.kind);
    expect(kinds).toEqual(['text', 'album', 'video']);
  });

  it('carries canonical size/mime/asset facts and previews when aligned', () => {
    const original = file('1.jpg', '123456');
    const preview = file('1.preview.jpg', '12');
    const content = buildContent({
      context: request([original]).context,
      files: [original],
      previewFiles: [preview],
      mediaAssets: [
        {
          id: 'asset-1',
          kind: 'image',
          source: 'pixiv',
          sourceUrl: 'https://i.pximg.net/1.jpg',
          artifactId: original,
          mimeType: 'image/jpeg',
        },
      ],
      artifactFacts: [
        { id: 'pixiv:1234:original:0', workId: '1234', variant: 'original', path: original, size: 6 },
      ],
    });
    const image = content.parts.find((part) => part.kind === 'image');
    expect(image && image.kind === 'image' ? image.media : undefined).toEqual({
      path: original,
      mime: 'image/jpeg',
      size: 6,
      previewPath: preview,
      sourceUrl: 'https://i.pximg.net/1.jpg',
      assetId: 'pixiv:1234:original:0',
    });
  });

  it('ignores a misaligned preview list and still reports a local stat size', () => {
    const first = file('1.png', '1234');
    const second = file('2.png', '12');
    const content = buildContent({
      context: request([first, second]).context,
      files: [first, second],
      previewFiles: [path.join(dir, 'only-one-preview.png')],
    });
    const album = content.parts.find((part) => part.kind === 'album');
    const items = album && album.kind === 'album' ? album.items : [];
    expect(items).toHaveLength(2);
    expect(items[0].media.size).toBe(4);
    expect(items[0].media.previewPath).toBeUndefined();
  });

  it('honours an explicit caption over the derived text', () => {
    const files = [file('1.png')];
    const content = buildContent({
      context: request(files).context,
      files,
      caption: '  custom caption  ',
    });
    expect(contentText(content)).toBe('custom caption');
  });

  it('plans against capabilities: albums degrade, unsupported media is reported', () => {
    const files = [file('1.png'), file('2.png'), file('doc.pdf')];
    const content = buildContent({ context: request(files).context, files });

    // A text-only platform (unknown type) cannot carry any media.
    const textOnly = planDelivery(content, { capabilities: platformCapabilities('ghost') });
    expect(textOnly.parts.map((part) => part.kind)).toEqual(['text']);
    // Parts are reported in plan order: the standalone file precedes the album.
    expect(textOnly.unsupported.map((item) => path.basename(item.path))).toEqual([
      'doc.pdf',
      '1.png',
      '2.png',
    ]);
    expect(textOnly.downgrades).toEqual([
      { reason: 'album_not_supported', count: 2 },
      { reason: 'image_not_supported', count: 2 },
      { reason: 'file_not_supported', count: 1 },
    ]);

    // A platform that takes images but not albums gets them one by one.
    const noAlbum = planDelivery(content, {
      capabilities: applyCapabilityOverrides(platformCapabilities('unknown'), {
        image: true,
        file: true,
      }),
    });
    expect(noAlbum.parts.map((part) => part.kind)).toEqual(['text', 'file', 'image', 'image']);
    expect(noAlbum.unsupported).toHaveLength(0);
    expect(noAlbum.downgrades).toEqual([{ reason: 'album_not_supported', count: 2 }]);
  });

  it('keeps an album that fits and flattens it via planMedia', () => {
    const files = [file('1.png'), file('2.png'), file('3.png')];
    const plan = buildDeliveryPlan(request(files), platformCapabilities('telegram'));
    expect(plan.parts.map((part) => part.kind)).toEqual(['text', 'album']);
    expect(plan.unsupported).toHaveLength(0);
    expect(planMedia(plan).map((item) => path.basename(item.path))).toEqual([
      '1.png',
      '2.png',
      '3.png',
    ]);
  });

  it('splits an album that exceeds the platform album maximum without calling it a downgrade', () => {
    const files = Array.from({ length: 12 }, (_, index) => file(`${index}.png`));
    const plan = buildDeliveryPlan(request(files), platformCapabilities('telegram'));
    // 12 images cannot form one 10-item album; capability planning keeps the
    // media and leaves chunking to the adapter, which owns its own batching.
    expect(plan.parts.map((part) => part.kind)).toEqual([
      'text',
      ...Array.from({ length: 12 }, () => 'image'),
    ]);
    expect(plan.unsupported).toHaveLength(0);
    expect(plan.downgrades).toEqual([]);
  });

  it('drops an empty text part and reports no text support', () => {
    const files = [file('1.png')];
    const content = buildContent({ context: request(files).context, files, caption: '   ' });
    // An empty caption falls back to the derived body, not to an empty message.
    expect(contentText(content)).toContain('夜の街');

    const noText = planDelivery(content, {
      capabilities: applyCapabilityOverrides(platformCapabilities('unknown'), { image: true, text: false }),
    });
    expect(noText.parts.map((part) => part.kind)).toEqual(['image']);
  });

  it('carries a frozen content model on the request instead of rebuilding it', () => {
    const files = [file('1.png')];
    const frozen = buildContent({ context: request(files).context, files, caption: 'frozen' });
    const plan = buildDeliveryPlan(
      { files, context: request(files).context, content: frozen },
      platformCapabilities('telegram')
    );
    expect(plan.parts[0]).toEqual({ kind: 'text', text: 'frozen' });
  });

  it('declares pacing, truncation and idempotency as platform data', () => {
    // Every resolved profile must be complete: a delivery decision reads these
    // fields, so a missing one would silently become `undefined` behaviour.
    for (const type of ['httpMultipart', 'telegram', 'unknown', 'future-platform']) {
      const capabilities = platformCapabilities(type);
      expect(TRUNCATE_POLICIES).toContain(capabilities.truncatePolicy);
      expect(IDEMPOTENCY_MECHANISMS).toContain(capabilities.idempotencyMechanism);
      expect(capabilities.minSendIntervalMs).toBeGreaterThanOrEqual(0);
    }
    // An unknown platform refuses to silently clip content it cannot send.
    expect(UNKNOWN_PLATFORM_CAPABILITIES.truncatePolicy).toBe('error');
    expect(UNKNOWN_PLATFORM_CAPABILITIES.idempotencyMechanism).toBe('upstream_ledger');
  });

  it('pacing may only get safer, and truncation policy is replaceable', () => {
    // Declaring pacing ADDS a floor; it can never schedule faster than the
    // platform default.
    expect(
      applyCapabilityOverrides(platformCapabilities('telegram'), { minSendIntervalMs: 5000 })
        .minSendIntervalMs
    ).toBe(5000);
    expect(platformCapabilities('telegram').minSendIntervalMs).toBe(0);
    expect(
      applyCapabilityOverrides(platformCapabilities('httpMultipart'), { minSendIntervalMs: 250 })
        .minSendIntervalMs
    ).toBe(250);
    // A floor already in effect cannot be shortened back down by a later
    // declaration (the slower of the two wins).
    const declared = applyCapabilityOverrides(platformCapabilities('unknown'), { minSendIntervalMs: 1000 });
    expect(applyCapabilityOverrides(declared, { minSendIntervalMs: 100 }).minSendIntervalMs).toBe(1000);

    // Size ceilings keep the opposite (clamping) rule, so the two helpers stay
    // distinguishable.
    expect(applyCapabilityOverrides(platformCapabilities('telegram'), { maxUploadBytes: 5 }).maxUploadBytes).toBe(5);
    expect(
      applyCapabilityOverrides(platformCapabilities('telegram'), { maxUploadBytes: 999_999_999 })
        .maxUploadBytes
    ).toBe(50 * 1024 * 1024);

    const clipped = applyCapabilityOverrides(platformCapabilities('telegram'), {
      truncatePolicy: 'truncate',
    });
    expect(clipped.truncatePolicy).toBe('truncate');
    expect(clipped.idempotencyMechanism).toBe('upstream_ledger');
    expect(
      applyCapabilityOverrides(clipped, { idempotencyMechanism: 'platform_key' })
        .idempotencyMechanism
    ).toBe('platform_key');
  });

  it('rejects malformed lifecycle declarations in both validators', () => {
    expect(
      collectCapabilityOverrideErrors({ truncatePolicy: 'clip' }, 'delivery.targets.tg')
    ).toEqual([
      {
        field: 'delivery.targets.tg.capabilities.truncatePolicy',
        message: 'Must be one of: split, truncate, error',
      },
    ]);
    expect(
      collectCapabilityOverrideErrors({ idempotencyMechanism: 1 }, 'delivery.targets.tg')[0].field
    ).toBe('delivery.targets.tg.capabilities.idempotencyMechanism');
    expect(
      collectCapabilityOverrideErrors({ minSendIntervalMs: -1 }, 'delivery.targets.tg')
    ).toEqual([
      {
        field: 'delivery.targets.tg.capabilities.minSendIntervalMs',
        message: 'Must be an integer greater than or equal to 0',
      },
    ]);
    expect(
      collectCapabilityOverrideErrors(
        { truncatePolicy: 'split', idempotencyMechanism: 'platform_key', minSendIntervalMs: 500 },
        'delivery.targets.tg'
      )
    ).toEqual([]);
  });
});
