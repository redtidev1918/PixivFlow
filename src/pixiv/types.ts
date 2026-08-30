/**
 * Pixiv API type definitions
 */

export interface PixivUser {
  id: string;
  name: string;
}

export interface PixivTag {
  name: string;
  translated_name?: string;
}

export interface PixivIllust {
  id: number;
  title: string;
  page_count: number;
  /** Work type. App API detail uses illust_type; search results use type. */
  illust_type?: 'illust' | 'manga' | 'ugoira';
  type?: 'illust' | 'manga' | 'ugoira';
  user: PixivUser;
  image_urls: {
    square_medium: string;
    medium: string;
    large: string;
  };
  meta_single_page?: {
    original_image_url?: string;
  };
  meta_pages?: Array<{
    image_urls: {
      square_medium: string;
      medium: string;
      large: string;
      original?: string;
    };
    meta_single_page?: {
      original_image_url?: string;
    };
  }>;
  create_date: string;
  // Popularity metrics (may not be present in all API responses)
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
  /** Caption/description (search & detail responses include it). */
  caption?: string;
  x_restrict?: number;
  /** Pixiv AI classification: 2 means AI-generated; 0/1 are not excluded. */
  illust_ai_type?: number;
  /** Search responses usually include enough tag metadata for discovery. */
  tags?: PixivTag[];
}

export type PixivIllustPage = NonNullable<PixivIllust['meta_pages']>[number];

export interface PixivNovel {
  id: number;
  title: string;
  user: PixivUser;
  create_date: string;
  // Popularity metrics (may not be present in all API responses)
  total_bookmarks?: number;
  total_view?: number;
  bookmark_count?: number;
  view_count?: number;
  /** Caption/description (search & detail responses include it). */
  caption?: string;
  text_length?: number;
  x_restrict?: number;
  /** Search responses usually include enough tag metadata for discovery. */
  tags?: PixivTag[];
}

export interface PixivNovelTextResponse {
  novel_text: string;
}





























































