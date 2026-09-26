import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import type { DeliveryTargetConfig } from '../config';
import { resolveTargetCapabilities } from '../delivery/capabilities';
import {
  configuredGateway,
  configuredGateways,
  connectionStatusLabel,
  redactedEndpoint,
} from '../delivery/gatewayRoutes';
import { interpolate, WebhookDelivery } from '../delivery/WebhookDelivery';
import { getConfigPath, loadConfig } from '../config';
import { redactError } from '../utils/redact';

/** Reachability verdicts this command may persist (never a health claim). */
type ProbeStatus = 'connected' | 'unreachable' | 'waiting' | 'unknown';

function openDb(context: CommandContext): Database {
  const db = new Database(context.config.storage?.databasePath ?? './data/pixiv-downloader.db');
  db.migrate();
  return db;
}

function integerOption(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

/**
 * Messaging Gateway plane, from the operator's terminal.
 *
 * This command is a GATEWAY CLIENT tool: it lists the delivery routes the
 * config declares, shows the delivery ledger per route and probes whether an
 * endpoint answers. It deliberately does not pair anything — a QR scan or a bot
 * login happens inside the external gateway process, never here — and it never
 * prints a credential (the CLI reloads the config to prove `${ENV}` references
 * resolve locally without leaking their values).
 */
export class GatewayCommand extends BaseCommand {
  readonly name = 'gateway';
  readonly description = 'List configured messaging gateways, their delivery state and reachability';
  readonly requiresToken = false;
  readonly aliases = ['gateways'];
  readonly metadata = {
    category: CommandCategory.MONITORING,
    requiresAuth: true,
    longRunning: false,
  };

  getUsage(): string {
    return [
      'pixivflow gateway list [--json]',
      'pixivflow gateway status <name> [--limit 25] [--json]',
      'pixivflow gateway test <name> [--json]',
    ].join('\n');
  }

  validate(args: CommandArgs): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const action = args.positional[0] ?? 'list';
    if (!['list', 'status', 'test'].includes(action)) {
      errors.push(`Unknown gateway action: ${action}. Expected list, status or test.`);
    }
    if ((action === 'status' || action === 'test') && !args.positional[1]) {
      errors.push(`gateway ${action} requires a gateway name.`);
    }
    return { valid: errors.length === 0, errors };
  }

  constructor(
    /** Injectable for tests; production always uses the real probe. */
    private readonly probe: (
      target: DeliveryTargetConfig,
      timeoutMs: number
    ) => Promise<ProbeOutcome> = probeGateway
  ) {
    super();
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const action = args.positional[0] ?? 'list';
    const name = args.positional[1];
    switch (action) {
      case 'status':
        return this.status(context, name, args);
      case 'test':
        return this.test(context, name, args);
      case 'list':
      default:
        return this.list(context, args);
    }
  }

  private async list(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const routes = configuredGateways(context.config);
    if (routes.length === 0) {
      return this.success(
        'No delivery targets are configured (delivery.targets is empty); nothing will be delivered.',
        { gateways: [] }
      );
    }

    // Reloading through the ordinary loader is the only way to prove the
    // config still resolves; no value is ever printed.
    let configReloadWarning: string | null = null;
    try {
      loadConfig(getConfigPath());
    } catch (error) {
      configReloadWarning = 'the config did not reload cleanly; run `pixivflow config validate`';
      void error;
    }

    const db = openDb(context);
    try {
      const connections = new Map(db.gatewayConnections.list().map((row) => [row.name, row]));
      const gateways = routes.map((route) => {
        const connection = connections.get(route.name);
        const counts = db.deliveries.countByStatusForTarget(route.name);
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        return {
          name: route.name,
          type: route.type,
          endpoint: redactedEndpoint(route.target),
          enabled: route.enabled,
          connectionStatus: connection?.status ?? 'unknown',
          connectionStatusLabel: connectionStatusLabel(connection?.status ?? 'unknown'),
          connectionUpdatedAt: connection?.updatedAt ?? null,
          deliveryCounts: counts,
          deliveries: total,
          capabilities: resolveTargetCapabilities(route.target),
        };
      });
      if (args.options.json === true) {
        return this.success(undefined, { gateways, configReloadWarning });
      }
      const lines = [
        [
          'NAME'.padEnd(20),
          'TYPE'.padEnd(14),
          'ENABLED'.padEnd(8),
          'CONNECTION'.padEnd(20),
          'DELIVERIES',
          'ENDPOINT',
        ].join(' '),
      ];
      for (const gateway of gateways) {
        lines.push(
          [
            gateway.name.padEnd(20),
            gateway.type.padEnd(14),
            String(gateway.enabled).padEnd(8),
            gateway.connectionStatusLabel.padEnd(20),
            String(gateway.deliveries),
            gateway.endpoint ?? '-',
          ].join(' ')
        );
      }
      lines.push('');
      lines.push(`${gateways.length} gateway route(s); delivery ledger counts are per route.`);
      if (gateways.every((gateway) => gateway.connectionStatus === 'unknown')) {
        lines.push('No gateway has been probed yet; run `pixivflow gateway test <name>`.');
      }
      if (configReloadWarning) lines.push(`warning: ${configReloadWarning}`);
      return this.success(lines.join('\n'), { gateways, configReloadWarning });
    } finally {
      db.close();
    }
  }

  private async status(
    context: CommandContext,
    name: string | undefined,
    args: CommandArgs
  ): Promise<CommandResult> {
    const route = name ? configuredGateway(context.config, name) : null;
    if (!route) {
      return this.failure(
        `Gateway route is not configured: ${name ?? ''}. Run \`pixivflow gateway list\`.`
      );
    }
    const limit = integerOption(args.options.limit, 25, 1, 200);
    const db = openDb(context);
    try {
      const connection = db.gatewayConnections.getByName(route.name);
      const counts = db.deliveries.countByStatusForTarget(route.name);
      const recent = db.deliveries.listRecentByTarget(route.name, { limit });
      const outboxRows = db.outbox.listForDeliveryIds(recent.map((row) => row.id));
      const history = recent.map((row) => {
        const outbox = outboxRows.get(row.id);
        return {
          id: row.id,
          workType: row.workType,
          pixivId: row.pixivId,
          status: row.status,
          attempts: row.attempts,
          lastError: row.lastError,
          slotId: row.slotId,
          targetId: row.targetId,
          outboxStatus: outbox?.status ?? null,
          outboxAttempts: outbox?.attempts ?? null,
          nextAttemptAt: outbox?.nextAttemptAt ?? null,
          updatedAt: row.updatedAt,
          deliveredAt: row.deliveredAt,
        };
      });
      const data = {
        name: route.name,
        type: route.type,
        enabled: route.enabled,
        endpoint: redactedEndpoint(route.target),
        connectionStatus: connection?.status ?? 'unknown',
        connectionStatusLabel: connectionStatusLabel(connection?.status ?? 'unknown'),
        connectionUpdatedAt: connection?.updatedAt ?? null,
        capabilities: resolveTargetCapabilities(route.target),
        deliveryCounts: counts,
        history,
      };
      if (args.options.json === true) return this.success(undefined, data);

      const lines = [
        `gateway ${route.name} (${route.type})${route.enabled ? '' : ' [not enabled by any download target]'}`,
        `  endpoint:   ${data.endpoint ?? '-'}`,
        `  connection: ${data.connectionStatusLabel}` +
          (connection?.updatedAt ? ` (observed ${connection.updatedAt})` : ''),
        `  delivered:  ${counts.delivered ?? 0}  failed: ${counts.failed ?? 0}  ` +
          `pending: ${counts.pending ?? 0}  duplicate: ${counts.duplicate ?? 0}`,
        '',
        'RECENT'.padEnd(10),
        'WORK'.padEnd(24),
        'OUTBOX'.padEnd(12),
        'ATTEMPTS'.padEnd(9),
        'ERROR',
      ].join('\n');
      const rows = history.map((row) =>
        [
          row.status.padEnd(10),
          `${row.workType}:${row.pixivId}`.padEnd(24),
          (row.outboxStatus ?? '-').padEnd(12),
          `${row.attempts}${row.outboxAttempts !== null ? `/${row.outboxAttempts}` : ''}`.padEnd(9),
          row.lastError ?? '',
        ].join(' ')
      );
      const body = [lines, ...rows].join('\n');
      return this.success(
        rows.length > 0 ? body : `${body}\n(no deliveries recorded for this route yet)`,
        data
      );
    } finally {
      db.close();
    }
  }

  /**
   * Probe an endpoint and persist the observation.
   *
   * The verdict is deliberately weak: for a generic gateway "the endpoint
   * answered" is the strongest thing that can be proven without sending a real
   * delivery, so an HTTP 404/405/401 is recorded as `connected` (something is
   * listening) with the code in the note — never as a delivery success.
   */
  private async test(
    context: CommandContext,
    name: string | undefined,
    args: CommandArgs
  ): Promise<CommandResult> {
    const route = name ? configuredGateway(context.config, name) : null;
    if (!route) {
      return this.failure(
        `Gateway route is not configured: ${name ?? ''}. Run \`pixivflow gateway list\`.`
      );
    }
    const outcome = await this.probe(route.target, 5_000);
    const metadata: Record<string, unknown> = {
      probe: outcome.probe,
      reachable: outcome.reachable,
      status: outcome.status,
      note: outcome.note,
      probedAt: new Date().toISOString(),
    };
    const db = openDb(context);
    try {
      // One write: the row is a pointer + the last observation, and the
      // endpoint stored here is already redacted.
      db.gatewayConnections.upsert({
        name: route.name,
        type: route.type,
        endpoint: redactedEndpoint(route.target),
        status: outcome.status,
        metadata,
      });
    } finally {
      db.close();
    }

    const data = {
      name: route.name,
      type: route.type,
      endpoint: redactedEndpoint(route.target),
      connectionStatus: outcome.status,
      connectionStatusLabel: connectionStatusLabel(outcome.status),
      reachable: outcome.reachable,
      probeStatus: outcome.status,
      httpStatus: outcome.httpStatus,
      error: outcome.reachable ? null : outcome.error,
      note: outcome.note,
    };
    if (args.options.json === true) return this.success(undefined, data);

    const lines = [
      `gateway ${route.name} (${route.type})`,
      `  endpoint:   ${data.endpoint ?? '-'}`,
      `  probe:      ${outcome.probe}`,
      `  reachable:  ${outcome.reachable}` +
        (outcome.httpStatus !== undefined ? ` (HTTP ${outcome.httpStatus})` : ''),
    ];
    if (!outcome.reachable) lines.push(`  error:      ${outcome.error ?? 'unknown error'}`);
    lines.push(`  verdict:    ${data.connectionStatusLabel}`);
    lines.push(`  note:       ${outcome.note}`);
    return this.success(lines.join('\n'), data);
  }
}

