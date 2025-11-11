import { api } from './api';

/**
 * Authentication Service
 * Encapsulates all authentication-related API calls
 */
export const authService = {
  /**
   * Get current authentication status
   */
  async getAuthStatus() {
    const response = await api.getAuthStatus();
    return response.data.data;
  },

  /**
   * Login to Pixiv
   */
  async login(username: string, password: string, headless = true, proxy?: any) {
    const response = await api.login(username, password, headless, proxy);
    return response.data.data;
  },

  /**
   * Login with refresh token directly
   */
  async loginWithToken(refreshToken: string) {
    const response = await api.loginWithToken(refreshToken);
    return response.data.data;
  },

  /**
   * Refresh authentication token
   */
  async refreshToken(refreshToken?: string) {
    const response = await api.refreshToken(refreshToken);
    return response.data.data;
  },

  /**
   * Logout and clear authentication
   */
  async logout(): Promise<void> {
    await api.logout();
  },
};

