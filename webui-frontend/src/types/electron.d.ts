/**
 * Electron window API type definitions
 * Used for type-safe access to Electron APIs in the renderer process
 */
export interface ElectronAPI {
  /**
   * Open login window in system browser
   * @returns Promise resolving to login result
   */
  openLoginWindow: () => Promise<{
    success: boolean;
    cancelled?: boolean;
    error?: string;
  }>;

  /**
   * Register listener for login success event
   * @param callback - Callback function to handle login success
   * @returns Cleanup function to remove listener
   */
  onLoginSuccess: (
    callback: (data: ElectronLoginSuccessData) => void | Promise<void>
  ) => () => void;

  /**
   * Register listener for login error event
   * @param callback - Callback function to handle login error
   * @returns Cleanup function to remove listener
   */
  onLoginError: (callback: (error: ElectronLoginError) => void) => () => void;
}

/**
 * Electron login success event data
 */
export interface ElectronLoginSuccessData {
  refreshToken?: string;
  [key: string]: unknown;
}

/**
 * Electron login error event data
 */
export interface ElectronLoginError {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * Extended Window interface with Electron API
 */
declare global {
  interface Window {
    electron?: ElectronAPI;
  }

  interface NodeJS {
    process?: {
      env: Record<string, string | undefined>;
    };
  }
}

export {};

