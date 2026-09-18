import { Request, Response } from 'express';
import { Database } from '../../../storage/Database';
import { loadConfig, getConfigPath } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';

const RECOVERY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET_ID_SAFE = /^[A-Za-z0-9._-]{1,80}$/;

function recoveryBaseUrl(): string | null {
  return process.env.SCHEDULER_TRIGGER_URL?.trim() || process.env.PIXIVFLOW_TRIGGER_BASE_URL?.trim() || null;
}

function recoveryToken(): string | null {
  return process.env.SCHEDULER_TRIGGER_TOKEN?.trim() || null;
}

async function forwardRecovery(
  res: Response,
  targetId: string,
  pathAndQuery: string,
  init: { method: string; body?: string }
): Promise<void> {
  const base = recoveryBaseUrl();
  const token = recoveryToken();
  if (!base || !token) {
    res503();
    return;
  }
  try {
    const upstream = await fetch(
      `${base.replace(/\/+$/, '')}${pathAndQuery}`,
      {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body,
      }
    );
    const body: unknown = await upstream.json().catch(() => null);
    // Bubble the upstream status + body up unchanged; the client only ever
    // talks to the same honest dispatcher the external clock talks to.
    res.status(upstream.status).json(
      body && typeof body === 'object' ? body : { status: upstream.ok ? 'ok' : 'error' }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('WebUI recovery proxy failed', { targetId, error: { message } });
    res.status(502).json({
      errorCode: ErrorCode.SCHEDULER_RECOVERY_FAILED,
      message: 'recovery proxy request failed',
    });
  }

  function res503(): void {
    res.status(503).json({
      errorCode: ErrorCode.SCHEDULER_RECOVERY_UNAVAILABLE,
      message:
        'Configure SCHEDULER_TRIGGER_URL (or PIXIVFLOW_TRIGGER_BASE_URL) and ' +
        'SCHEDULER_TRIGGER_TOKEN to enable WebUI recovery actions.',
    });
  }
}

/**
 * GET /api/scheduler — read-only recent slot occurrences (WebUI Control Center
 * Phase 1: Scheduler panel). Deliberately no writes and no secrets: this is a
 * projection of the existing Slot Ledger, not a second state system.
 */
export async function listRecentSlots(req: Request, res: Response): Promise<void> {
  let database: Database | null = null;
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 14) || 14, 1), 50);
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    if (!config.storage?.databasePath) {
      res.status(400).json({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED, message: 'database not configured' });
      return;
    }
    database = new Database(config.storage.databasePath);
    database.migrate();

    const slots = database.slots.getRecentSlots(limit).map((slot) => ({
      slotId: slot.id,
      scheduleId: slot.scheduleId,
      status: slot.status,
      occurrenceAt: slot.occurrenceAt,
      occurrenceDate: slot.occurrenceDate,
      occurrenceLabel: slot.occurrenceLabel,
      timezone: slot.timezone,
      triggerSource: slot.triggerSource,
      recoveryRequestId: slot.recoveryRequestId ?? null,
      recoveryMode: slot.recoveryMode ?? null,
      startedAt: slot.startedAt,
      completedAt: slot.completedAt,
      targets: database!.slots.getCells(slot.id).map((cell) => ({
        targetId: cell.targetId,
        workType: cell.workType,
        status: cell.status,
        workId: cell.workId,
        terminalReasonCode: cell.terminalReasonCode,
        reason: cell.terminalReasonMessage ?? null,
      })),
    }));

    database.close();
    database = null;

    res.json({ data: { slots } });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch {
        // ignore
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list scheduler slots', { error: { message } });
    res.status(500).json({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED });
  }
}

/**
 * POST /api/scheduler/targets/:targetId/recover
 *
 * WebUI Control Center Recovery action. This is a thin server-side proxy to the
 * EXISTING authenticated scheduler dispatcher (`POST /internal/targets/:targetId/recover`),
 * so the browser never sees the trigger token and the business admission rules
 * live exactly where scheduled/manual recovery already lives. Deliberately
 * disabled with a clear 503 when the proxy URL/token env vars are absent —
 * read-only Scheduler remains fully usable.
 */
export async function recoverTarget(req: Request, res: Response): Promise<void> {
  const targetId = req.params.targetId;
  if (!TARGET_ID_SAFE.test(targetId)) {
    res.status(400).json({ status: 'error', error: 'invalid targetId' });
    return;
  }
  const requestId = req.body?.requestId;
  if (typeof requestId !== 'string' || !RECOVERY_UUID.test(requestId)) {
    res.status(400).json({ status: 'error', error: 'requestId must be a UUID' });
    return;
  }
  const retryMode = req.body?.retryMode === 'relaxed' ? 'relaxed' : 'normal';
  const correlationId = req.body?.correlationId;
  if (correlationId !== undefined && (typeof correlationId !== 'string' || correlationId.length > 200)) {
    res.status(400).json({ status: 'error', error: 'correlationId must be a string of at most 200 chars' });
    return;
  }
  await forwardRecovery(res, targetId, `/internal/targets/${encodeURIComponent(targetId)}/recover`, {
    method: 'POST',
    body: JSON.stringify({
      requestId,
      retryMode,
      ...(correlationId ? { correlationId } : {}),
    }),
  });
}

/**
 * GET /api/scheduler/targets/:targetId/recover/:requestId
 *
 * Poll the durable recovery slot outcome (same contract the review chain uses).
 */
export async function recoverStatus(
  req: Request,
  res: Response
): Promise<void> {
  const { targetId, requestId } = req.params;
  if (!TARGET_ID_SAFE.test(targetId) || !RECOVERY_UUID.test(requestId ?? '')) {
    res.status(400).json({ status: 'error', error: 'invalid targetId or requestId' });
    return;
  }
  await forwardRecovery(res, targetId, `/internal/targets/${encodeURIComponent(targetId)}/recover/${encodeURIComponent(requestId!)}`, {
    method: 'GET',
  });
}
