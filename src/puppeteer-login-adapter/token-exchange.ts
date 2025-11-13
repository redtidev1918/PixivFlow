/**
 * Token exchange utilities
 */

import axios from 'axios';
import { LoginInfo } from '../terminal-login';
import { AUTH_TOKEN_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, USER_AGENT } from './constants';

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<LoginInfo> {
  try {
    const response = await axios.post(
      AUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        include_policy: 'true',
        redirect_uri: REDIRECT_URI,
      }).toString(),
      {
        headers: {
          'user-agent': USER_AGENT,
          'app-os-version': '14.6',
          'app-os': 'ios',
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000,
      }
    );
    
    const data = response.data;
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'bearer',
      scope: data.scope || '',
      refresh_token: data.refresh_token,
      user: data.user,
      response: data,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Failed to exchange code for token: ${error.response.status} ${error.response.statusText}`);
    }
    throw new Error(`Failed to exchange code for token: ${error}`);
  }
}























































