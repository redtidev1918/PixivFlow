/**
 * Strongly-typed business result of running ONE target in a (scheduled) slot.
 *
 * This replaces the old implicit protocol "handler.handle() did not throw =>
 * submitted". Undefined / a 2xx HTTP response / a caught-and-swallowed error
 * must NEVER be inferred as a successful submission. Every target produces one
 * of these explicit outcomes; the Slot ledger maps it to a cell transition.
 */
export type WorkType = 'illustration' | 'novel';

export type TargetOutcome =
  | {
      kind: 'submitted';
      workId: string;
      workType: WorkType;
      /** Durable delivery row that recorded the downstream ACK. */
      deliveryId?: string;
    }
  /**
   * The work was processed locally but there is no downstream delivery target
   * (persistent storageMode / pure-download config). For a scheduled slot this
   * is a business success for that target, but it is NEVER confused with a
   * confirmed remote submission.
   */
  | { kind: 'stored'; workId: string; workType: WorkType }
  /**
   * A delivery intent + outbox item were created durably, but the downstream
   * ACK has not been confirmed yet. The OutboxWorker drives this to
   * 'submitted'; a crash/restart resumes it. delivery_pending != submitted.
   */
  | { kind: 'delivery_pending'; workId: string; workType: WorkType; deliveryId: string }
  /** No work matched after the full candidate pipeline (filter/topic/lookback). */
  | { kind: 'no_candidate'; reason: string }
  /**
   * Downstream proved this work was already delivered by a DIFFERENT intent
   * (historical drift). This is a terminal business duplicate, not a new
   * submission. Produced only by the explicit reconciliation path.
   */
  | { kind: 'duplicate'; workId: string; reason: string }
  /** The target failed. retryable=true => a later trigger/outbox may resume. */
  | { kind: 'failed'; retryable: boolean; error: string };

/** Terminal outcomes settle the cell; others leave it recoverable. */
export function isTerminalOutcome(outcome: TargetOutcome): boolean {
  return (
    outcome.kind === 'submitted' ||
    outcome.kind === 'stored' ||
    outcome.kind === 'no_candidate' ||
    outcome.kind === 'duplicate' ||
    (outcome.kind === 'failed' && !outcome.retryable)
  );
}

export function outcomeSummary(outcome: TargetOutcome): string {
  switch (outcome.kind) {
    case 'submitted':
    case 'stored':
      return outcome.kind;
    case 'delivery_pending':
      return 'delivery_pending';
    case 'no_candidate':
      return `no_candidate: ${outcome.reason}`;
    case 'duplicate':
      return `duplicate: ${outcome.reason}`;
    case 'failed':
      return `failed(${outcome.retryable ? 'retryable' : 'permanent'}): ${outcome.error}`;
  }
}
