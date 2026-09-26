import { Request, Response } from 'express';
import { loadConfig, getConfigPath } from '../../../config';
import {
  configuredGateway,
  pairingAllowsRedirects,
  redactedEndpoint,
} from '../../../delivery/gatewayRoutes';
import { redactError } from '../../../utils/redact';
import { interpolate } from '../../../delivery/WebhookDelivery';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';

const GATEWAY_NAME_SAFE = /^[A-Za-z0-9._-]{1,80}$/;
const PAIRING_TIMEOUT_MS = 10_000;
/** A pairing payload is a QR image or a small JSON blob, never a document. */
const PAIRING_MAX_BYTES = 512 * 1024;
const PAIRING_CACHE_MS = 2_000;

interface CachedPairing {
  at: number;
  status: number;
  payload: unknown;
}

const cache = new Map<string, CachedPairing>();

/**
 * Read-only pairing PASSTHROUGH to the external gateway.
 *
 * The boundary is the point of this endpoint:
 *   - PixivFlow never generates a QR code, never speaks a platform login
 *     protocol, never holds a session and never persists what it reads here.
 *   - the GATEWAY owns pairing; it exposes an HTTP endpoint, PixivFlow GETs it
 *     and renders the answer verbatim. The response schema is the gateway's,
 *     not PixivFlow's — we only wrap it with provenance.
 *
 * Anything that looks like a credential is scrubbed before it leaves the
 * server, and the parsed payload is never written to the database. The tiny
 * in-memory cache exists so a polling panel does not hammer the gateway; it is
 * process-local, unpersisted and expires in seconds.
 */
export async function getPairing(req: Request, res: Response): Promise<void> {
  const name = req.params.name;
  if (typeof name !== 'string' || !GATEWAY_NAME_SAFE.test(name)) {
    res.status(404).json({ errorCode: ErrorCode.GATEWAY_NOT_FOUND });
    return;
  }

  try {
    const config = loadConfig(getConfigPath());
    const route = configuredGateway(config, name);
    if (!route) {
      res.status(404).json({ errorCode: ErrorCode.GATEWAY_NOT_FOUND, message: 'unknown gateway' });
      return;
    }

    const pairingUrl = route.target.type === 'webhook' ? route.target.pairingUrl : undefined;
    if (!pairingUrl) {
      // Not "empty": the route simply does not offer pairing, and the panel must
      // be able to say so instead of showing a broken dialog.
      res.status(404).json({
        errorCode: ErrorCode.GATEWAY_PAIRING_UNSUPPORTED,
        message: 'this gateway does not expose a pairing endpoint',
      });
      return;
    }

    const cached = cache.get(name);
    if (cached && Date.now() - cached.at < PAIRING_CACHE_MS) {
      res.status(cached.status).json(cached.payload);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAIRING_TIMEOUT_MS);
    let status = 200;
    let payload: unknown;
    try {
      // Resolution happens inside the try: an unset `${VAR}` is an operational
      // fact about the gateway route ("cannot read it right now"), reported the
      // same way as a transport failure — never as a PixivFlow crash.
      const url = interpolate(pairingUrl);
      const response = await fetch(url, {
        method: 'GET',
        redirect: pairingAllowsRedirects(route.target) ? 'follow' : 'manual',
        signal: controller.signal,
        headers: { Accept: 'application/json, image/png, image/svg+xml, text/plain' },
      });
      status = response.status;
      const text = (await response.text()).slice(0, PAIRING_MAX_BYTES);
      payload = wrap(route.name, route.type, route.target, response.headers.get('content-type'), text, status);
      if (!response.ok) {
        // The gateway answered, but not with a pairing payload: pass the reason
        // through as an observation, never as a PixivFlow success.
        payload = {
          ...(payload as Record<string, unknown>),
          errorCode: ErrorCode.GATEWAY_PAIRING_UNAVAILABLE,
          note: `gateway answered ${status} for its pairing endpoint`,
        };
      }
    } catch (error) {
      const message = redactError(error);
      logger.warn('Gateway pairing request failed', { gateway: name, error: message });
      status = 502;
      payload = {
        errorCode: ErrorCode.GATEWAY_PAIRING_UNAVAILABLE,
        gateway: name,
        endpoint: redactedEndpoint(route.target),
        message,
      };
    } finally {
      clearTimeout(timer);
    }

    cache.set(name, { at: Date.now(), status, payload });
    res.status(status).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to read gateway pairing state', { gateway: name, error: { message } });
    res.status(500).json({ errorCode: ErrorCode.PAIRING_READ_FAILED });
  }
}

/**
 * Wrap the gateway's own answer in provenance.
 *
 * The gateway's payload is passed through VERBATIM under `payload` (a QR data
 * URL, a login status object, whatever it chose) so PixivFlow never has to
 * interpret or re-model it. `pairable: false` marks the "gateway said no"
 * cases so the panel cannot mistake an error body for a QR code.
 */
function wrap(
  name: string,
  type: string,
  target: unknown,
  contentType: string | null,
  text: string,
  status: number
): Record<string, unknown> {
  const media = contentType?.split(';')[0]?.trim() ?? '';
  let body: unknown = text;
  if (media.includes('json')) {
    try {
      body = JSON.parse(text);
    } catch {
      // A gateway that announces JSON but sends garbage: keep the raw text
      // rather than throwing away the only diagnostic we have.
      body = text;
    }
  }
  return {
    schemaVersion: 1,
    readOnly: true,
    // PixivFlow-stored state is never involved: this is a fresh read, and the
    // panel is told when it happened.
    fetchedAt: new Date().toISOString(),
    gateway: name,
    type,
    endpoint: redactedEndpoint(target as never),
    pairable: status >= 200 && status < 300,
    contentType: media || null,
    truncated: text.length >= PAIRING_MAX_BYTES,
    payload: body,
  };
}

/** Test seam: drop the process-local pairing cache. */
export function clearPairingCache(): void {
  cache.clear();
}
