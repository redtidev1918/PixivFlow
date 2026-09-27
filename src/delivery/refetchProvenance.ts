/**
 * The `refetch_request_id` wire contract.
 *
 * The receiving service (TelePost) validates this field as a *canonical* dashed
 * lowercase UUID — `utils/api_server.py:706-715` answers HTTP 400
 * `invalid_refetch_provenance` ("refetch_request_id 必须是 UUID") for anything
 * else — and it rejects the whole submission, permanently, before any review
 * exists. It is strict on purpose: the stored value must later match the
 * refetch attempt's own `request_id`, which TelePost generates as
 * `str(uuid.uuid4())`.
 *
 * Callers hand us their key in whatever spelling they generated it. Production
 * incident 2026-09-27: a manual refetch arrived at the delivery with the bare
 * 32-hex key `1e22b55cb33e47289f30c62e8ee1e11f` — a v4 UUID whose dashes were
 * stripped — and the run ended in
 * `permanent delivery failure: delivery endpoint HTTP 400:
 *  {"code":"invalid_refetch_provenance","message":"refetch_request_id 必须是 UUID"}`.
 *
 * So the boundary canonicalizes instead of forwarding the raw key:
 *
 *   - a UUID in any spelling we can recognize (dashed, undashed, UPPER, braces,
 *     `urn:uuid:` prefix) becomes the canonical dashed lowercase form, which
 *     keeps the receiving service's identity match intact;
 *   - a value that is not a UUID at all becomes `''` — an unusable provenance
 *     must never fail an otherwise valid delivery, and the empty value is
 *     already the documented shape of a scheduled (non-refetch) delivery.
 *
 * Identity is never touched here: the consumer's own idempotency key keeps its
 * exact spelling as the durable `manual_request_id` (slot identity), and only
 * the payload field that crosses the wire is normalized.
 */

/**
 * Canonical dashed lowercase UUID for `value`, or `''` when `value` is not a
 * UUID. Mirrors Python's `uuid.UUID()` leniency exactly: only hyphens may be
 * removed, and what remains must be 32 hex digits.
 */
export function canonicalRefetchRequestId(value: unknown): string {
  if (typeof value !== 'string') return '';
  let candidate = value.trim().toLowerCase();
  if (!candidate) return '';
  if (candidate.startsWith('urn:uuid:')) candidate = candidate.slice('urn:uuid:'.length);
  if (candidate.startsWith('{') && candidate.endsWith('}')) candidate = candidate.slice(1, -1);
  const hex = candidate.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(hex)) return '';
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
