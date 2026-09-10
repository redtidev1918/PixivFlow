/**
 * Doctor: cold-start / crash / suspend consistency diagnostics for the
 * reliability subsystem. Read-only by default; --repair applies safe,
 * idempotent convergence actions. Uses only SQLite - no external services.
 */
import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { OutboxWorker } from '../delivery/OutboxWorker';
import { DeliveryDispatcher } from '../delivery/DeliveryDispatcher';
import { migrateLegacyOutbox } from '../delivery/LegacyOutboxMigration';

interface Finding {
  level: 'info' | 'warn' | 'critical';
  code: string;
  message: string;
}

export class DoctorCommand extends BaseCommand {
  readonly name = 'doctor';
  readonly description = 'Diagnose and (with --repair) converge slots, deliveries and outbox';
  readonly metadata = { category: CommandCategory.MONITORING, requiresAuth: true, longRunning: false };
  readonly requiresToken = false;

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const repair = Boolean(args.options.repair);
    const dbPath = context.config.storage?.databasePath ?? './data/pixiv-downloader.db';
    const findings: Finding[] = [];
    const fixed: string[] = [];

    const db = new Database(dbPath);
    try {
      db.migrate();
      findings.push({ level: 'info', code: 'schema', message: 'Schema migrations applied / current' });

      const mig = migrateLegacyOutbox(db);
      if (mig.imported || mig.delivered || mig.failed) {
        findings.push({
          level: mig.failed ? 'warn' : 'info',
          code: 'legacy-outbox',
          message: 'legacy manifests scanned=' + mig.scanned + ' imported=' + mig.imported + ' delivered=' + mig.delivered + ' failed=' + mig.failed,
        });
      }

      const deliveries = db.deliveries.countByStatus();
      const pendingDelivery = deliveries.pending ?? 0;
      if (pendingDelivery > 0) {
        findings.push({ level: 'warn', code: 'deliveries-pending', message: pendingDelivery + ' delivery intent(s) not yet confirmed by the downstream' });
      }
      if (deliveries.failed) {
        findings.push({ level: 'warn', code: 'deliveries-failed', message: deliveries.failed + ' delivery intent(s) marked failed' });
      }

      const counts = db.outbox.counts();
      if (counts.dead > 0) {
        findings.push({ level: 'critical', code: 'outbox-dead', message: counts.dead + ' outbox row(s) dead after exhausting retries (manual reconciliation required)' });
      }
      const stale = db.outbox.staleProcessing();
      if (stale.length > 0) {
        findings.push({ level: repair ? 'info' : 'warn', code: 'outbox-stale-processing', message: stale.length + ' row(s) stuck in processing from a crashed/killed run' });
        if (repair) {
          for (const row of stale) db.outbox.release(row.id);
          fixed.push('released ' + stale.length + ' stale processing row(s) back for retry');
        }
      }

      const staleLeases = db.slots.slotsWithStaleLease();
      if (staleLeases.length > 0) {
        findings.push({ level: repair ? 'info' : 'warn', code: 'slot-stale-lease', message: staleLeases.length + ' slot(s) carry an expired lease from a crashed worker: ' + staleLeases.slice(0, 5).join(', ') });
        if (repair) {
          for (const id of staleLeases) db.slots.releaseSlotLease(id, 'doctor-repair');
          fixed.push('released ' + staleLeases.length + ' stale slot lease(s)');
        }
      }

      let unfinishedCells = 0;
      for (const slot of db.slots.getRecentSlots(50)) {
        if (slot.status === 'running' || slot.status === 'failed') {
          for (const cell of db.slots.getCells(slot.id)) {
            if (cell.status === 'delivery_pending') unfinishedCells++;
          }
        }
      }
      if (unfinishedCells > 0) {
        findings.push({ level: 'info', code: 'cells-delivery-pending', message: unfinishedCells + ' cell(s) waiting on durable delivery confirmation (outbox converges them)' });
      }

      // Persisted 429 gate state (no client/network call; SQLite only).
      const nowMs = Date.now();
      for (const row of db.rateLimitState.getAll()) {
        const s = row.state;
        if (s.circuitState === 'open' && s.cooldownUntil > nowMs) {
          const remainingSec = Math.ceil((s.cooldownUntil - nowMs) / 1000);
          findings.push({
            level: 'warn',
            code: 'rate-limit-open',
            message: row.scope + ' circuit OPEN: pixiv 429 cooldown active for ~' + remainingSec + 's (penalty level ' + s.penaltyLevel + ')',
          });
        } else if (s.cooldownUntil > nowMs) {
          findings.push({
            level: 'info',
            code: 'rate-limit-cooldown',
            message: row.scope + ' cooldown ~' + Math.ceil((s.cooldownUntil - nowMs) / 1000) + 's remaining (penalty level ' + s.penaltyLevel + ')',
          });
        } else if (s.penaltyLevel > 0) {
          findings.push({ level: 'info', code: 'rate-limit-decaying', message: row.scope + ' healthy, penalty level ' + s.penaltyLevel + ' decaying (' + s.consecutiveSuccesses + ' successes since last 429)' });
        }
      }

      if (repair) {
        const worker = new OutboxWorker(db, new DeliveryDispatcher(context.config.delivery));
        const res = await worker.drainOnce(20);
        if (res.done > 0) fixed.push('outbox pump delivered/confirmed ' + res.done + ' row(s)');
        if (res.dead > 0) fixed.push('outbox pump marked ' + res.dead + ' row(s) dead');
      }

      const critical = findings.filter((f) => f.level === 'critical');
      const warns = findings.filter((f) => f.level === 'warn');
      for (const f of findings) {
        const icon = f.level === 'critical' ? 'CRIT' : f.level === 'warn' ? 'WARN' : 'OK';
        context.logger.info('[' + icon + '] [' + f.code + '] ' + f.message);
      }
      for (const x of fixed) context.logger.info('repaired: ' + x);

      return this.success(
        critical.length
          ? 'doctor found ' + critical.length + ' critical, ' + warns.length + ' warning(s)'
          : warns.length
            ? 'doctor found ' + warns.length + ' warning(s)'
            : 'doctor: all reliability state healthy',
        { findings, repaired: fixed, deliveryCounts: deliveries, outboxCounts: counts }
      );
    } finally {
      db.close();
    }
  }
}