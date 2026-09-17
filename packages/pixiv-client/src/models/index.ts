/**
 * Pixiv domain models as returned by the public App API
 * (https://app-api.pixiv.net). These are wire-shape interfaces (snake_case
 * matches Pixiv), intentionally uncoupled from any host application types.
 */

export interface PixivUser {
  id: string;
  name: string;
  account?: string;
  profile_image_urls?: Record<string, string>;
}

export interface PixivTag {
  name: string;
  translated_name?: string;
  add_by_uploaded_user?: boolean;
}

export interface PixivImageUrls {
  square_medium: string;
  medium: string;
  large: string;
  original?: string;
}

export interface PixivIllustPage {
  image_urls: PixivImageUrls;
  meta_single_page?: { original_image_url?: string };
}

export interface PixivSeries {
  id: number;
  title: string;
}

export interface PixivIllust {
  id: number;
  title: string;
  type?: 'illust' | 'manga' | 'ugoira';
  /** Detail responses use illust_type; search/list responses use type. */
  illust_type?: 'illust' | 'manga' | 'ugoira';
  page_count: number;
  user: PixivUser;
  image_urls: {
    square_medium: string;
    medium: string;
    large: string;
  };
  meta_single_page?: { original_image_url?: string };
  meta_pages?: PixivIllustPage[];
  create_date: string;
  caption?: string;
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
  width?: number;
  height?: number;
  sanity_level?: number;
  x_restrict?: number;
  illust_ai_type?: number;
  series?: PixivSeries | null;
  tags?: PixivTag[];
}

export type PixivIllustPageItem = PixivIllustPage;

export interface PixivNovel {
  id: number;
  title: string;
  user: PixivUser;
  create_date: string;
  caption?: string;
  text_length?: number;
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
  x_restrict?: number;
  series?: PixivSeries | null;
  tags?: PixivTag[];
  image_urls?: Record<string, string>;
}

export interface PixivNovelTextResponse {
  novel_text: string;
  /** Cover thumbnail URL (webview v2 novel: block). */
  coverUrl?: string;
  /** Previous/next series navigation (webview v2 novel: block). */
  seriesNavigation?: { nextNovel?: NovelSeriesNavItem; prevNovel?: NovelSeriesNavItem };
  /** Uploaded inline images, keyed by `[uploadedimage:KEY]` marker id. */
  images?: Record<string, PixivNovelUploadedImage>;
  /** Referenced published illusts, keyed by `[pixivimage:KEY]` marker id; null = deleted/no permission. */
  illusts?: Record<string, PixivNovelIllustRef | null>;
  /** Other endpoint-specific fields (v1/webaudio fallbacks); hosts must not depend on them. */
  [key: string]: unknown;
}

/** Author-uploaded inline image in the webview v2 novel: block. */
export interface PixivNovelUploadedImage {
  novelImageId?: string;
  urls: {
    the128X128?: string;
    the240Mw?: string;
    the480Mw?: string;
    the1200X1200?: string;
    original?: string;
    [k: string]: string | undefined;
  };
}

/** Referenced published illust (webview v2 novel: block). */
export interface PixivNovelIllustRef {
  illust: { images: { small?: string; medium?: string; original?: string } };
}

export interface NovelSeriesNavItem {
  id: number;
  viewable: boolean;
  title?: string;
  coverUrl?: string;
}

export interface UgoiraFrame {
  file: string;
  delay: number;
}

export interface UgoiraMetadata {
  zip_urls: { medium?: string; original?: string };
  frames: UgoiraFrame[];
  silence_before?: number;
  silence_after?: number;
}

/** Common envelope for Pixiv paginated list responses. */
export interface PixivListResponse<T> {
  next_url: string | null;
  [key: string]: unknown;
}

export interface Paginated<T> {
  items: T[];
  /** Opaque next-page token (currently a full Pixiv next_url). */
  nextCursor: string | null;
}
