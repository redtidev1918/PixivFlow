import { Request, Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
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
      lastError: slot.lastError,
      targets: database!.slots.getCells(slot.id).map(cellProjection),
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

function parseCandidateReport(report: unknown): Record<string, unknown> | null {
  return report && typeof report === 'object' ? (report as Record<string, unknown>) : null;
}

function cellProjection(cell: {
  targetId: string;
  workType: string | null;
  status: string;
  workId: string | null;
  terminalReasonCode: string | null;
  terminalReasonMessage: string | null;
  candidateReport: Record<string, unknown> | null;
  attemptCount: number;
  fallback_stage: number;
  completedAt: string | null;
}) {
  return {
    targetId: cell.targetId,
    workType: cell.workType,
    status: cell.status,
    workId: cell.workId,
    terminalReasonCode: cell.terminalReasonCode,
    reason: cell.terminalReasonMessage ?? null,
    candidateReport: parseCandidateReport(cell.candidateReport),
    attemptCount: cell.attemptCount,
    fallbackStage: cell.fallback_stage,
    completedAt: cell.completedAt,
  };
}

/**
 * Recovery admission projection (read-only). Retry semantics still live in the
 * scheduler's own admission rules; this only labels what the WebUI may offer.
 * - system `failed`    → retryable (normal / relaxed)
 * - `no_candidate`/`duplicate` → normal business outcome; relaxed retry is the
 *   only semantically useful action (soft-scope widening), never a blind retry
 * - `submitted`/`pending`/`running` → not retryable
 */
export function recoveryAdmission(
  status: string,
  terminalReasonCode: string | null
): { retryable: boolean; relaxedRetryAllowed: boolean; retryableReason: string } {
  const t = (terminalReasonCode ?? '').toLowerCase();
  if (status === 'failed') {
    return { retryable: true, relaxedRetryAllowed: true, retryableReason: 'system failure' };
  }
  if (status === 'no_candidate' || status === 'duplicate') {
    const noContent = t === 'duplicate_exhausted' || t === 'no_candidate' || t === 'duplicate';
    return {
      retryable: !noContent,
      relaxedRetryAllowed: true,
      retryableReason: noContent
        ? 'non-retryable business outcome (no new content)'
        : 'normal retry applies',
    };
  }
  return { retryable: false, relaxedRetryAllowed: false, retryableReason: 'non-terminal or already-submitted' };
}

/**
 * GET /api/scheduler/executions — read-only Execution projection over the
 * durable Slot Ledger. Execution Truth stays in schedule_slots + items; this
 * endpoint only shapes it for the WebUI (no new state source).
 */
export async function listExecutions(req: Request, res: Response): Promise<void> {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 100);
  const targetFilter = typeof req.query.targetId === 'string' ? req.query.targetId.trim() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    if (!config.storage?.databasePath) {
      res.status(400).json({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED, message: 'database not configured' });
      return;
    }
    database = new Database(config.storage.databasePath);
    database.migrate();
    const slots = database.slots.getRecentSlots(Math.max(limit, 50));
    const executions = slots
      .flatMap((slot) =>
        database!.slots.getCells(slot.id).map((cell) => {
          const cellView = cellProjection(cell);
          const admission = recoveryAdmission(cell.status, cell.terminalReasonCode);
          return {
            executionId: `${slot.id}:${cell.targetId}`,
            slotId: slot.id,
            scheduleId: slot.scheduleId,
            targetId: cell.targetId,
            workType: cell.workType,
            status: cell.status,
            terminalReasonCode: cell.terminalReasonCode,
            message: cell.terminalReasonMessage,
            startedAt: slot.startedAt,
            endedAt: cell.completedAt ?? slot.completedAt,
            triggerSource: slot.triggerSource,
            recoveryRequestId: slot.recoveryRequestId ?? null,
            recoveryMode: slot.recoveryMode ?? null,
            occurrenceAt: slot.occurrenceAt,
            candidateReport: cellView.candidateReport,
            attemptCount: cell.attemptCount,
            fallbackStage: cell.fallback_stage,
            recovery: admission,
            operatorHint: admission.retryable
              ? '可重试'
              : admission.relaxedRetryAllowed
                ? '正常完成的无新内容结果，仅在人工判断后可放宽条件重试'
                : '非终态或已成功，无需重试',
          };
        })
      )
      .filter((e) => {
        if (targetFilter && e.targetId !== targetFilter) return false;
        if (statusFilter && e.status.toLowerCase() !== statusFilter) return false;
        return true;
      })
      .slice(0, limit);

    database.close();
    database = null;
    res.json({ data: { executions } });
  } catch (error) {
    if (database) {
      try { database.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list scheduler executions', { error: { message } });
    res.status(500).json({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED });
  }
}

/**
 * GET /api/scheduler/slots/:slotId/logs
 *
 * Correlated log view: filters the process log file by the slot id and its
 * target ids so operators can replay exactly the lines for one occurrence.
 * Pure filtering of existing structured logger output, no new store.
 */
export async function getSlotLogs(req: Request, res: Response): Promise<void> {
  const slotId = req.params.slotId;
  if (!slotId || slotId.length > 200) {
    res.status(400).json({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED, message: 'invalid slotId' });
    return;
  }
  let database: Database | null = null;
  try {
    const configPath = getConfigPath();
    const config = loadConfig(configPath);
    if (!config.storage?.databasePath) {
      res.status(400).json({ errorCode: ErrorCode.SCHEDULER_LIST_FAILED, message: 'database not configured' });
      return;
    }
    database = new Database(config.storage.databasePath);
    database.migrate();
    const slot = database.slots.getSlot(slotId);
    const targets = slot ? database.slots.getCells(slotId).map((c) => c.targetId) : [];
    database.close();
    database = null;

    let logFile = '';
    const dataDir = path.dirname(config.storage.databasePath);
    for (const candidate of [
      path.join(dataDir, 'pixiv-downloader.log'),
      path.resolve(process.cwd(), 'data', 'pixiv-downloader.log'),
    ]) {
      if (existsSync(candidate)) {
        logFile = candidate;
        break;
      }
    }
    if (!logFile) {
      res.json({ data: { logs: [], total: 0, slotId, targets } });
      return;
    }
    const keywords = [slotId, ...targets];
    const lines = readFileSync(logFile, 'utf-8')
      .split('\n')
      .filter((line) => line.trim() && keywords.some((k) => line.toLowerCase().includes(k.toLowerCase())));
    res.json({ data: { logs: lines.slice(-500), total: lines.length, slotId, targets } });
  } catch (error) {
    if (database) {
      try { database.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to read slot logs', { slotId, error: { message } });
    res.status(500).json({ errorCode: ErrorCode.LOGS_GET_FAILED });
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
