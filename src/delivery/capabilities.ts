import type { DeliveryTargetConfig, TargetDeliveryConfig } from '../config';

/**
 * What a delivery target can actually carry.
 *
 * The delivery engine branches on CAPABILITY, never on platform name: a target
 * that cannot carry an album must still receive every image, and a target that
 * cannot carry files must say so instead of silently dropping them. Platform
 * limits are data, not code, so a new adapter only declares them.
 *
 * The concrete numbers below come from the platform APIs themselves (Telegram
 * 4096-char text / 1024-char caption / 50 MB upload, Discord 2000-char text /
 * 10 attachments, Feishu 10 MB image and 30 MB file uploads, OneBot message
 * segments that cannot mix forwards/files with ordinary content); keep them in
 * sync with docs/architecture/delivery-runtime.md when a platform changes.
 */
export type DeliveryCapability = 'text' | 'image' | 'file' | 'album' | 'video';

/** Every capability, in stable reporting order. */
export const ALL_DELIVERY_CAPABILITIES: readonly DeliveryCapability[] = [
  'text',
  'image',
  'file',
  'album',
  'video',
];

/**
 * What a target does when its text does not fit `maxTextLength`.
 *
 * Declared rather than assumed: silently clipping a caption loses content, and
 * splitting a caption across messages can spam a channel. The delivery engine
 * reads this instead of inventing a default, and `error` means "fail loudly".
 */
export type TruncatePolicy = 'split' | 'truncate' | 'error';

export const TRUNCATE_POLICIES: readonly TruncatePolicy[] = ['split', 'truncate', 'error'];

/** Where the platform itself can dedupe a resent message. Documented, not code. */
export type IdempotencyMechanism = 'none' | 'platform_key' | 'upstream_ledger';

export const IDEMPOTENCY_MECHANISMS: readonly IdempotencyMechanism[] = [
  'none',
  'platform_key',
  'upstream_ledger',
];

/**
 * Optional per-target capability overrides. Authored in config; numbers and
 * flags that are absent fall back to the platform type's defaults.
 */
export interface DeliveryCapabilityOverrides {
  /** Whether text/caption content may be sent at all. */
  text?: boolean;
  image?: boolean;
  file?: boolean;
  album?: boolean;
  video?: boolean;
  /** Hard ceiling for a single text body, in characters. */
  maxTextLength?: number;
  /** Hard ceiling for a media caption, in characters (0 when captions are unsupported). */
  maxCaptionLength?: number;
  /** Hard ceiling for one upload, in bytes. */
  maxUploadBytes?: number;
  /** How many media items one message can carry. */
  maxAttachmentsPerMessage?: number;
  /** Minimum album size when `album` is supported. */
  albumMin?: number;
  /** Maximum album size when `album` is supported. */
  albumMax?: number;
  /** One upload call returns a handle, then a second call references it (Feishu/Satori). */
  requiresTwoPhaseUpload?: boolean;
  /** Minimum spacing between two messages to this target, in milliseconds (0 = unthrottled). */
  minSendIntervalMs?: number;
  /** What to do when text exceeds `maxTextLength`. */
  truncatePolicy?: TruncatePolicy;
  /** Where duplicate suppression can happen for this platform. */
  idempotencyMechanism?: IdempotencyMechanism;
}

/** A target's fully resolved capabilities: booleans + hard limits. */
export interface TargetCapabilities {
  /** Stable identity of the platform kind (`httpMultipart`, `telegram`, `onebot`, ...). */
  type: string;
  supported: DeliveryCapability[];
  /** Max characters in a single text body (0 = text not supported). */
  maxTextLength: number;
  /** Max characters in a media caption (0 = captions not supported). */
  maxCaptionLength: number;
  /** Max bytes for one upload (0 = unknown / no declared limit). */
  maxUploadBytes: number;
  /** Max media items in one message (0 = unknown). */
  maxAttachmentsPerMessage: number;
  /** Album bounds; null when albums are unsupported. */
  album: { min: number; max: number } | null;
  /** Upload-then-reference platforms (Feishu image_key/file_key, Satori createUpload). */
  requiresTwoPhaseUpload: boolean;
  /** Minimum spacing between two messages to this target, in milliseconds (0 = unthrottled). */
  minSendIntervalMs: number;
  /** What the delivery engine does when text exceeds `maxTextLength`. */
  truncatePolicy: TruncatePolicy;
  /** Where duplicate suppression can happen for this platform. */
  idempotencyMechanism: IdempotencyMechanism;
}

/** Capabilities assumed for a platform type PixivFlow does not know yet. */
export const UNKNOWN_PLATFORM_CAPABILITIES: TargetCapabilities = {
  type: 'unknown',
  // Deliberately conservative: an unknown platform gets text only, so nothing
  // is ever sent to it that it may silently drop or misrender.
  supported: ['text'],
  maxTextLength: 4096,
  maxCaptionLength: 0,
  maxUploadBytes: 0,
  maxAttachmentsPerMessage: 0,
  album: null,
  requiresTwoPhaseUpload: false,
  minSendIntervalMs: 0,
  truncatePolicy: 'error',
  idempotencyMechanism: 'upstream_ledger',
};

