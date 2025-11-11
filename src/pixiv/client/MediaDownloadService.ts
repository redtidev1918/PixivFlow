import { PixivApiCore } from './PixivApiCore';
import { NetworkError } from '../../utils/errors';

/**
 * Media download service: provides binary download helpers with sane defaults.
 * Returns raw ArrayBuffer for compatibility with existing callers.
 */
export class MediaDownloadService {
  constructor(private readonly api: PixivApiCore) {}

  async downloadImage(originalUrl: string, userAgent?: string): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {
      Referer: 'https://app-api.pixiv.net/',
      ...(userAgent ? { 'User-Agent': userAgent } : {}),
    };
    return this.api.downloadBinary(originalUrl, { headers, method: 'GET' });
  }
}


