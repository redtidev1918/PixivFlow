/**
 * The Workflow Protocol v1 error vocabulary, producer side (§5 / §5.1).
 *
 * The protocol's error enum is CLOSED. PixivFlow keeps its own, richer internal
 * `TerminalReasonCode` vocabulary for diagnosis, and translates it exactly once,
 * at the job facade — a consumer never sees an internal code, and this service
 * never invents a protocol code. `protocol/v1/error-mapping.json` (vendored from
 * the deploy repo's SSOT) is the machine-checkable half of that contract; the
 * `retryable` defaults below mirror its `protocol_codes` table, and
 * `src/__tests__/protocol/contract.test.ts` keeps the two in step.
 *
 * Leaf module on purpose: no imports beyond types, so both the scheduler core
 * and the HTTP facade can use it without a cycle.
 */

/** The protocol's closed error enum, verbatim from `$defs/Error` / `protocol_codes`. */
export type ProtocolErrorCode =  | 'no_candidate'
  | 'source_error'
  | 'auth_error'
  | 'quota_exceeded'
  | 'resource_busy'
  | 'queued_too_long'
  | 'stalled_no_progress'
  | 'deadline_exceeded'
  | 'cancelled_by_consumer'
  | 'idempotency_conflict'
  | 'unsupported_protocol_version'
  | 'invalid_params'
  | 'delivery_failed'
  | 'delivery_rejected'
  | 'delivery_abandoned'
  | 'internal_error';

/**
 * A consumer/operator stop. Internal (`TerminalReasonCode`) and protocol
 * (`ProtocolErrorCode`) name the same event with the same word, so it is
 * defined once here — the delivery layer must recognise it without importing
 * the scheduler.
 */
export const CANCELLED_BY_CONSUMER = 'cancelled_by_consumer';

/**
 * `retryable` defaults, copied from `protocol/v1/error-mapping.json`
 * (`protocol_codes[*].retryable`). A payload may override the flag; it may not
 * omit it, so a consumer can always branch on it without guessing.
 */
export const PROTOCOL_ERROR_RETRYABLE: Record<ProtocolErrorCode, boolean> = {
  no_candidate: true,
  source_error: true,
  auth_error: false,
  quota_exceeded: true,
  resource_busy: true,
  queued_too_long: true,
  stalled_no_progress: true,
  deadline_exceeded: true,
  cancelled_by_consumer: false,
  idempotency_conflict: false,
  unsupported_protocol_version: false,
  invalid_params: false,
  delivery_failed: true,
  delivery_rejected: false,
  delivery_abandoned: true,
  internal_error: false,
};

/** `$defs/Error`: `code` is required; everything else is optional. */
export interface ProtocolErrorBody {
  code: ProtocolErrorCode;
  message?: string;
  retryable?: boolean;
  detail?: Record<string, unknown>;
}

export interface ProtocolErrorOptions {
  message?: string;
  detail?: Record<string, unknown>;
  /** Override the table default (never omit the field: `retryable` is always sent). */
  retryable?: boolean;
}

/** Build a `$defs/Error` body with the protocol's `retryable` default applied. */
export function protocolErrorBody(
  code: ProtocolErrorCode,
  options: ProtocolErrorOptions = {}
): ProtocolErrorBody {
  return {
    code,
    ...(options.message !== undefined ? { message: options.message } : {}),
    retryable: options.retryable ?? PROTOCOL_ERROR_RETRYABLE[code],
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
  };
}

/**
 * A request that must be answered with a protocol `Error` body.
 *
 * `message` is the protocol-visible message (`$defs/Error.message`), NOT an
 * internal detail: the legacy manual-work endpoints keep matching on a few
 * stable message strings, so those strings are passed through verbatim here and
 * the protocol body carries the same text. Nothing may branch on message text
 * going forward (§5) — the `code` is the contract.
 */
export class ProtocolRequestError extends Error {
  readonly status: number;
  readonly body: ProtocolErrorBody;

  constructor(code: ProtocolErrorCode, status: number, options: ProtocolErrorOptions = {}) {
    const body = protocolErrorBody(code, options);
    super(body.message ?? code);
    this.name = 'ProtocolRequestError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Coerce anything thrown by a handler into an HTTP status + protocol Error body.
 * Unknown failures become `internal_error` (retryable: false) and never leak the
 * internal message to the consumer.
 */
export function protocolErrorResponse(
  error: unknown
): { status: number; body: ProtocolErrorBody } {
  if (error instanceof ProtocolRequestError) {
    return { status: error.status, body: error.body };
  }
  return {
    status: 500,
    body: protocolErrorBody('internal_error', { message: 'internal error' }),
  };
}