interface ProbeOutcome {
  probe: 'http-readiness' | 'http-reachability' | 'none';
  reachable: boolean;
  status: ProbeStatus;
  httpStatus?: number;
  error?: string;
  note: string;
}

/**
 * Probe one route without sending a delivery.
 *
 * Three cases, in order of strength:
 *  - `httpMultipart` declares a readiness contract, so it is honoured literally;
 *  - `webhook` has none, so only reachability is proven (any HTTP answer counts);
 *  - `telegram` (media never leaves Telegram) cannot be probed from here at all,
 *    so the command reports `unknown` instead of inventing a verdict.
 */
async function probeGateway(target: DeliveryTargetConfig, timeoutMs: number): Promise<ProbeOutcome> {
  if (target.type === 'httpMultipart') {
    const readinessUrl = target.readinessUrl?.trim();
    if (!readinessUrl) {
      return {
        probe: 'none',
        reachable: false,
        status: 'unknown',
        note: 'this route declares no readinessUrl; delivery health is only visible through real deliveries',
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const url = interpolate(readinessUrl);
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      await response.text().catch(() => '');
      return response.ok
        ? {
            probe: 'http-readiness',
            reachable: true,
            status: 'connected',
            httpStatus: response.status,
            note: 'declared readiness endpoint answered 2xx',
          }
        : {
            probe: 'http-readiness',
            reachable: false,
            status: 'unreachable',
            httpStatus: response.status,
            error: `readiness probe returned HTTP ${response.status}`,
            note: 'declared readiness endpoint did not answer 2xx',
          };
    } catch (error) {
      return {
        probe: 'http-readiness',
        reachable: false,
        status: 'unreachable',
        error: redactedMessage(error),
        note: 'declared readiness endpoint could not be reached from here',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  if (target.type === 'webhook') {
    const probe = await new WebhookDelivery(target).probeReachability(timeoutMs);
    if (probe.reachable) {
      return {
        probe: 'http-reachability',
        reachable: true,
        status: 'connected',
        httpStatus: probe.status,
        note:
          'the endpoint answered HTTP; a generic gateway declares no health contract, ' +
          'so any answer (including 404/405) still disproves "nothing is listening"',
      };
    }
    return {
      probe: 'http-reachability',
      reachable: false,
      status: 'unreachable',
      error: probe.error,
      note: 'the endpoint did not answer at all (DNS, TLS, connection or timeout)',
    };
  }

  return {
    probe: 'none',
    reachable: false,
    status: 'unknown',
    note: `${target.type} routes are not probed from PixivFlow; run the probe inside the gateway`,
  };
}

function redactedMessage(error: unknown): string {
  // The delivery plane's own scrubber, so a URL query string inside a fetch
  // error can never surface a token in the CLI output or in the stored note.
  return redactError(error);
}
