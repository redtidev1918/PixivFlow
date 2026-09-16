/**
 * Business outcome taxonomy for one schedule occurrence.
 *
 * RULES (intent):
 * - "no content to publish" is a NORMAL endpoint, not a system failure.
 * - System failures (pixiv/network/download/processing/delivery) must be kept
 *   disjoint from business no-content states so monitoring and Mini App never
 *   show "internal_error" for an empty but healthy run.
 *
 * This is a DERIVED verdict over the existing terminal cell ledger; it does not
 * change the persisted slot phase machine (pending/running/success/partial/
 * failed remain untouched for ledger compatibility).
 */
export type SlotBusinessStatus =
  | 'success'
  | 'partial_success'
  | 'no_candidate'
  | 'duplicate_only'
  | 'failed';

export interface SlotBusinessCounts {
  total: number;
  submitted: number;
  no_match: number;
  duplicate: number;
  /** Count of no_candidate cells whose terminal reason is duplicate_exhausted. */
  duplicate_exhausted?: number;
  executor_failed: number;
  delivery_failed: number;
}

/** Pure projection: durable cell counts -> one business verdict. No I/O. */
export function classifySlotBusinessStatus(counts: SlotBusinessCounts): SlotBusinessStatus {
  const nonSubmitted = counts.total - counts.submitted;
  const systemFailed = counts.executor_failed > 0 || counts.delivery_failed > 0;
  const allNoContentAsDuplicate =
    counts.duplicate + (counts.duplicate_exhausted ?? 0) === nonSubmitted;

  if (counts.submitted > 0 && nonSubmitted === 0) return 'success';
  if (counts.submitted > 0) return 'partial_success';
  if (nonSubmitted === 0) return 'success'; // defensive: 0 targets / all submitted
  if (!systemFailed) {
    // Every non-submitted cell was a BUSINESS no-content verdict; all of them
    // came from already-delivered candidates => duplicate_only.
    if (allNoContentAsDuplicate) return 'duplicate_only';
    return 'no_candidate';
  }
  return 'failed';
}

/**
 * User-facing (Mini App / notification) copy for a terminal business status.
 * Internal error names (OperationCancelledError, internal_error) never leak.
 */
export function userMessageForSlotBusinessStatus(status: SlotBusinessStatus): string {
  switch (status) {
    case 'success':
      return '任务完成，已发布本轮内容。';
    case 'partial_success':
      return '任务部分完成，部分内容已发布。';
    case 'no_candidate':
      return '本轮没有发现新的可发布作品。任务已正常完成。';
    case 'duplicate_only':
      return '本轮没有发现新的可发布作品。任务已正常完成。';
    case 'failed':
      return '本轮任务遇到系统异常，请稍后重试或检查日志。';
  }
}
