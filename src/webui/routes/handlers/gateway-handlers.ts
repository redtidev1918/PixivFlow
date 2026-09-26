import { Request, Response } from 'express';
import { Database } from '../../../storage/Database';
import type { GatewayConnectionRow, GatewayConnectionStatus } from '../../../storage/repositories/GatewayConnectionRepository';
import type { DeliveryRow } from '../../../storage/repositories/DeliveryRepository';
import { loadConfig, getConfigPath } from '../../../config';
import { resolveTargetCapabilities } from '../../../delivery/capabilities';
import { targetDeliveryNames, primaryDeliveryName } from '../../../delivery/targetRoutes';
import { redactUrl } from '../../../utils/redact';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';

const GATEWAY_NAME_SAFE = /^[A-Za-z0-9._-]{1,80}$/;

/**
 * Read-only projection of the Messaging Gateway plane (WebUI Gateway panel).
 *
 * Two facts are merged, each from its existing authority:
 *   - the delivery ROUTES declared in config (`delivery.targets.<name>` plus the
 *     download targets that point at them) — configuration truth;
 *   - the `gateway_connections` rows — PixivFlow's last OBSERVATION of an
 *     external gateway's own pairing state (never a credential store).
 *
 * Nothing here writes, probes or pairs: pairing happens inside the gateway
 * process, and this endpoint only renders what is already durable. No token,
 * session or unredacted endpoint ever leaves the server.
 */
export async function listGateways(_req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    const routes = configuredRoutes(config);
    let connections: GatewayConnectionRow[] = [];
    let deliveriesByRoute: Record<string, Record<string, number>> = {};
    if (config.storage?.databasePath) {
      database = new Database(config.storage.databasePath);
      database.migrate();
      connections = database.gatewayConnections.list();
      deliveriesByRoute = Object.fromEntries(
        routes.map((route) => [route.name, database!.deliveries.countByStatusForTarget(route.name)])
      );
      database.close();
      database = null;
    }

    const byName = new Map(connections.map((c) => [c.name, c]));
    const gateways = routes.map((route) => {
      const stored = byName.get(route.name);
      return {
        name: route.name,
        type: route.type,
        endpoint: redactUrl(route.endpoint),
        connectionStatus: stored?.status ?? 'unknown',
        connectionUpdatedAt: stored?.updatedAt ?? null,
        // Declared in config; the same resolver the delivery engine uses.
        capabilities: resolveTargetCapabilities(route.target),
        deliveryCounts: deliveriesByRoute[route.name] ?? null,
      };
    });

    // A stored connection with no matching config route is a dangling pointer:
    // surface it explicitly instead of hiding it (it is usually a removed
    // target whose row should be dropped).
    const configured = new Set(routes.map((r) => r.name));
    const unconfigured = connections
      .filter((c) => !configured.has(c.name))
      .map((c) => ({
        name: c.name,
        type: c.type,
        endpoint: redactUrl(c.endpoint),
        connectionStatus: c.status,
        connectionUpdatedAt: c.updatedAt,
      }));

    res.json({
      data: {
        schemaVersion: 1,
        // Read-only by construction: the WebUI never generates a QR code and
        // never stores a chat session (both belong to the gateway process).
        pairingSupported: false,
        gateways,
        unconfigured,
      },
    });
  } catch (error) {
    if (database) {
      try { database.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list gateway connections', { error: { message } });
    res.status(500).json({ errorCode: ErrorCode.GATEWAY_LIST_FAILED });
  }
}

/**
 * GET /api/gateways/:name — one route's declared capabilities, last observed
 * connection state and most recent delivery facts (read-only).
 */
export async function getGateway(req: Request, res: Response): Promise<void> {
  const name = req.params.name;
  if (!GATEWAY_NAME_SAFE.test(name ?? '')) {
    res.status(400).json({ errorCode: ErrorCode.GATEWAY_NOT_FOUND, message: 'invalid gateway name' });
    return;
  }
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    const route = configuredRoutes(config).find((r) => r.name === name);
    if (!route) {
      res.status(404).json({
        errorCode: ErrorCode.GATEWAY_NOT_FOUND,
        message: `Gateway route is not configured: ${name}`,
      });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25) || 25, 1), 200);
    let connection: GatewayConnectionRow | null = null;
    let history: DeliveryRow[] = [];
    let counts: Record<string, number> | null = null;
    if (config.storage?.databasePath) {
      database = new Database(config.storage.databasePath);
      database.migrate();
      connection = database.gatewayConnections.getByName(name);
      history = database.deliveries.listRecentByTarget(name, { limit });
      counts = database.deliveries.countByStatusForTarget(name);
      database.close();
      database = null;
    }
    res.json({
      data: {
        schemaVersion: 1,
        name: route.name,
        type: route.type,
        endpoint: redactUrl(route.endpoint),
        connectionStatus: connection?.status ?? 'unknown',
        connectionUpdatedAt: connection?.updatedAt ?? null,
        capabilities: resolveTargetCapabilities(route.target),
        deliveryCounts: counts,
        history: history.map((row) => ({
          id: row.id,
          workType: row.workType,
          pixivId: row.pixivId,
          status: row.status,
          attempts: row.attempts,
          lastError: row.lastError,
          slotId: row.slotId,
          targetId: row.targetId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          deliveredAt: row.deliveredAt,
        })),
      },
    });
  } catch (error) {
    if (database) {
      try { database.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to read gateway connection', { name, error: { message } });
    res.status(500).json({ errorCode: ErrorCode.GATEWAY_LIST_FAILED });
  }
}

interface ConfiguredRoute {
  name: string;
  type: string;
  endpoint: string | null;
  target: import('../../../config').DeliveryTargetConfig;
}

/**
 * Every delivery route referenced by a download target, plus the legacy
 * single-route projection. `primaryDeliveryName` is used for the legacy field
 * so this listing can never disagree with the operator-facing notification
 * route about which name a target means.
 */
function configuredRoutes(config: ReturnType<typeof loadConfig>): ConfiguredRoute[] {
  const registry = config.delivery?.targets ?? {};
  const names = new Set<string>();
  for (const target of config.targets ?? []) {
    for (const route of targetDeliveryNames(target)) names.add(route);
    const primary = primaryDeliveryName(target);
    if (primary) names.add(primary);
  }
  const routes: ConfiguredRoute[] = [];
  for (const name of [...names].sort()) {
    const target = registry[name];
    if (!target) continue;
    routes.push({ name, type: target.type, endpoint: endpointOf(target), target });
  }
  return routes;
}

function endpointOf(target: import('../../../config').DeliveryTargetConfig): string | null {
  const candidate = (target as { url?: string; endpoint?: string }).url
    ?? (target as { endpoint?: string }).endpoint;
  return typeof candidate === 'string' ? candidate : null;
}

/** Re-exported so a CLI/other consumer can label a status consistently. */
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
