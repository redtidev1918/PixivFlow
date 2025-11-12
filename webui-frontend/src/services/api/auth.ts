import { AxiosResponse } from 'axios';
import { apiClient } from './client';
import { ApiResponse, AuthStatus, AuthLoginResponse } from './types';

/**
 * Authentication API service
 */
export const authApi = {
  /**
   * Get current authentication status
   */
  getAuthStatus: (): Promise<AxiosResponse<ApiResponse<AuthStatus>>> =>
    apiClient.get('/auth/status'),

  /**
   * Login to Pixiv
   * @param username - Pixiv username or email
   * @param password - Pixiv password
   * @param headless - Use headless mode (gppt) or interactive mode (Puppeteer)
   * @param proxy - Optional proxy configuration
   */
  login: (
    username: string,
    password: string,
    headless: boolean = true,
    proxy?: {
      enabled?: boolean;
      host?: string;
      port?: number;
      protocol?: string;
      username?: string;
      password?: string;
    }
  ): Promise<AxiosResponse<ApiResponse<{ refreshToken: string }>>> => {
    // For interactive mode, use a longer timeout (10 minutes) since user needs time to complete login
    const timeout = headless ? 30000 : 600000; // 30s for headless, 10min for interactive
    return apiClient.post('/auth/login', { username, password, headless, proxy }, { timeout });
  },

  /**
   * Login with refresh token directly
   * @param refreshToken - Refresh token to validate and save
   */
  loginWithToken: (
    refreshToken: string
  ): Promise<AxiosResponse<ApiResponse<AuthLoginResponse>>> =>
    apiClient.post('/auth/login-with-token', { refreshToken }),

  /**
   * Refresh authentication token
   * 
   * Refreshes the Pixiv authentication token using the refresh token.
   * If no refresh token is provided, uses the one from the current configuration.
   * 
   * @param refreshToken - Optional refresh token (uses config if not provided)
   * @returns Promise resolving to API response with new refresh token
   * 
   * @example
   * ```typescript
   * // Refresh using token from config
   * const response = await authApi.refreshToken();
   * 
   * // Refresh using specific token
   * const response = await authApi.refreshToken('your-refresh-token');
   * ```
   */
  refreshToken: (refreshToken?: string): Promise<AxiosResponse<ApiResponse<{ refreshToken: string }>>> =>
    apiClient.post('/auth/refresh', { refreshToken }),

  /**
   * Logout and clear authentication
   */
  logout: (): Promise<AxiosResponse<ApiResponse<void>>> =>
    apiClient.post('/auth/logout'),
};

