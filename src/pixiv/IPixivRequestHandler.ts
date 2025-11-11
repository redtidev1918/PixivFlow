/**
 * Interface for handling Pixiv API HTTP requests
 * Used by service classes to access core request functionality
 */
export interface IPixivRequestHandler {
  /**
   * Make an HTTP request to Pixiv API
   */
  request<T>(url: string, init: RequestInit): Promise<T>;
  
  /**
   * Create a request URL with query parameters
   */
  createRequestUrl(path: string, params: Record<string, string>): string;
  
  /**
   * Parse date range from target config
   */
  parseDateRange(target: import('../config').TargetConfig): { startDate: Date | null; endDate: Date | null } | null;
  
  /**
   * Check if item date is within the specified range
   */
  isDateInRange(itemDate: Date | null, startDate: Date | null, endDate: Date | null): boolean;
}
















