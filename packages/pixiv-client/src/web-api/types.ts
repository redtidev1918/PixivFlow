import type { Transport } from '../transport/transport';

/**
 * Boundary placeholder for the future Web API backend (www.pixiv.net).
 *
 * The App API and the Web API are deliberately TWO backends, mirroring the
 * upstream protocol split (see PixivKit/pixivpy). The only www.pixiv.net
 * call the host needs today is the novel-text ajax fallback, which is handled
 * inside {@link NovelsApi} as an endpoint-capability fallback.
 *
 * Rules for future expansion:
 * - add concrete web endpoints here only when a second REAL capability gap
 *   appears (YAGNI);
 * - backend fallback is allowed ONLY for missing endpoints/compatibility —
 *   NEVER to alternate between App/Web on 429 to dodge rate limits.
 */
export interface PixivWebApiClient {
  readonly transport: Transport;
}
