/**
 * Interface for download manager
 * Provides abstraction for download operations
 */
export interface IDownloadManager {
  /**
   * Initialize download manager
   */
  initialise(): Promise<void>;

  /**
   * Run all download targets
   */
  runAllTargets(): Promise<void>;

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (current: number, total: number, message?: string) => void): void;
}























