/** Platform-type capability defaults, keyed by `delivery.targets.<name>.type`. */
const PLATFORM_CAPABILITIES: Record<string, TargetCapabilities> = {
  /**
   * Generic HTTP endpoint. It is an opaque multipart contract, so PixivFlow
   * cannot know its limits: everything is declared supported, no ceiling is
   * enforced, and the receiving service owns its own bound checks.
   */
  httpMultipart: {
    type: 'httpMultipart',
    supported: [...ALL_DELIVERY_CAPABILITIES],
    maxTextLength: 0,
    maxCaptionLength: 0,
    maxUploadBytes: 0,
    maxAttachmentsPerMessage: 0,
    album: null,
    requiresTwoPhaseUpload: false,
    // An opaque endpoint owns its own pacing and its own truncation behaviour;
    // PixivFlow must not impose either on a contract it cannot see.
    minSendIntervalMs: 0,
    truncatePolicy: 'error',
    idempotencyMechanism: 'upstream_ledger',
  },
  /**
   * Telegram review chain. The existing provider posts media with a caption and
   * (optionally) one album; plain text messages exist too, but the review path
   * renders text as a caption, hence the 1024-character caption ceiling.
   */
  telegram: {
    type: 'telegram',
    supported: ['text', 'image', 'file', 'album', 'video'],
    maxTextLength: 0,
    maxCaptionLength: 1024,
    maxUploadBytes: 50 * 1024 * 1024,
    maxAttachmentsPerMessage: 10,
    album: { min: 2, max: 10 },
    requiresTwoPhaseUpload: false,
    // Telegram's documented soft ceiling is ~30 messages/second; pacing below
    // that is an operator decision, so the default stays unthrottled.
    minSendIntervalMs: 0,
    // Captions that do not fit are sent as their own message rather than
    // clipped — the review chain already relies on the full title surviving.
    truncatePolicy: 'split',
    // Telegram exposes no client-supplied idempotency key; the durable ledger
    // in `deliveries` is what prevents a resend from duplicating.
    idempotencyMechanism: 'upstream_ledger',
  },
};

/**
 * The declared capability defaults for a platform type. Unknown types resolve to
 * the conservative text-only profile instead of throwing: config validation is
 * what rejects a typo, the resolver must stay total.
 */
export function platformCapabilities(type: string): TargetCapabilities {
  const known = PLATFORM_CAPABILITIES[type];
  if (known) return { ...known, supported: [...known.supported], album: known.album && { ...known.album } };
  return { ...UNKNOWN_PLATFORM_CAPABILITIES, type, supported: [...UNKNOWN_PLATFORM_CAPABILITIES.supported] };
}

/** Merge explicit overrides onto a resolved profile (booleans replace, limits clamp). */
export function applyCapabilityOverrides(
  base: TargetCapabilities,
  overrides?: DeliveryCapabilityOverrides
): TargetCapabilities {
  if (!overrides) return base;
  const supported = new Set(base.supported);
  const flag = (capability: DeliveryCapability, value?: boolean): void => {
    if (value === undefined) return;
    if (value) supported.add(capability);
    else supported.delete(capability);
  };
  flag('text', overrides.text);
  flag('image', overrides.image);
  flag('file', overrides.file);
  flag('album', overrides.album);
  flag('video', overrides.video);

  // A declared ceiling may only ever TIGHTEN the platform default; an operator
  // cannot lift a platform limit by editing config (that would just fail at the
  // platform API instead of here).
  const tighten = (limit: number | undefined, fallback: number): number => {
    if (limit === undefined || !Number.isFinite(limit) || limit < 0) return fallback;
    if (fallback === 0) return Math.trunc(limit);
    return Math.min(fallback, Math.trunc(limit));
  };

  // Pacing is the mirror image: an operator may ADD a delay but never remove one
  // a platform needs, so the slower of the two wins.
  const relax = (interval: number | undefined, fallback: number): number => {
    if (interval === undefined || !Number.isFinite(interval) || interval < 0) return fallback;
    return Math.max(fallback, Math.trunc(interval));
  };

  const albumSupported = supported.has('album');
  const album = albumSupported
    ? {
        min: overrides.albumMin ?? base.album?.min ?? 2,
        max: overrides.albumMax ?? base.album?.max ?? 10,
      }
    : null;

  return {
    type: base.type,
    supported: ALL_DELIVERY_CAPABILITIES.filter((capability) => supported.has(capability)),
    maxTextLength: tighten(overrides.maxTextLength, base.maxTextLength),
    maxCaptionLength: tighten(overrides.maxCaptionLength, base.maxCaptionLength),
    maxUploadBytes: tighten(overrides.maxUploadBytes, base.maxUploadBytes),
    maxAttachmentsPerMessage: tighten(
      overrides.maxAttachmentsPerMessage,
      base.maxAttachmentsPerMessage
    ),
    album,
    requiresTwoPhaseUpload:
      overrides.requiresTwoPhaseUpload ?? base.requiresTwoPhaseUpload,
    // Pacing may only ever get SAFER: an operator can add a delay, never remove
    // one the platform requires.
    minSendIntervalMs: relax(overrides.minSendIntervalMs, base.minSendIntervalMs),
    truncatePolicy: overrides.truncatePolicy ?? base.truncatePolicy,
    idempotencyMechanism: overrides.idempotencyMechanism ?? base.idempotencyMechanism,
  };
}

