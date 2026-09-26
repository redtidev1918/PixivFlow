import { Request, Response } from 'express';
import { Database } from '../../../storage/Database';
import type { GatewayConnectionRow } from '../../../storage/repositories/GatewayConnectionRepository';
import type { DeliveryRow } from '../../../storage/repositories/DeliveryRepository';
import { loadConfig, getConfigPath } from '../../../config';
import { resolveTargetCapabilities } from '../../../delivery/capabilities';
import {
  configuredGateways,
  connectionStatusLabel,
  redactedEndpoint,
  supportsPairing,
} from '../../../delivery/gatewayRoutes';
import { redactUrl } from '../../../utils/redact';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';
import { buildConfigAwareErrorBody } from '../../utils/config-error';

const GATEWAY_NAME_SAFE = /^[A-Za-z0-9._-]{1,80}$/;

/**
 * Read the configuration WITHOUT credential validation.
 *
 * This projection needs the delivery routes and the ledger — never a Pixiv
 * token. `skipValidation` is therefore required, not a shortcut: with
 * validation on, a user who has not logged in yet (or whose refresh token
 * expired) gets a 500 on a read-only panel, which is exactly the state in
 * which an operator needs to see what the delivery plane is configured to do.
 * Pixiv credentials are still enforced everywhere they are actually used
 * (downloads, scheduling, login).
 */
function loadDeliveryPlaneConfig() {
  return loadConfig(getConfigPath(), true);
}

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
    const config = loadDeliveryPlaneConfig();
    const routes = configuredGateways(config);
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
        endpoint: redactedEndpoint(route.target),
        // Declared in config; true while at least one enabled download target
        // still fans out to this route.
        enabled: route.enabled,
        // Whether the GATEWAY offers a pairing endpoint we may read. False
        // means the panel must not show a pairing dialog at all.
        pairingSupported: supportsPairing(route.target),
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
        // True when at least one route offers a pairing endpoint to read.
        pairingSupported: routes.some((route) => supportsPairing(route.target)),
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
    res.status(500).json(buildConfigAwareErrorBody(error, ErrorCode.GATEWAY_LIST_FAILED));
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
    const config = loadDeliveryPlaneConfig();
    const route = configuredGateways(config).find((r) => r.name === name);
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
        endpoint: redactedEndpoint(route.target),
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
    res.status(500).json(buildConfigAwareErrorBody(error, ErrorCode.GATEWAY_LIST_FAILED));
  }
}

/**
 * Re-exported so existing callers keep one import site; the implementation is
 * shared with the CLI in `delivery/gatewayRoutes`.
 */
export { connectionStatusLabel };
