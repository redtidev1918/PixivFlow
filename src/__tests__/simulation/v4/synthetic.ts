/**
 * Synthetic fixtures for the V4 simulation.
 *
 * Every value produced here is obviously synthetic: it carries an `v4sim` /
 * `SIMULATED` marker so a stray value can never be mistaken for a real
 * credential, chat id or media file. No production secret is read or defaulted.
 */
import { deflateSync } from 'node:zlib';

export const SIM_MARKER = 'v4sim';

/** Synthetic credentials, all loopback-scoped and self-describing. */
export function syntheticCredentials() {
  return {
    triggerToken: `SIMULATED_TRIGGER_TOKEN_${SIM_MARKER}_0000000000`,
    telepostApiToken: `SIMULATED_TELEPOST_API_TOKEN_${SIM_MARKER}_0000`,
    reviewToken: `SIMULATED_REVIEW_TOKEN_${SIM_MARKER}_00000000`,
    botToken: `1000000001:SIMULATED_BOT_TOKEN_${SIM_MARKER}_NOT_REAL`,
    pixivRefreshToken: `SIMULATED_PIXIV_REFRESH_TOKEN_${SIM_MARKER}_NOT_REAL`,
  };
}

export function syntheticChatIds() {
  return {
    ownerId: 900000001,
    channelId: '@v4sim_channel',
    reviewChatId: '-1009000000001',
  };
}

/** Deterministic synthetic PNG so media is real to every downstream consumer. */
export function syntheticPng(width = 64, height = 64): Buffer {
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const px = rowStart + 1 + x * bytesPerPixel;
      raw[px] = (x * 4) % 256;
      raw[px + 1] = (y * 4) % 256;
      raw[px + 2] = 160;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
  return Buffer.concat([length, typeAndData, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