/** Convenience: does this target declare a capability? */
export function supportsCapability(
  capabilities: TargetCapabilities,
  capability: DeliveryCapability
): boolean {
  return capabilities.supported.includes(capability);
}

/** A target config's declared capability overrides (all target types may carry them). */
export interface CapabilityDeclaringTargetConfig {
  type: string;
  capabilities?: DeliveryCapabilityOverrides;
}

/**
 * Resolve the effective capabilities for one `delivery.targets` entry.
 *
 * Reads only the config (no database, no network), so validation, the CLI
 * `target list/test` command and the WebUI projection can all share it.
 */
export function resolveTargetCapabilities(target: DeliveryTargetConfig): TargetCapabilities {
  const declaring = target as CapabilityDeclaringTargetConfig;
  return applyCapabilityOverrides(
    platformCapabilities(declaring.type),
    declaring.capabilities
  );
}

/**
 * Capabilities of the delivery route referenced by a download target's legacy
 * single `delivery.target`, resolved through the named registry.
 *
 * Fan-out consumers resolve capabilities per route with `resolveTargetCapabilities`;
 * this helper exists for the single-route projections (validation, WebUI, CLI).
 * An absent or unresolved name yields the conservative text-only profile.
 */
export function capabilitiesOfDeliveryTarget(
  delivery: TargetDeliveryConfig | undefined,
  resolve?: (name: string) => DeliveryTargetConfig | undefined
): TargetCapabilities {
  const name = typeof delivery?.target === 'string' ? delivery.target.trim() : '';
  const resolved = name && resolve ? resolve(name) : undefined;
  return resolved ? resolveTargetCapabilities(resolved) : UNKNOWN_PLATFORM_CAPABILITIES;
}

/**
 * Validate one target's declared capability overrides.
 *
 * Shared by BOTH config validators (`src/config/validation.ts` and
 * `src/utils/config-validator-unified.ts`) so the two can never drift. Each
 * validator renders the returned problems in its own error shape.
 */
export function collectCapabilityOverrideErrors(
  overrides: unknown,
  prefix: string
): Array<{ field: string; message: string }> {
  if (overrides === undefined) return [];
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return [{ field: `${prefix}.capabilities`, message: 'Must be an object' }];
  }
  const value = overrides as Record<string, unknown>;
  const errors: Array<{ field: string; message: string }> = [];
  for (const flag of ['text', 'image', 'file', 'album', 'video', 'requiresTwoPhaseUpload'] as const) {
    if (value[flag] !== undefined && typeof value[flag] !== 'boolean') {
      errors.push({ field: `${prefix}.capabilities.${flag}`, message: 'Must be a boolean' });
    }
  }
  const integerAtLeast = (name: string, minimum: number): number | undefined => {
    const raw = value[name];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < minimum) {
      errors.push({
        field: `${prefix}.capabilities.${name}`,
        message: `Must be an integer greater than or equal to ${minimum}`,
      });
      return undefined;
    }
    return raw;
  };
  integerAtLeast('maxTextLength', 0);
  integerAtLeast('maxCaptionLength', 0);
  integerAtLeast('maxUploadBytes', 0);
  integerAtLeast('maxAttachmentsPerMessage', 0);
  integerAtLeast('minSendIntervalMs', 0);
  const enumAt = (name: string, allowed: readonly string[]): void => {
    const raw = value[name];
    if (raw === undefined) return;
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
      errors.push({
        field: `${prefix}.capabilities.${name}`,
        message: `Must be one of: ${allowed.join(', ')}`,
      });
    }
  };
  enumAt('truncatePolicy', TRUNCATE_POLICIES);
  enumAt('idempotencyMechanism', IDEMPOTENCY_MECHANISMS);
  const albumMin = integerAtLeast('albumMin', 1);
  const albumMax = integerAtLeast('albumMax', 1);
  if (albumMin !== undefined && albumMax !== undefined && albumMin > albumMax) {
    errors.push({
      field: `${prefix}.capabilities.albumMin`,
      message: 'Must not be greater than capabilities.albumMax',
    });
  }
  return errors;
}
