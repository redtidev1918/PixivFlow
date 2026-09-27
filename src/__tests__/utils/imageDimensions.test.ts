import { readImageDimensions } from '../../utils/imageDimensions';

/** Minimal JPEG with an APP0 segment followed by the requested frame marker. */
function jpeg(width: number, height: number, frameMarker = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, // APP0 JFIF
    0xff, frameMarker, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // frame header
    0xff, 0xd9, // EOI
  ]);
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    0x80, 0x00, 0x00,
  ]);
}

describe('readImageDimensions', () => {
  it('reads a baseline JPEG frame (SOF0)', () => {
    expect(readImageDimensions(jpeg(640, 900))).toEqual({ width: 640, height: 900 });
  });

  it('reads a progressive JPEG frame (SOF2) and keeps scanning past unknown segments', () => {
    expect(readImageDimensions(jpeg(800, 1200, 0xc2))).toEqual({ width: 800, height: 1200 });
  });

  it('reads a PNG IHDR', () => {
    expect(readImageDimensions(png(240, 480))).toEqual({ width: 240, height: 480 });
  });

  it('honours the byteOffset of a Uint8Array view', () => {
    const padded = new Uint8Array(24 + 7);
    padded.set(png(640, 900), 7);
    expect(readImageDimensions(padded.subarray(7))).toEqual({ width: 640, height: 900 });
  });

  it('reads a GIF header', () => {
    expect(readImageDimensions(gif(64, 64))).toEqual({ width: 64, height: 64 });
  });

  it('reads an ArrayBuffer payload', () => {
    const bytes = jpeg(640, 900);
    expect(readImageDimensions(bytes.buffer as ArrayBuffer)).toEqual({ width: 640, height: 900 });
  });

  it('returns undefined when a JPEG reaches scan data without a frame header', () => {
    const sosOnly = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
    expect(readImageDimensions(sosOnly)).toBeUndefined();
  });

  it('returns undefined for empty, short, garbage and non-image input', () => {
    expect(readImageDimensions(undefined)).toBeUndefined();
    expect(readImageDimensions(null)).toBeUndefined();
    expect(readImageDimensions(new Uint8Array(0))).toBeUndefined();
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8]))).toBeUndefined();
    expect(readImageDimensions(new TextEncoder().encode('not an image at all'))).toBeUndefined();
    expect(readImageDimensions(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBeUndefined();
  });

  it('returns undefined for a zero-sized frame', () => {
    expect(readImageDimensions(jpeg(0, 0))).toBeUndefined();
  });
});
