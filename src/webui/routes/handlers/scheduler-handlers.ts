import { Request, Response } from 'express';
import { Database } from '../../../storage/Database';
import { loadConfig, getConfigPath } from '../../../config';
import { logger } from '../../../logger';
import { ErrorCode } from '../../utils/error-codes';

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
