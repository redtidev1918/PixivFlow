import { SystemErrorClassification, SystemErrorType } from './types';

const KNOWN_SUBTYPES: Record<string, SystemErrorType> = {
  pixiv_network_5xx: 'NETWORK_TIMEOUT',
  pixiv_network_4xx: 'NETWORK_TIMEOUT',
};

/**
 * Map an error (message / HTTP status / constructor name) to a stable
 * download/system error class and whether it is safe to retry.
 */
export function classifySystemError(
  error: unknown,
  httpStatus?: number | null,
  stage?: string,
  messageHint?: string
): SystemErrorClassification {
  const message = messageHint ?? (error instanceof Error ? error.message : String(error ?? ''));
  const name = error instanceof Error ? error.constructor.name : typeof error;
  const status = typeof httpStatus === 'number' ? httpStatus : null;

  if (name === 'ConfigError' || /does not configure|unsupported .*target|invalid config/i.test(message)) {
    return { error_type: 'CONFIG_ERROR', retryable: false };
  }

  if (status === 429 || /429|rate.?limit|cooldown/i.test(message)) {
    return { error_type: 'PIXIV_RATE_LIMITED', retryable: true };
  }
  if (status === 401 || status === 403 || /login|auth|token|forbidden|invalid.*refresh|expired.*token/i.test(message)) {
    const cdn = /cdn|i\.pximg|img\.pixiv/i.test(message);
    return cdn
      ? { error_type: 'PIXIV_CDN_FORBIDDEN', retryable: false }
      : { error_type: 'PIXIV_AUTH_FAILED', retryable: status === 401 };
  }
  if (status === 404 || /404|not found|does not exist/i.test(message)) {
    return { error_type: 'PIXIV_NOT_FOUND', retryable: false };
  }
  if (/timeout|timed out|abort|aborted|econn|enotfound|etimedout|network|socket|refused|unavailable|ECONN/i.test(message) || name === 'AbortError') {
    return { error_type: 'NETWORK_TIMEOUT', retryable: true };
  }
  if (/corrupt|invalid image|unexpected eof|truncated/i.test(message)) {
    return { error_type: 'DOWNLOAD_CORRUPTED', retryable: true };
  }
  if (stage === 'image_process' || /convert|processing|\bimage process/i.test(message)) {
    return { error_type: 'IMAGE_PROCESS_FAILED', retryable: stage === 'image_process' };
  }
  if (/telegram|sendMessage|upload/i.test(message)) {
    return { error_type: 'TELEGRAM_UPLOAD_FAILED', retryable: false };
  }
  if (typeof status === 'number' && status >= 500) {
    return { error_type: 'NETWORK_TIMEOUT', retryable: true };
  }
  if (name in KNOWN_SUBTYPES) {
    return { error_type: KNOWN_SUBTYPES[name], retryable: true };
  }
  return { error_type: 'INTERNAL_ERROR', retryable: true };
}
