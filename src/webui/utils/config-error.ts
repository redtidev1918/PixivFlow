/**
 * Classification for configuration failures surfaced over the WebUI HTTP API.
 *
 * Why this exists: `loadConfig()` throws a `ConfigError` whose cause is a
 * `ConfigValidationError` carrying raw, terminal-oriented lines — and, for the
 * "not logged in yet" case, a `💡 You need to login first. Run one of the
 * following commands: …` block that only makes sense in a shell. Returning that
 * text verbatim to a browser leaves an ordinary user with no idea what to do.
 *
 * The HTTP layer therefore answers with a stable `errorCode` the WebUI
 * localises into human language, plus bounded `details` kept for diagnostics.
 * The CLI guidance block never leaves the terminal.
 */
import { ConfigValidationError } from '../../config/validation';
import { ConfigError } from '../../utils/errors';
import { ErrorCode } from './error-codes';

/** Maximum number of raw validation lines forwarded to a client. */
const MAX_DETAILS = 8;
/** Upper bound for the fallback message forwarded to a client. */
const MAX_MESSAGE_CHARS = 400;
/** Marker that starts the terminal-only "how to log in from a shell" block. */
const CLI_GUIDANCE_MARKER = '💡';

export interface WebuiErrorBody {
  errorCode: ErrorCode;
  message?: string;
  details?: string[];
}

/** Drop the terminal-only "run this command" guidance from a message. */
export function stripCliGuidance(text: string): string {
  const marker = text.indexOf(CLI_GUIDANCE_MARKER);
  const head = marker >= 0 ? text.slice(0, marker) : text;
  return head.replace(/\s+$/, '');
}

/** Map one human-readable validation line onto the shared error vocabulary. */
export function classifyConfigValidationLine(line: string): ErrorCode {
  if (/refreshToken/i.test(line)) return ErrorCode.CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED;
  if (/clientId/i.test(line)) return ErrorCode.CONFIG_VALIDATION_PIXIV_CLIENT_ID_REQUIRED;
  if (/downloadDirectory/i.test(line)) return ErrorCode.CONFIG_VALIDATION_DOWNLOAD_DIRECTORY_REQUIRED;
  if (/cron/i.test(line)) return ErrorCode.CONFIG_VALIDATION_CRON_INVALID;
  if (/targets/i.test(line)) return ErrorCode.CONFIG_VALIDATION_TARGETS_REQUIRED;
  if (/storage/i.test(line)) return ErrorCode.CONFIG_VALIDATION_STORAGE_REQUIRED;
  if (/pixiv/i.test(line)) return ErrorCode.CONFIG_VALIDATION_PIXIV_REQUIRED;
  return ErrorCode.CONFIG_INVALID;
}

/**
 * Raw validation lines when `error` is a configuration failure, else `null`.
 * `validateConfig()` reports root causes first, so line 0 is the most specific.
 */
export function configErrorLines(error: unknown): string[] | null {
  if (error instanceof ConfigError) {
    const cause = error.cause;
    if (cause instanceof ConfigValidationError && cause.errors.length > 0) {
      return cause.errors;
    }
    return [error.message];
  }
  if (error instanceof ConfigValidationError && error.errors.length > 0) {
    return error.errors;
  }
  return null;
}

/**
 * Build the HTTP body for a WebUI handler that could not read the configuration.
 *
 * Any other failure keeps the caller's legacy `{ errorCode }` body, so existing
 * behaviour for genuine runtime failures is unchanged.
 */
export function buildConfigAwareErrorBody(error: unknown, fallbackCode: ErrorCode): WebuiErrorBody {
  const lines = configErrorLines(error);
  if (!lines) {
    return { errorCode: fallbackCode };
  }

  const details: string[] = [];
  for (const line of lines) {
    const text = String(line);
    const hasMarker = text.includes(CLI_GUIDANCE_MARKER);
    const cleaned = stripCliGuidance(text).replace(/\s+/g, ' ').trim();

    if (cleaned.length > 0) {
      details.push(cleaned);
      if (details.length === MAX_DETAILS) {
        break;
      }
    }

    // The terminal-only "how to log in from a shell" block starts at the marker
    // and runs to the end of the message: nothing after it is user-facing.
    if (hasMarker) {
      break;
    }
  }

  if (details.length === 0) {
    return { errorCode: fallbackCode };
  }

  return {
    errorCode: classifyConfigValidationLine(details[0]),
    message: details[0].slice(0, MAX_MESSAGE_CHARS),
    details,
  };
}
