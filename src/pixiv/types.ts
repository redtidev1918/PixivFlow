/**
 * Pixiv API type definitions
 */

export interface PixivUser {
  id: string;
  name: string;
}

export interface PixivIllust {
  id: number;
  title: string;
  page_count: number;
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
}

export interface PixivNovelTextResponse {
  novel_text: string;
}




























































