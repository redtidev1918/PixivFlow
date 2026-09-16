import { BaseRepository } from './BaseRepository';
import { SystemErrorInput, SystemErrorRow } from '../../observability/types';

export class SystemErrorRepository extends BaseRepository {
  record(input: SystemErrorInput): void {
    this.db
      .prepare(
        `INSERT INTO system_errors
           (service, component, bot_id, schedule_id, slot_id, pixiv_id, stage, error_type, message, http_status, retryable, trace_id)
         VALUES
           (@service, @component, @botId, @scheduleId, @slotId, @pixivId, @stage, @errorType, @message, @httpStatus, @retryable, @traceId)`
      )
      .run({
        service: input.service ?? 'pixivflow',
        component: input.component ?? null,
        botId: input.bot_id ?? null,
        scheduleId: input.schedule_id ?? null,
        slotId: input.slot_id ?? null,
        pixivId: input.pixiv_id ?? null,
        stage: input.stage ?? null,
        errorType: input.error_type ?? 'INTERNAL_ERROR',
        message: input.message.slice(0, 5000),
        httpStatus: input.http_status ?? null,
        retryable: input.retryable ? 1 : 0,
        traceId: input.trace_id ?? null,
      });
  }

  list(opts: {
    limit?: number;
    errorType?: string;
    botId?: string;
    stage?: string;
    resolved?: boolean;
    from?: string;
    to?: string;
  } = {}): SystemErrorRow[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.errorType) { where.push('error_type = ?'); params.push(opts.errorType); }
    if (opts.botId) { where.push('bot_id = ?'); params.push(opts.botId); }
    if (opts.stage) { where.push('stage = ?'); params.push(opts.stage); }
    if (typeof opts.resolved === 'boolean') {
      where.push(opts.resolved ? 'resolved_at IS NOT NULL' : 'resolved_at IS NULL');
    }
    if (opts.from) { where.push('created_at >= ?'); params.push(opts.from); }
    if (opts.to) { where.push('created_at <= ?'); params.push(opts.to); }
    const limit = Math.max(1, Math.min(Number(opts.limit) || 50, 500));
    const sql = `SELECT * FROM system_errors${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`;
    return (this.db.prepare(sql).all(...params) as any[]).map(toRow);
  }

  markResolved(id: number): { changes: number } {
    const info = this.db.prepare(`UPDATE system_errors SET resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND resolved_at IS NULL`).run(id);
    return { changes: Number(info.changes ?? 0) };
  }

  countSince(botId: string | null, hours: number): number {
    const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
    const cutoff = new Date(cutoffMs).toISOString().replace('T', ' ').slice(0, 19);
    if (botId) {
      const row = this.db.prepare(`SELECT COUNT(*) AS n FROM system_errors WHERE bot_id = ? AND created_at >= ?`).get(botId, cutoff) as { n: number };
      return Number(row.n ?? 0);
    }
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM system_errors WHERE created_at >= ?`).get(cutoff) as { n: number };
    return Number(row.n ?? 0);
  }
}

function toRow(r: any): SystemErrorRow {
  return {
    id: Number(r.id),
    service: r.service,
    component: r.component ?? undefined,
    bot_id: r.bot_id ?? undefined,
    schedule_id: r.schedule_id ?? undefined,
    slot_id: r.slot_id ?? undefined,
    pixiv_id: r.pixiv_id ?? undefined,
    stage: r.stage ?? undefined,
    error_type: r.error_type,
    message: r.message,
    http_status: r.http_status ?? null,
    retryable: Boolean(r.retryable),
    trace_id: r.trace_id ?? undefined,
    created_at: r.created_at,
    resolved_at: r.resolved_at,
  };
}
