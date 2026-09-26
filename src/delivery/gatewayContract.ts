/**
 * The Gateway Contract, as data.
 *
 * PixivFlow does not speak QQ, WeChat, OneBot, NapCat, Telegram or Discord. It
 * speaks ONE contract to an external gateway, and the gateway translates that
 * contract into whatever the platform needs:
 *
 *     PixivFlow ──deliver/pairing/health──▶ external gateway ──▶ platform
 *
 * `docs/GATEWAY_CONTRACT.md` is the normative prose; this module is the same
 * contract as values. Vocabulary that exists in BOTH places lives here rather
 * than in the document, so the document cannot quietly disagree with the code:
 * every list below is asserted against a `docs/GATEWAY_CONTRACT.md` table by
 * `src/__tests__/delivery/gateway-contract.test.ts`.
 *
 * Nothing here is new behaviour. `WebhookDelivery` already implements the
 * deliver half; the pairing half is the pass-through in
 * `src/webui/routes/handlers/pairing-handler.ts`. This module names what was
 * implicit, so gateway authors have a contract to code against instead of a
 * blog post to reverse-engineer.
 */

/**
 * Version of the wire contract. It is sent in every request payload as
 * `schemaVersion`, and a gateway must reject a version it was not written for
 * rather than guess at a newer shape.
 */
export const GATEWAY_CONTRACT_VERSION = 1 as const;

/**
 * The three endpoints a gateway implements.
 *
 * `deliver` is REQUIRED: without it nothing is ever delivered. `pairing` is
 * REQUIRED only for a gateway with something to pair (QQ/WeChat); a gateway
 * with nothing to pair omits it and the WebUI shows no pair button. `health` is
 * OPTIONAL and PixivFlow never calls it as a precondition — a delivery is never
 * gated on a health probe, because a probe that can block delivery turns one
 * failure into two.
 */
export interface GatewayEndpointSpec {
  /** Path a gateway should serve, relative to the configured base URL. */
  path: string;
  method: 'GET' | 'POST';
  required: boolean;
  /** Which PixivFlow config field points at it. */
  configField: string;
}

export const GATEWAY_ENDPOINTS: Readonly<Record<'deliver' | 'pairing' | 'health', GatewayEndpointSpec>> =
  Object.freeze({
    deliver: {
      path: '/deliver',
      method: 'POST',
      required: true,
      configField: 'delivery.targets.<name>.url',
    },
    pairing: {
      path: '/pairing',
      method: 'GET',
      required: false,
      configField: 'delivery.targets.<name>.pairingUrl',
    },
    health: {
      path: '/health',
      method: 'GET',
      required: false,
      configField: 'pixivflow gateway status',
    },
  });

/**
 * The endpoint a gateway is asked for when it does not declare one.
 *
 * Both fields are raw URL templates, so `${ENV_VAR}` references are expanded
 * here with the same rules as any other config string. A trailing slash is
 * irrelevant; anything else in the path is preserved.
 */
export function resolveGatewayEndpoints(
  target: { url?: unknown; pairingUrl?: unknown },
  interpolate: (value: string) => string
): { deliveryUrl: string | null; pairingUrl: string | null } {
  const read = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    // An unset template means the operator left it as a placeholder: treating
    // it as an endpoint would send a request to the literal string `${...}`.
    if (!trimmed || /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(trimmed)) return null;
    try {
      return interpolate(trimmed);
    } catch {
      return null;
    }
  };
  return { deliveryUrl: read(target.url), pairingUrl: read(target.pairingUrl) };
}

/**
 * How one delivery attempt is classified.
 *
 * These names are the CONTRACT's words for the outcome; `DeliveryAck['kind']`
 * in `src/delivery/types.ts` is the ledger's words for the same outcome. They
 * differ in exactly one place — `duplicate` here is `duplicate_existing` there,
 * because the ledger records which of the two things happened to the row while
 * the contract records what the gateway said. `GATEWAY_ACK_TO_DELIVERY_KIND`
 * below is that mapping, and a test asserts it is total.
 */
export type GatewayAckStatus =
  | 'accepted'
  | 'duplicate'
  | 'pending'
  | 'remote_failed'
  | 'retryable_failure'
  | 'permanent_failure';

/**
 * Response words that mean "the gateway says it published this".
 *
 * A 2xx with an unrecognised word is NOT a success — see `classifyGatewayAck`.
 */
export const GATEWAY_ACCEPTED_STATUSES = Object.freeze([
  'accepted',
  'ok',
  'success',
  'published',
  'sent',
  'delivered',
] as const);

/** Response words that mean "this exact delivery already existed; do not resend". */
export const GATEWAY_DUPLICATE_STATUSES = Object.freeze([
  'duplicate',
  'duplicate_existing',
  'already_exists',
  'replayed',
] as const);

/**
 * Response words that mean "recorded, not published yet".
 *
 * Deliberately mapped to a RETRYABLE outcome: the durable outbox keeps
 * re-sending the SAME idempotency key until the gateway confirms a business
 * terminal state. `200 {status:"pending"}` is a partial answer, and the only
 * honest reading of a partial answer is "try again".
 */
export const GATEWAY_PENDING_STATUSES = Object.freeze([
  'pending',
  'queued',
  'accepted_pending',
  'submitted',
  'processing',
] as const);

/** Response words that are a business verdict: never deliverable, never retried. */
export const GATEWAY_TERMINAL_FAILURE_STATUSES = Object.freeze([
  'failed',
  'rejected',
  'invalid',
  'expired',
  'blocked',
] as const);

/**
 * The complete response vocabulary, classified. This is the single source of
 * truth that `parseWebhookAck` and `docs/GATEWAY_CONTRACT.md` §5 share.
 */
