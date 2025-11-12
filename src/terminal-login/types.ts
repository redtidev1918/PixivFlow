/**
 * Terminal login types and interfaces
 */

/**
 * Login credentials interface
 */
export interface LoginCredentials {
  pixiv_id: string;
  password: string;
}

/**
 * Profile image URLs interface
 */
export interface ProfileImageURLs {
  px_16x16: string;
  px_50x50: string;
  px_170x170: string;
}

/**
 * User information interface
 */
export interface UserInfo {
  profile_image_urls: ProfileImageURLs;
  id: string;
  name: string;
  account: string;
  mail_address: string;
  is_premium: boolean;
  x_restrict: number;
  is_mail_authorized: boolean;
  require_policy_agreement: boolean;
}

/**
 * OAuth API response interface
 */
export interface OAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
  user: UserInfo;
}

/**
 * Login information interface
 */
export interface LoginInfo extends OAuthResponse {
  response?: OAuthResponse;
}

/**
 * Custom error for Pixiv login failures
 */
export class PixivLoginFailedError extends Error {
  constructor(message: string = 'Pixiv login failed') {
    super(message);
    this.name = 'PixivLoginFailedError';
  }
}



























