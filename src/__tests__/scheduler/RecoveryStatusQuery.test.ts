import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from '../../storage/Database';
import { queryRecoveryStatus } from '../../scheduler/RecoveryStatusQuery';

function withDb<T>(fn: (db: Database) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'pixivflow-recovery-status-'));
  const db = new Database(join(dir, 'test.db'));
  db.migrate();
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const REQUEST_ID = '7eb50329-20f2-4ea7-b95b-e4676b50d9f1';
const TARGET = 'bot1-illust-botefuku';

function seedRecovery(db: Database, overrides: {
  requestId?: string;
  targetId?: string;
  status?: Parameters<Database['slots']['setCellStatus']>[2];
  terminalReasonCode?: string | null;
} = {}): string {
  const requestId = overrides.requestId ?? REQUEST_ID;
  const targetId = overrides.targetId ?? TARGET;
  db.slots.getOrCreateSlot(`${'bot1-daily'}@recover-${requestId}`, {
    scheduleId: 'bot1-daily',
    targetIds: [targetId],
    manualRequestId: requestId,
    recoveryRequestId: requestId,
    recoveryMode: 'normal',
    triggerSource: 'http',
  });
  db.slots.ensureCell(`${'bot1-daily'}@recover-${requestId}`, targetId, 'illustration');
  if (overrides.status) {
    db.slots.setCellStatus(
      `${'bot1-daily'}@recover-${requestId}`, targetId, overrides.status,
      overrides.terminalReasonCode ?? undefined,
    );
  }
  if (overrides.terminalReasonCode) {
    db.slots.setCellTerminalReason(
      `${'bot1-daily'}@recover-${requestId}`, targetId,
      overrides.terminalReasonCode, overrides.terminalReasonCode,
    );
  }
  return `${'bot1-daily'}@recover-${requestId}`;
}

describe('queryRecoveryStatus (shared by HTTP handler and CLI)', () => {
  it('returns the full correlated view for an admitted recovery', () =>
    withDb((db) => {
      seedRecovery(db, { status: 'delivery_pending' });
      const view = queryRecoveryStatus(db, TARGET, REQUEST_ID);
      expect(view).not.toBeNull();
      expect(view!.requestId).toBe(REQUEST_ID);
      expect(view!.targetId).toBe(TARGET);
      expect(view!.slotId).toContain('recover-');
      expect(view!.scheduleId).toBe('bot1-daily');
      expect(view!.state).toBe('delivery_pending');
      expect(view!.business_state).toBe('recovery_running');
      expect(view!.errorCode).toBeNull();
      expect(view!.message).toContain('扩大搜索范围');
    }));

  it('surfaces the terminal reason code for a failed recovery', () =>
    withDb((db) => {
      seedRecovery(db, { status: 'failed', terminalReasonCode: 'internal_error' });
      const view = queryRecoveryStatus(db, TARGET, REQUEST_ID)!;
      expect(view.state).toBe('failed');
      expect(view.errorCode).toBe('internal_error');
      expect(view.business_state).toBe('recovery_failed');
    }));

  it('maps a submitted cell to success copy that does not claim publication', () =>
    withDb((db) => {
      seedRecovery(db, { status: 'submitted' });
      const view = queryRecoveryStatus(db, TARGET, REQUEST_ID)!;
      expect(view.business_state).toBe('recovery_success');
      expect(view.message).toContain('审核与发布结果请查看接收端');
    }));

  it('returns null for an unknown request (caller decides not-found semantics)', () =>
    withDb((db) => {
      expect(queryRecoveryStatus(db, TARGET, REQUEST_ID)).toBeNull();
    }));

  it('does not match a different target for the same requestId', () =>
    withDb((db) => {
      seedRecovery(db, { status: 'submitted' });
      expect(queryRecoveryStatus(db, 'other-target', REQUEST_ID)).toBeNull();
    }));
});
