import type { Transport } from '../transport/transport';

/**
 * Media (binary) fetch. The kit returns BYTES only; where to save, naming,
 * unzip/ugoira→GIF conversion and download history are host concerns.
 */
export class MediaApi {
  constructor(private readonly transport: Transport) {}

  /** Download a media URL (images, ugoira zips) as ArrayBuffer. */
  fetch(url: string, options?: { referer?: string; timeoutMs?: number; signal?: AbortSignal }): Promise<ArrayBuffer> {
    return this.transport.fetchBinary(url, {
      method: 'GET',
      headers: { Referer: options?.referer ?? 'https://app-api.pixiv.net/' },
      skipAuth: true,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }
}
