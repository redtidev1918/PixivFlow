/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 * 
 * Based on gppt's PKCE implementation:
 * https://github.com/eggplants/get-pixivpy-token
 */

/**
 * Generate code verifier for PKCE
 * Returns a random string of 128 characters
 */
export function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < 128; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate code challenge from verifier using SHA256
 * Returns base64url-encoded SHA256 hash
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  // Use Node.js crypto for SHA256
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(verifier).digest();
  // Base64 URL encoding
  return hash.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}



























