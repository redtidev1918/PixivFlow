/**
 * Normalized acknowledgement from a downstream delivery provider (TelePost).
 *
 * HTTP status alone is NOT a business result. The provider response is parsed
 * once, at the adapter boundary, into this discriminated union; everything
 * inside Core (outbox worker, delivery ledger, slot FSM) branches on ack.kind
 * instead of status codes or message strings.
 */
export type DeliveryAck =
  | { kind: 'accepted'; remoteId?: string; remoteStatus?: string; raw?: unknown }
  /**
   * The provider recognised OUR idempotency_key and returned the SAME record a
   * previous attempt created (ACK lost to a timeout/crash). This is a success
   * and converges to exactly one remote record.
   */
  | { kind: 'idempotent_replay'; remoteId?: string; remoteStatus?: string; raw?: unknown }
  /**
   * The provider found an OLDER delivery of the same work from a DIFFERENT
   * intent/slot (historical drift). NO new side effect was created. This is not
   * a successful new submission.
   */
  | {
      kind: 'duplicate_existing';
      remoteId?: string;
      remoteStatus?: string;
      matchedKey?: string;
      raw?: unknown;
    }
  /** Transient failure: timeouts, 5xx, 429, connection errors. Retryable. */
  | { kind: 'retryable_failure'; retryAfterMs?: number; error: string }
  /** Deterministic failure: 4xx (except 408/429), validation rejection. */
  | { kind: 'permanent_failure'; error: string };

/** Where the provider put the machine-readable result in its envelope. */
export interface AckEnvelopeHints {
  /** Default config: TelePost returns { ok, data: { ... } }. */
  dataPath?: string;
  /** Field carrying the stable downstream record id (default review_id/message_id). */
  idField?: string;
  /** Field carrying the downstream status string. */
  statusField?: string;
  /** Field that is true when a pre-existing record was reused. */
  reusedField?: string;
  /** Field distinguishing replay-of-our-key vs an older historical record. */
  reasonField?: string;
  keyField?: string;
}

const DEFAULT_HINTS: Required<AckEnvelopeHints> = {
  dataPath: 'data',
  idField: 'review_id',
  statusField: 'status',
  reusedField: 'reused',
  reasonField: 'reuse_reason',
  keyField: 'matched_idempotency_key',
};

function dig(body: unknown, path?: string): unknown {
  if (!path) return body;
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, body);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Parse a provider HTTP response into a DeliveryAck. Pure function of
 * (status, body). Recognises the explicit TelePost envelope and degrades
 * safely for plain 2xx endpoints (treated as 'accepted') so generic adapters
 * keep working.
 */
export function parseDeliveryAck(
  status: number,
  body: unknown,
  hints: AckEnvelopeHints = {}
): DeliveryAck {
  const h = { ...DEFAULT_HINTS, ...hints };

  if (status === 429) {
    return { kind: 'retryable_failure', error: 'HTTP 429 rate limited by delivery endpoint' };
  }
  if (status === 408 || status >= 500) {
    return { kind: 'retryable_failure', error: `delivery endpoint HTTP ${status}` };
  }
  if (status < 200 || status >= 300) {
    const preview = typeof body === 'string' ? body : safeStringify(body);
    return { kind: 'permanent_failure', error: `delivery endpoint HTTP ${status}${preview ? ': ' + preview.slice(0, 200) : ''}` };
  }

  const data = dig(body, h.dataPath);
  // Plain 2xx with no JSON envelope: accepted at-most-once signal.
  if (!data || typeof data !== 'object') {
    return { kind: 'accepted', raw: body };
  }
  const rec = data as Record<string, unknown>;
  const idValue = rec[h.idField] ?? rec.message_id;
  const remoteId =
    typeof idValue === 'number' ? String(idValue) : asString(idValue);
  const remoteStatus = asString(rec[h.statusField]);
  const reused = rec[h.reusedField] === true;
  if (!reused) {
    return { kind: 'accepted', remoteId, remoteStatus, raw: body };
  }

  const reason = asString(rec[h.reasonField]) ?? asString(rec.reuse_kind) ?? '';
  const matchedKey = asString(rec[h.keyField]);
  // Explicit historical-duplicate attestation wins; bare "reused" defaults to
  // replay because the provider only sets reused when it matched a prior key.
  if (reason === 'duplicate_existing' || reason === 'historical' || reason === 'historical_duplicate') {
    return { kind: 'duplicate_existing', remoteId, remoteStatus, matchedKey, raw: body };
  }
  return { kind: 'idempotent_replay', remoteId, remoteStatus, raw: body };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}