import type { SlotItemRecord } from '../storage/repositories/SlotRepository';

/**
 * Business outcome for one manual recovery request (「放宽条件重试」).
 *
 * Deliberately NOT the raw execution cell status: a recovery that found only
 * already-published works is a NORMAL end (`recovery_duplicate_only`), never an
 * `internal_error`. Callers (ScheduleTriggerServer / Mini App) get the
 * user-facing `message` and admin-facing `business_state` together so the UI
 * never has to translate internal terms.
 */
export type RecoveryOutcomeState =
  | 'recovery_pending'
  | 'recovery_running'
  | 'recovery_success'
  | 'recovery_no_candidate'
  | 'recovery_duplicate_only'
  | 'recovery_failed';

const USER_MESSAGES: Record<RecoveryOutcomeState, string> = {
  recovery_pending: '正在等待恢复任务...',
  recovery_running: '正在尝试扩大搜索范围...',
  recovery_success: '恢复成功，已找到并发布新作品。',
  recovery_no_candidate: '扩大搜索范围后，仍未找到符合条件的新作品。\n任务已正常结束。',
  recovery_duplicate_only: '扩大搜索范围后，找到的作品均已发布过。\n没有新的内容可发布。',
  recovery_failed: '恢复任务执行失败。\n请查看日志或稍后重试。',
};

export function recoveryUserMessage(state: RecoveryOutcomeState): string {
  return USER_MESSAGES[state];
}

/**
 * Map one durable recovery cell to a recovery business outcome.
 *
 * - terminal `submitted` (+ workId) → success
 * - terminal `no_candidate` with terminal reason `duplicate_exhausted` →
 *   duplicate_only
 * - terminal `no_candidate` otherwise → no_candidate
 * - terminal `failed` → failed
 * - non-terminal (`pending`/`selected`/`running`/`delivery_pending`) → running/pending
 */
export function recoveryOutcomeFor(cell: SlotItemRecord | null): RecoveryOutcomeState {
  if (!cell) return 'recovery_pending';
  if (cell.status === 'submitted') return 'recovery_success';
  if (cell.status === 'no_candidate') {
    return cell.terminalReasonCode === 'duplicate_exhausted'
      ? 'recovery_duplicate_only'
      : 'recovery_no_candidate';
  }
  if (cell.status === 'duplicate') return 'recovery_duplicate_only';
  if (cell.status === 'failed') return 'recovery_failed';
  if (['pending', 'selected', 'artifact_ready', 'delivery_pending'].includes(cell.status)) return 'recovery_running';
  return 'recovery_pending';
}
