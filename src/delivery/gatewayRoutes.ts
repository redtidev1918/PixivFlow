import type { DeliveryTargetConfig, StandaloneConfig } from '../config';
import type { GatewayConnectionStatus } from '../storage/repositories/GatewayConnectionRepository';
import { redactUrl } from '../utils/redact';
import { primaryDeliveryName, targetDeliveryNames } from './targetRoutes';

/**
 * Delivery ROUTES as configuration truth, in one place.
 *
 * A "gateway route" is one entry in `config.delivery.targets` — the thing the
 * delivery engine dispatches to by name. Three consumers must agree about the
 * list, so it is resolved here once and imported by all of them:
 *
 *  - the delivery engine itself (the outbox carries `delivery_target`);
 *  - the WebUI read-only projection (`/api/gateways*`);
 *  - the operator CLI (`pixivflow gateway list|status|test`).
 *
 * `enabled` records whether at least one *enabled* download target still fans
 * out to this route (`storageMode === 'cache'` — the same predicate the
 * delivery engine uses). A route that is declared but no longer enabled is
 * still listed, because the operator needs to see it (usually to delete it)
 * and because the delivery ledger can still hold rows for it.
 */
export interface ConfiguredGateway {
  name: string;
  type: string;
  /** Raw configured endpoint (may embed `${ENV}`); never log or persist this. */
  endpoint: string | null;
  target: DeliveryTargetConfig;
  enabled: boolean;
}

/** What kind of endpoint a route config exposes, if any. */
export interface GatewayEndpoints {
  /** Where deliveries are POSTed (webhook / httpMultipart). */
  endpoint: string | null;
  /** Optional preflight URL declared by the route (httpMultipart only). */
  readinessUrl: string | null;
}

/**
 * Every route declared in `delivery.targets`, sorted by name.
 *
 * Both the fan-out array and the legacy single value are consulted so the list
 * can never disagree with the delivery engine about which names a download
 * target means.
 */
export function configuredGateways(config: StandaloneConfig): ConfiguredGateway[] {
  const registry = config.delivery?.targets ?? {};
  const enabled = new Set<string>();
  for (const target of config.targets ?? []) {
    const routes = targetDeliveryNames(target);
    for (const route of routes) enabled.add(route);
    // The legacy single value only counts when its target is really enabled:
    // `primaryDeliveryName` deliberately ignores `storageMode` (the notification
    // path needs the name even then), so consulting it here would mark a route
    // enabled on the strength of a disabled download target.
    if (routes.length === 0 && isEnabledDownloadTarget(target)) {
      const primary = primaryDeliveryName(target);
      if (primary) enabled.add(primary);
    }
  }
  const routes: ConfiguredGateway[] = [];
  for (const name of Object.keys(registry).sort()) {
    const target = registry[name];
    if (!target) continue;
    routes.push({
      name,
      type: target.type,
      endpoint: endpointOf(target),
      target,
      enabled: enabled.has(name),
    });
  }
  return routes;
}

/** One route by name, or null. */
export function configuredGateway(config: StandaloneConfig, name: string): ConfiguredGateway | null {
  return configuredGateways(config).find((route) => route.name === name) ?? null;
}

/** The endpoint a route delivers to, plus its optional readiness URL. */
export function gatewayEndpoints(target: DeliveryTargetConfig): GatewayEndpoints {
  const record = target as { url?: unknown; endpoint?: unknown; readinessUrl?: unknown };
  return {
    endpoint: stringOrNull(record.url) ?? stringOrNull(record.endpoint),
    readinessUrl: stringOrNull(record.readinessUrl),
  };
}

/** The endpoint a route delivers to, if its type has one. */
export function endpointOf(target: DeliveryTargetConfig): string | null {
  return gatewayEndpoints(target).endpoint;
}

/**
 * The redacted endpoint that MAY be persisted or returned.
 *
 * Credentials in a URL (`https://user:pass@host/…?token=…`) must never reach
 * the database, a log line or an API response; `redactUrl` keeps host + path so
 * the operator can still tell two gateways apart. An unresolved `${ENV}` stays
 * literal — `redactUrl` leaves it alone and it is not a secret by itself.
 */
export function redactedEndpoint(target: DeliveryTargetConfig): string | null {
  return redactUrl(endpointOf(target));
}

/** Operator-facing label for a persisted connection observation. */
export function connectionStatusLabel(status: GatewayConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'waiting':
      return 'waiting for pairing';
    case 'unreachable':
      return 'unreachable';
    default:
      return 'unknown';
  }
}

/** The same predicate the delivery engine uses to decide a target delivers. */
function isEnabledDownloadTarget(target: { storageMode?: string }): boolean {
  return target.storageMode === 'cache';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
