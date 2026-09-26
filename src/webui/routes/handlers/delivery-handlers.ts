import { Request, Response } from 'express';
import { Database } from '../../../storage/Database';
import type { DeliveryRow, DeliveryStatus } from '../../../storage/repositories/DeliveryRepository';
import { getConfigPath, loadConfig } from '../../../config';
import { buildConfigAwareErrorBody } from '../../utils/config-error';
import { configuredGateways } from '../../../delivery/gatewayRoutes';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';

const DELIVERY_STATUSES = new Set<DeliveryStatus>(['pending', 'delivered', 'duplicate', 'failed']);

/**
 * Read-only delivery history across every gateway route (WebUI History panel).
 *
 * This is a PROJECTION of the existing ledger, not a second state system: the
 * `deliveries` rows are the authority, the outbox rows are joined in read-only
 * so the operator can see whether anything is still going to attempt a route,
 * and nothing here writes, retries or cancels.
 *
 * The response never contains a credential, a filesystem path or a stack: a
 * `lastError` is the provider's own short message (already persisted by the
 * delivery plane, which never stores a token in it).
 */

/**
 * Read the configuration WITHOUT credential validation.
 *
 * The delivery ledger is Pixiv-independent: it is the record of what PixivFlow
 * promised each configured gateway. Requiring a valid Pixiv refresh token to
 * read it would 500 the panel for an operator who has not logged in yet — the
 * very state in which "did anything get delivered?" matters most. Credentials
 * stay enforced everywhere they are actually used (downloads, scheduling,
 * login).
 */
function loadDeliveryPlaneConfig() {
  return loadConfig(getConfigPath(), true);
}

export async function listDeliveries(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const config = loadDeliveryPlaneConfig();
    const limit = Math.min(Math.max(Number(req.query.limit ?? 25) || 25, 1), 200);
    const statusQuery = typeof req.query.status === 'string' ? req.query.status : undefined;
    const targetQuery = typeof req.query.target === 'string' ? req.query.target : undefined;
    const workType = typeof req.query.workType === 'string' ? req.query.workType : undefined;
    if (statusQuery && !DELIVERY_STATUSES.has(statusQuery as DeliveryStatus)) {
      res.status(400).json({
        errorCode: ErrorCode.DELIVERY_STATUS_INVALID,
        message: `Unknown delivery status: ${statusQuery}`,
      });
      return;
    }

    const routes = configuredGateways(config).map((route) => ({
      name: route.name,
      type: route.type,
      enabled: route.enabled,
    }));

    if (!config.storage?.databasePath) {
      res.json({
        data: {
          schemaVersion: 1,
          readOnly: true,
          routes,
          counts: { pending: 0, delivered: 0, duplicate: 0, failed: 0 },
          perRoute: {},
          deliveries: [],
        },
      });
      return;
    }

    database = new Database(config.storage.databasePath);
    database.migrate();

    const deliveries = database.deliveries.listRecent({
      limit,
      status: statusQuery as DeliveryStatus | undefined,
      deliveryTarget: targetQuery,
      workType,
    });
    const outbox = database.outbox.listForDeliveryIds(deliveries.map((row) => row.id));
    const counts = database.deliveries.countByStatus();
    const perRoute: Record<string, Record<string, number>> = {};
    for (const route of routes) {
      perRoute[route.name] = database.deliveries.countByStatusForTarget(route.name);
    }
    database.close();
    database = null;

    res.json({
      data: {
        schemaVersion: 1,
        readOnly: true,
        routes,
        counts,
        perRoute,
        deliveries: deliveries.map((row) => project(row, outbox.get(row.id)?.status ?? null)),
      },
    });
  } catch (error) {
    if (database) {
      try { database.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list delivery history', { error: { message } });
    res.status(500).json(buildConfigAwareErrorBody(error, ErrorCode.DELIVERY_LIST_FAILED));
  }
}

/** One delivery intent, as the History view needs it. */
export async function getDelivery(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
    res.status(400).json({ errorCode: ErrorCode.DELIVERY_NOT_FOUND, message: 'invalid delivery id' });
    return;
  }
  let database: Database | null = null;
  try {
    const config = loadDeliveryPlaneConfig();
    if (!config.storage?.databasePath) {
      res.status(404).json({ errorCode: ErrorCode.DELIVERY_NOT_FOUND });
      return;
    }
    database = new Database(config.storage.databasePath);
    database.migrate();
    const row = database.deliveries.getById(id);
    if (!row) {
      database.close();
      database = null;
      res.status(404).json({ errorCode: ErrorCode.DELIVERY_NOT_FOUND, message: 'unknown delivery id' });
      return;
    }
    const outboxRow = database.outbox.listForDeliveryIds([row.id]).get(row.id);
    // The event trail is sanitized at write time (delivery_events.detail is a
    // short pre-redacted JSON blob and never holds a secret).
    const events = outboxRow
      ? database.outbox.listEvents({ outboxId: outboxRow.id, limit: 50 })
      : [];
    database.close();
    database = null;

    res.json({
      data: {
        schemaVersion: 1,
        readOnly: true,
        delivery: project(row, outboxRow?.status ?? null),
        outbox: outboxRow
          ? {
              id: outboxRow.id,
              status: outboxRow.status,
              attempts: outboxRow.attempts,
              maxAttempts: outboxRow.maxAttempts,
              nextAttemptAt: outboxRow.nextAttemptAt,
              lastError: outboxRow.lastError,
            }
          : null,
        events: events.map((event) => ({
          ts: event.ts,
          event: event.event,
          errorClass: event.errorClass,
          retryable: event.retryable,
          countsAsAttempt: event.countsAsAttempt,
          actor: event.actor,
          detail: event.detail,
        })),
      },
    });
  } catch (error) {
    if (database) {
      try { database.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to read delivery intent', { id, error: { message } });
    res.status(500).json(buildConfigAwareErrorBody(error, ErrorCode.DELIVERY_LIST_FAILED));
  }
}

function project(row: DeliveryRow, outboxStatus: string | null): Record<string, unknown> {
  return {
    id: row.id,
    deliveryTarget: row.deliveryTarget,
    workType: row.workType,
    pixivId: row.pixivId,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    remoteId: row.remoteId,
    remoteStatus: row.remoteStatus,
    slotId: row.slotId,
    targetId: row.targetId,
    outboxStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deliveredAt: row.deliveredAt,
  };
}
