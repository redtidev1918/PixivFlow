/**
 * In-process fake for the Pixiv provider boundary.
 *
 * Only `IPixivClient` is faked. Everything above it stays real: candidate
 * selection, history filtering, the Slot state machine, download orchestration,
 * the durable outbox and the multipart delivery all execute production code.
 *
 * The provider returns exactly one valid illustration candidate and real PNG
 * bytes, so downstream consumers (file validation, multipart upload, TelePost
 * staging) all see a genuinely decodable image instead of a stub string.
 */
import { syntheticPng } from './synthetic';

export interface FakePixivProviderOptions {
  /** Single synthetic work id handed out as the only candidate. */
  workId?: number;
  /** Synthetic media dimensions. Kept small: the happy path is not a memory test. */
  width?: number;
  height?: number;
  /** Echoed back as the work title; also used for the synthetic tag label. */
  title?: string;
}

export interface FakePixivCall {
  method: string;
  args: unknown[];
}

/**
 * Shape-compatible with `IPixivClient`; callers cast where the interface is
 * narrower than the fake (extra methods are harmless).
 */
export class FakePixivProvider {
  readonly calls: FakePixivCall[] = [];
  /** Media bytes actually served; lets a test assert the pipeline pulled them. */
  readonly servedMedia: Buffer[] = [];

  private readonly workId: number;
  private readonly width: number;
  private readonly height: number;
  private readonly title: string;

  constructor(options: FakePixivProviderOptions = {}) {
    this.workId = options.workId ?? 71000001;
    this.width = options.width ?? 64;
    this.height = options.height ?? 64;
    this.title = options.title ?? 'v4sim synthetic work';
  }

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  private illust() {
    return {
      id: this.workId,
      title: this.title,
      page_count: 1,
      user: { id: '900000001', name: 'v4sim artist' },
      image_urls: {
        square_medium: `http://127.0.0.1/v4sim/${this.workId}_square.png`,
        medium: `http://127.0.0.1/v4sim/${this.workId}_medium.png`,
        large: `http://127.0.0.1/v4sim/${this.workId}_large.png`,
      },
      create_date: '2026-09-12T00:00:00+00:00',
      total_bookmarks: 100,
      total_view: 1000,
    };
  }

  async searchIllustrations(params: unknown): Promise<unknown[]> {
    this.record('searchIllustrations', params);
    return [this.illust()];
  }

  async searchNovels(params: unknown): Promise<unknown[]> {
    this.record('searchNovels', params);
    return [];
  }

  async getIllustDetail(id: unknown): Promise<unknown> {
    this.record('getIllustDetail', id);
    return this.illust();
  }

  async getIllustDetailWithTags(id: unknown): Promise<unknown> {
    this.record('getIllustDetailWithTags', id);
    return {
      illust: {
        ...this.illust(),
        meta_single_page: {
          original_image_url: `http://127.0.0.1/v4sim/${this.workId}_original.png`,
        },
        meta_pages: [],
      },
      tags: [{ name: 'v4sim_synthetic_tag' }],
    };
  }

  async getNovelText(id: unknown): Promise<string> {
    this.record('getNovelText', id);
    return 'v4sim synthetic novel text';
  }

  async getNovelDetailWithTags(id: unknown): Promise<unknown> {
    this.record('getNovelDetailWithTags', id);
    return { novel: { id: this.workId, title: this.title }, tags: [] };
  }

  async downloadImage(url: unknown): Promise<ArrayBuffer> {
    this.record('downloadImage', url);
    const png = syntheticPng(this.width, this.height);
    this.servedMedia.push(png);
    return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  }

  /** Convenience for assertions: how many media bodies were handed out. */
  downloadedCount(): number {
    return this.servedMedia.length;
  }
}
