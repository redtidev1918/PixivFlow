import { StandaloneConfig, TargetConfig } from '../config';
import { PixivAuth } from './AuthClient';
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
    total_bookmarks?: number;
    total_view?: number;
    bookmark_count?: number;
    view_count?: number;
}
export interface PixivNovelTextResponse {
    novel_text: string;
}
export declare class PixivClient {
    private readonly auth;
    private readonly config;
    private readonly baseUrl;
    private readonly proxyAgent?;
    constructor(auth: PixivAuth, config: StandaloneConfig);
    /**
     * Safely parse date string to timestamp
     * Returns 0 for invalid dates to ensure consistent sorting
     */
    private parseDate;
    /**
     * Get popularity score for sorting
     * Uses bookmarks as primary metric, views as secondary
     * Handles missing or invalid values gracefully
     */
    private getPopularityScore;
    /**
     * Sort items based on sort parameter
     * Uses stable sorting with ID as secondary key to ensure consistent ordering
     */
    private sortItems;
    searchIllustrations(target: TargetConfig): Promise<PixivIllust[]>;
    /**
     * Search illustrations for a single tag (internal method)
     */
    private searchIllustrationsSingleTag;
    searchNovels(target: TargetConfig): Promise<PixivNovel[]>;
    /**
     * Search novels for a single tag (internal method)
     */
    private searchNovelsSingleTag;
    /**
     * Get ranking illustrations
     * @param mode Ranking mode (day, week, month, etc.)
     * @param date Date in YYYY-MM-DD format (optional, defaults to today)
     * @param limit Maximum number of results
     */
    getRankingIllustrations(mode?: string, date?: string, limit?: number): Promise<PixivIllust[]>;
    /**
     * Get ranking novels
     * @param mode Ranking mode (day, week, month, etc.)
     * @param date Date in YYYY-MM-DD format (optional, defaults to today)
     * @param limit Maximum number of results
     */
    getRankingNovels(mode?: string, date?: string, limit?: number): Promise<PixivNovel[]>;
    /**
     * Get illustration detail with tags for filtering
     */
    getIllustDetailWithTags(illustId: number): Promise<{
        illust: PixivIllust;
        tags: Array<{
            name: string;
            translated_name?: string;
        }>;
    }>;
    /**
     * Get novel detail with tags for filtering
     */
    getNovelDetailWithTags(novelId: number): Promise<{
        novel: PixivNovel;
        tags: Array<{
            name: string;
            translated_name?: string;
        }>;
    }>;
    getIllustDetail(illustId: number): Promise<PixivIllust>;
    getNovelDetail(novelId: number): Promise<PixivNovel>;
    getNovelText(novelId: number): Promise<string>;
    /**
     * Get all novels in a series
     */
    getNovelSeries(seriesId: number): Promise<PixivNovel[]>;
    downloadImage(originalUrl: string): Promise<ArrayBuffer>;
    private fetchBinary;
    private createRequestUrl;
    private request;
}
//# sourceMappingURL=PixivClient.d.ts.map