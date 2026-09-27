import { isPixivDesignCoverImage, normalizeNovelCoverUrl } from '../../download/novelCover';

/** Minimal JPEG (APP0 + SOF0) carrying only the frame dimensions. */
function jpegWithFrame(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, // APP0 JFIF
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // SOF0
    0xff, 0xd9, // EOI
  ]);
}

/** Minimal PNG with an IHDR chunk of the requested size. */
function pngWithSize(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe('normalizeNovelCoverUrl (§novel-cover)', () => {
  it('keeps a real cover and derives the original-size URL', () => {
    const resized =
      'https://i.pximg.net/c/240x480_70_a2/novel-cover-master/img/2026/01/02/03/04/05/123_abc.jpg';
    expect(normalizeNovelCoverUrl(resized)).toBe(
      'https://i.pximg.net/novel-cover-master/img/2026/01/02/03/04/05/123_abc.jpg'
    );
  });

  it('normalizes the Pixiv default placeholder to null', () => {
    expect(
      normalizeNovelCoverUrl(
        'https://i.pximg.net/c/240x480_70_a2/novel-cover-master-default/img/common/def.png'
      )
    ).toBeNull();
  });

  it('normalizes missing and malformed values to null', () => {
    expect(normalizeNovelCoverUrl(undefined)).toBeNull();
    expect(normalizeNovelCoverUrl(null)).toBeNull();
    expect(normalizeNovelCoverUrl('')).toBeNull();
    expect(normalizeNovelCoverUrl('not-a-url')).toBeNull();
  });

  it('keeps an unresizable real cover untouched', () => {
    const url = 'https://i.pximg.net/novel-cover-master/img/cover.jpg';
    expect(normalizeNovelCoverUrl(url)).toBe(url);
  });
});

describe('isPixivDesignCoverImage (§novel-cover)', () => {
  it('detects the 640x900 canvas Pixiv renders its designs on', () => {
    expect(isPixivDesignCoverImage(jpegWithFrame(640, 900))).toBe(true);
    expect(isPixivDesignCoverImage(pngWithSize(640, 900))).toBe(true);
  });

  it('keeps author covers of any other canvas', () => {
    expect(isPixivDesignCoverImage(jpegWithFrame(800, 1200))).toBe(false);
    expect(isPixivDesignCoverImage(jpegWithFrame(512, 512))).toBe(false);
    expect(isPixivDesignCoverImage(pngWithSize(240, 480))).toBe(false);
    expect(isPixivDesignCoverImage(jpegWithFrame(900, 640))).toBe(false);
  });

  it('fails open on unreadable payloads', () => {
    expect(isPixivDesignCoverImage(undefined)).toBe(false);
    expect(isPixivDesignCoverImage(null)).toBe(false);
    expect(isPixivDesignCoverImage(new Uint8Array(4))).toBe(false);
    expect(isPixivDesignCoverImage(new TextEncoder().encode('not an image at all'))).toBe(false);
  });
});
