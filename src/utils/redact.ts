/**
 * Centralized secret redaction for operational logs and audit detail.
 * Conservative on purpose: masks only values adjacent to credential keywords.
 */

/** Hide URL userinfo and query secrets from operational logs. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    const authority = (url.username || url.password ? 'redacted@' : '') + url.host;
    const suffix = url.searchParams.size > 0 ? '?…' : '';
    return `${url.protocol}//${authority}${url.pathname}${suffix}`;
  } catch {
    return value;
  }
}

const SENSITIVE_KEY = /(authorization|proxy-authorization|cookie|token|secret|auth)/i;

/** Mask credential-bearing HTTP header values; pass other headers through. */
export function redactHeaders(headers: Record<string, string> | Headers): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof (headers as Headers)?.forEach === 'function') {
    (headers as Headers).forEach((value, key) => {
      out[key] = SENSITIVE_KEY.test(key) ? '***' : value;
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '***' : value;
  }
  return out;
}

/**
 * Mask secrets in a thrown error's message: Bearer tokens, `token=`/`secret=`/
 * `cookie=` assignments. Stops at quote/space/& delimiters.
 */
export function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message
    .replace(/(bearer\s+)[^\s"'&]+/gi, '$1***')
    .replace(/((?:token|secret|cookie)\s*[=:]\s*)[^\s"'&]+/gi, '$1***');
}
