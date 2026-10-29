/**
 * Output formatting
 * Handles formatting and printing login results
 */

import { LoginInfo } from './types';

/** Authentication failures may contain request bodies, cookies or raw provider responses.
 * Keep only a bounded status/transport classification, never the original error or cause. */
export function safeAuthError(error: unknown): Error {
  const value = error as { response?: { status?: unknown }; status?: unknown; code?: unknown } | null;
  const status = value?.response?.status ?? value?.status;
  const code = typeof value?.code === 'string' &&
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_NETWORK'].includes(value.code)
    ? value.code : undefined;
  const detail = typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
    ? ` (HTTP ${status})` : code ? ` (${code})` : '';
  return Object.assign(new Error(`Authentication failed${detail}. Check credentials and network settings, then retry login.`),
    detail.startsWith(' (HTTP') ? { status } : code ? { code } : {});
}

/** Allowlisted public result: never expose the raw OAuth response or credentials. */
export function publicLoginResult(loginInfo: LoginInfo) {
  return {
    expires_in: loginInfo.expires_in,
    ...(loginInfo.user ? { user: {
      id: loginInfo.user.id,
      name: loginInfo.user.name,
      account: loginInfo.user.account,
    } } : {}),
  };
}

/**
 * Print authentication token response
 * Based on __print_auth_token_response() function in gppt/main.py
 */
export function printAuthTokenResponse(
  loginInfo: LoginInfo,
  outputJson: boolean = false
): void {
  const result = publicLoginResult(loginInfo);
  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('[+]: Success! Credentials are hidden.');
    console.log(`expires_in: ${result.expires_in}`);
    if (result.user) console.log(`user: ${result.user.name} (${result.user.account})`);
  }
}































































