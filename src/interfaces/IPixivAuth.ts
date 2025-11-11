/**
 * Interface for Pixiv authentication
 * Provides abstraction for authentication operations
 */
export interface IPixivAuth {
  /**
   * Get access token (refresh if needed)
   */
  getAccessToken(): Promise<string>;
}

