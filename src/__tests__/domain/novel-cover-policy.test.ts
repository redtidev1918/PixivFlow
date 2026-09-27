import {
  classifyNovelCover,
  coverDeliveryDecision,
  DEFAULT_NOVEL_COVER_POLICY,
  PIXIV_GENERATED_COVER_HEIGHT,
  PIXIV_GENERATED_COVER_WIDTH,
} from '../../domain/media/NovelCoverPolicy';

/** Minimal JPEG header (APP0 + SOF0) carrying the frame dimensions. */
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
}

/** Minimal PNG header carrying the IHDR dimensions. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('NovelCoverPolicy (§media-asset-pipeline)', () => {
  it('classifies the exact Pixiv design canvas as generated', () => {
    expect(classifyNovelCover(jpeg(PIXIV_GENERATED_COVER_WIDTH, PIXIV_GENERATED_COVER_HEIGHT)))
      .toBe('pixiv_generated');
    expect(classifyNovelCover(png(640, 900))).toBe('pixiv_generated');
  });

  it('classifies any other canvas as a custom author cover', () => {
    for (const [w, h] of [[512, 512], [768, 768], [800, 1200], [1024, 1024], [900, 640]] as const) {
      expect(classifyNovelCover(jpeg(w, h))).toBe('custom');
    }
    expect(classifyNovelCover(png(822, 1200))).toBe('custom');
  });

  it('classifies unreadable payloads as unknown instead of guessing', () => {
    expect(classifyNovelCover(undefined)).toBe('unknown');
    expect(classifyNovelCover(null)).toBe('unknown');
    expect(classifyNovelCover(new Uint8Array(0))).toBe('unknown');
    expect(classifyNovelCover(new Uint8Array(4))).toBe('unknown');
    expect(classifyNovelCover(new TextEncoder().encode('not an image at all'))).toBe('unknown');
  });

  it('never delivers a generated design, whatever the unknown policy says', () => {
    expect(coverDeliveryDecision({ unknownCover: 'skip', probeFailed: 'skip' }, 'pixiv_generated')).toBe('skip');
    expect(coverDeliveryDecision({ unknownCover: 'keep', probeFailed: 'keep' }, 'pixiv_generated')).toBe('skip');
  });

  it('delivers custom covers and applies the policy to unknown ones', () => {
    expect(coverDeliveryDecision(DEFAULT_NOVEL_COVER_POLICY, 'custom')).toBe('deliver');
    expect(coverDeliveryDecision(DEFAULT_NOVEL_COVER_POLICY, 'unknown')).toBe('skip');
    expect(coverDeliveryDecision({ unknownCover: 'keep', probeFailed: 'skip' }, 'unknown')).toBe('deliver');
  });

  it('applies the probeFailed policy to a failed probe', () => {
    // The probe never produced bytes, so there is no content type to trust:
    // the production default is to skip, and 'keep' is the availability opt-in.
    expect(coverDeliveryDecision(DEFAULT_NOVEL_COVER_POLICY, 'probe_failed')).toBe('skip');
    expect(coverDeliveryDecision({ unknownCover: 'skip', probeFailed: 'keep' }, 'probe_failed')).toBe('deliver');
    expect(coverDeliveryDecision({ unknownCover: 'keep', probeFailed: 'keep' }, 'probe_failed')).toBe('deliver');
  });

  it('defaults to safe mode: neither an unclassifiable cover nor a failed probe is shipped', () => {
    expect(DEFAULT_NOVEL_COVER_POLICY).toEqual({ unknownCover: 'skip', probeFailed: 'skip' });
  });
});