export const GATEWAY_ACK_VOCABULARY: Readonly<Record<GatewayAckStatus, readonly string[]>> =
  Object.freeze({
    accepted: GATEWAY_ACCEPTED_STATUSES,
    duplicate: GATEWAY_DUPLICATE_STATUSES,
    pending: GATEWAY_PENDING_STATUSES,
    remote_failed: GATEWAY_TERMINAL_FAILURE_STATUSES,
    // Not words: HTTP status codes, listed here so the contract has one table.
    retryable_failure: Object.freeze(['HTTP 429', 'HTTP 5xx']),
    permanent_failure: Object.freeze(['HTTP 4xx (other than 409)']),
  });

/** The `id`/`message_id` field names a gateway may use to report a remote id. */
export const GATEWAY_REMOTE_ID_FIELDS = Object.freeze(['id', 'message_id'] as const);

/**
 * Contract outcome → ledger outcome.
 *
 * The ledger's vocabulary is historical (`duplicate_existing` predates this
 * module) and a rename would touch the delivery ledger and its stored rows, so
 * the mapping is stated here instead of being applied to the data.
 */
export const GATEWAY_ACK_TO_DELIVERY_KIND: Readonly<Record<GatewayAckStatus, string>> = Object.freeze({
  accepted: 'accepted',
  duplicate: 'duplicate_existing',
  pending: 'retryable_failure',
  remote_failed: 'remote_failed',
  retryable_failure: 'retryable_failure',
  permanent_failure: 'permanent_failure',
});

/** The `reason`/`error`/`message` field names a gateway may use to explain a failure. */
export const GATEWAY_ERROR_DETAIL_FIELDS = Object.freeze(['reason', 'error', 'message'] as const);

/** What a delivery attempt produced, in the vocabulary above. */
export interface GatewayAckShape {
  /** HTTP status the gateway answered with. */
  status: number;
  /** The parsed JSON body, if any. */
  body: unknown;
}

/** What `GET /pairing` must answer for the WebUI to render something useful. */
export type GatewayPairingState = 'unknown' | 'unreachable' | 'waiting' | 'connected';

export const GATEWAY_PAIRING_STATES = Object.freeze([
  'unknown',
  'unreachable',
  'waiting',
  'connected',
] as const);

/** Field names under which a gateway may hand back a QR image. */
export const GATEWAY_PAIRING_IMAGE_FIELDS = Object.freeze([
  'qrCode',
  'qr_code',
  'qrcode',
  'dataUrl',
  'data_url',
  'image',
] as const);

/** How the WebUI should render one pairing answer. */
export interface GatewayPairingView {
  /** Status the gateway reported, or `unknown` when it reported none. */
  status: GatewayPairingState;
  /** True when the answer carries something the browser can show as an image. */
  hasImage: boolean;
  /** Account name the gateway reported, when it did. */
  account: string | null;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function isDataImage(value: unknown): boolean {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

/**
 * Classify a `GET /pairing` answer.
 *
 * Kept deliberately narrow: the WebUI renders an image only from shapes it can
 * prove are an image. Anything else is shown as text, because a gateway that
 * answers with an HTML login page must not be rendered as if it were a QR code.
 */
export function classifyGatewayPairing(body: unknown): GatewayPairingView {
  const record = asRecord(body);
  const rawStatus = typeof record?.status === 'string' ? record.status.trim().toLowerCase() : '';
  const status = (GATEWAY_PAIRING_STATES as readonly string[]).includes(rawStatus)
    ? (rawStatus as GatewayPairingState)
    : 'unknown';
  const account =
    record && typeof record.account === 'string' && record.account.trim()
      ? record.account.trim()
      : null;
  if (!record) return { status, hasImage: false, account };
  const imageField = GATEWAY_PAIRING_IMAGE_FIELDS.some((field) => isDataImage(record[field]));
  const contentType =
    typeof record.contentType === 'string' ? record.contentType.toLowerCase() : '';
  const hasImage =
    isDataImage(body) || imageField || (contentType.startsWith('image/') && typeof record.base64 === 'string');
  return { status, hasImage, account };
}

/**
 * Classify a delivery attempt the same way `parseWebhookAck` does, stated as
 * the contract rather than as control flow.
 *
 * This exists so the contract can be stated once in prose and once as data
 * without either drifting: the test suite asserts that this and
 * `parseWebhookAck` agree on the whole decision tree, including the two cases
 * that are easy to get wrong — a 2xx carrying `status:"failed"` is a BUSINESS
 * FAILURE, and a 2xx carrying a word nobody knows is NOT a success.
 */
export function classifyGatewayAck(attempt: GatewayAckShape): GatewayAckStatus {
  const { status, body } = attempt;
  const record = asRecord(body);
  const statusWord = typeof record?.status === 'string' ? record.status.trim().toLowerCase() : '';
  if ((GATEWAY_TERMINAL_FAILURE_STATUSES as readonly string[]).includes(statusWord)) return 'remote_failed';
  if (status === 409 || (GATEWAY_DUPLICATE_STATUSES as readonly string[]).includes(statusWord)) {
    return 'duplicate';
  }
  if ((GATEWAY_PENDING_STATUSES as readonly string[]).includes(statusWord)) return 'retryable_failure';
  if (status === 429) return 'retryable_failure';
  if (status >= 500) return 'retryable_failure';
  if (status >= 400) return 'permanent_failure';
  if (statusWord && !(GATEWAY_ACCEPTED_STATUSES as readonly string[]).includes(statusWord)) {
    return 'retryable_failure';
  }
  return 'accepted';
}
