/**
 * Host-driven interactive login — session state
 *
 * The interactive login has always needed a real browser window: Puppeteer
 * launches a system Chrome and watches its URL for the OAuth redirect. A host
 * that is itself a webview (the PixivFlow Desktop Tauri app, whose macOS
 * webview is WKWebView) cannot be driven that way, so the host opens the Pixiv
 * authorize page in an app window of its own and hands the authorization code
 * back to the WebUI, which completes the login here.
 *
 * PKCE parameters are owned by this side, never by the UI or the host:
 * `start` mints a short-lived session holding the code verifier, `complete`
 * consumes it exactly once. The verifier therefore never leaves the backend.
 */

import { randomUUID } from 'crypto';
import { CLIENT_ID, LOGIN_URL, REDIRECT_URI } from '../../../../puppeteer-login-adapter/constants';
import {
  generateCodeChallenge,
  generateCodeVerifier,
} from '../../../../puppeteer-login-adapter/pkce';

/** A host login window stays usable for this long before it is discarded. */
export const HOST_LOGIN_SESSION_TTL_MS = 10 * 60 * 1000;

/** Defensive upper bound: abandoned sessions must not accumulate forever. */
const MAX_HOST_LOGIN_SESSIONS = 32;

interface HostLoginSession {
  codeVerifier: string;
  createdAt: number;
}

const sessions = new Map<string, HostLoginSession>();

/** Drop sessions past their TTL. */
function sweepExpired(now: number): void {
  for (const [id, session] of sessions) {
    if (now - session.createdAt > HOST_LOGIN_SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export interface HostLoginStart {
  /** Opaque id the caller hands back to `complete`. */
  loginId: string;
  /** Pixiv authorize URL carrying the PKCE challenge. */
  authUrl: string;
  /** URL the authorize page redirects to once the user is authenticated. */
  redirectUri: string;
}

/**
 * Create a host login session and the authorize URL the host should open.
 */
export async function createHostLoginSession(now: number = Date.now()): Promise<HostLoginStart> {
  sweepExpired(now);

  // Evict oldest first if a client keeps starting sessions without finishing.
  while (sessions.size >= MAX_HOST_LOGIN_SESSIONS) {
    const oldest = sessions.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const loginId = randomUUID();
  sessions.set(loginId, { codeVerifier, createdAt: now });

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    client: 'pixiv-android',
  });

  return {
    loginId,
    authUrl: `${LOGIN_URL}?${params.toString()}`,
    redirectUri: REDIRECT_URI,
  };
}

/**
 * Consume a session's code verifier. Single use: the session is deleted whether
 * or not it is still within its TTL, so a replayed `complete` cannot succeed.
 */
export function consumeHostLoginSession(
  loginId: unknown,
  now: number = Date.now()
): string | null {
  if (typeof loginId !== 'string' || loginId.trim() === '') return null;

  const session = sessions.get(loginId);
  if (!session) return null;

  sessions.delete(loginId);
  if (now - session.createdAt > HOST_LOGIN_SESSION_TTL_MS) return null;

  return session.codeVerifier;
}

/**
 * Read the authorization code out of whatever the caller could capture: a bare
 * code, or the full callback URL the login window landed on (which is what a
 * human copies out of a browser address bar).
 */
export function extractAuthCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const value = input.trim();
  if (!value) return null;

  try {
    const code = new URL(value).searchParams.get('code');
    if (code) return code;
  } catch {
    // Not a URL — fall through and treat it as a bare authorization code.
  }

  // Authorization codes are URL-safe base64-ish tokens; anything else is a paste
  // mistake (an unrelated URL, a whole HTML page, …) and must not be forwarded.
  if (/^[A-Za-z0-9._~-]+$/.test(value)) return value;

  return null;
}

/** Test helper: forget every pending session. */
export function resetHostLoginSessions(): void {
  sessions.clear();
}

/** Test helper: number of pending sessions. */
export function hostLoginSessionCount(): number {
  return sessions.size;
}
