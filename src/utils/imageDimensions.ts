/**
 * Intrinsic image dimensions read straight from the container header.
 *
 * PixivFlow ships no image decoder on purpose (§novel-cover): the only question
 * it ever asks about a remote image is "what canvas is this?", and a handful of
 * header bytes answer it for JPEG/PNG/GIF without decoding any pixels. Unknown
 * containers, truncated input and non-image payloads return `undefined` so
 * callers can fail open instead of guessing.
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

/** JPEG frame markers that carry the sample dimensions (SOF0..SOF15 minus DHT/JPG/DAC). */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function toBytes(input: ArrayBuffer | Uint8Array | null | undefined): Uint8Array | undefined {
  if (!input) return undefined;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return undefined;
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  // signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4)
  if (bytes.length < 24) return undefined;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return undefined;
  }
  if (!(bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52)) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readGifDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 10) return undefined;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  if (magic !== 'GIF') return undefined;
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (!width || !height) return undefined;
  return { width, height };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // Fill bytes / standalone markers carry no payload.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda) return undefined; // entropy-coded data: no frame header left
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return undefined;
    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (!width || !height) return undefined;
      return { width, height };
    }
    offset += 2 + length;
  }
  return undefined;
}

/**
 * Reads the intrinsic canvas of a JPEG, PNG or GIF payload.
 * Returns `undefined` when the format is unknown or the header is incomplete.
 */
export function readImageDimensions(
  input: ArrayBuffer | Uint8Array | null | undefined
): ImageDimensions | undefined {
  const bytes = toBytes(input);
  if (!bytes || bytes.length < 10) return undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegDimensions(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return readPngDimensions(bytes);
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return readGifDimensions(bytes);
  return undefined;
}
