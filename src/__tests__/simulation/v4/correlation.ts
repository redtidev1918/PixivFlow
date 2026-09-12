/**
 * Correlation identity for the V4 simulation.
 *
 * A failure must be answerable in one line: which slot, which cell, which work,
 * which delivery, which review, and in what state. The harness carries the whole
 * chain as a first-class object instead of making the reader grep three logs.
 */

export interface CorrelationIdentity {
  scheduleId: string;
  slotId?: string;
  targetId?: string;
  workId?: string;
  deliveryId?: string;
  idempotencyKey?: string;
  outboxId?: string;
  reviewId?: number | string;
}

export interface LedgerSnapshot {
  slots: Array<Record<string, unknown>>;
  slotItems: Array<Record<string, unknown>>;
  downloads: Array<Record<string, unknown>>;
  deliveries: Array<Record<string, unknown>>;
  outbox: Array<Record<string, unknown>>;
}

export interface ObservabilitySnapshot {
  identity: CorrelationIdentity;
  pixivFlow: LedgerSnapshot;
  telepost?: { reviews: Array<Record<string, unknown>> };
  telegram?: { publishes: Array<Record<string, unknown>> };
}

/** Renders the whole chain, so a failed assertion is self-explanatory. */
export function describeState(label: string, snapshot: ObservabilitySnapshot): string {
  const { identity, pixivFlow, telepost, telegram } = snapshot;
  const lines: string[] = [
    `── ${label} ─────────────────────────────────────────────`,
    `schedule      : ${identity.scheduleId}`,
    `slot          : ${identity.slotId ?? '(unresolved)'}`,
    `target        : ${identity.targetId ?? '(none)'}`,
    `work          : ${identity.workId ?? '(none)'}`,
    `deliveryId    : ${identity.deliveryId ?? '(none)'}`,
    `idempotencyKey: ${identity.idempotencyKey ?? '(none)'}`,
    `reviewId      : ${identity.reviewId ?? '(none)'}`,
    '',
    `slots         : ${formatRows(pixivFlow.slots, ['id', 'status'])}`,
    `slot items    : ${formatRows(pixivFlow.slotItems, ['target_id', 'work_id', 'status'])}`,
    `downloads     : ${formatRows(pixivFlow.downloads, ['pixiv_id', 'type', 'file_path'])}`,
    `deliveries    : ${formatRows(pixivFlow.deliveries, ['id', 'status', 'idempotency_key']) }`,
    `outbox        : ${formatRows(pixivFlow.outbox, ['id', 'kind', 'status', 'attempts']) }`,
  ];
  if (telepost) lines.push(`reviews       : ${formatRows(telepost.reviews, ['id', 'status', 'media_count'])}`);
  if (telegram) lines.push(`tg publishes  : ${formatRows(telegram.publishes, ['method', 'chatId', 'mediaIds'])}`);
  return lines.join('\n');
}

function formatRows(rows: Array<Record<string, unknown>>, keys: string[]): string {
  if (!rows || rows.length === 0) return '(empty)';
  return '\n    ' + rows
    .map((row) => keys.map((key) => `${key}=${JSON.stringify(row[key])}`).join(' '))
    .join('\n    ');
}
