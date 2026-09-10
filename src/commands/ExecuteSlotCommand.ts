/**
 * execute-slot: run ONE canonical occurrence as a disposable batch job.
 *
 * This is the execution plane of the serverless production architecture. The
 * control plane has already decided *which* occurrence is due and hands the runner
 * its canonical identity; the runner never re-derives "what should run today" and
 * never opens a long-lived daemon:
 *
 *   control plane → workflow_dispatch(slot_id, schedule_id, occurrence_at, ...)
 *     → this command runs exactly that slot's targets once
 *     → writes one machine-readable result document
 *     → exits with a status-bearing code
 *
 * Deliberately NOT `pixivflow scheduler`: no cron, no slots, no leases, no local
 * ledger requirement. Duplicate history still comes from the local database when
 * one is present, and the control plane owns cross-runner duplicate state.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandContext, CommandArgs, CommandResult } from './types';
import { resolveSchedules } from '../scheduler/schedules';
import { DEFAULT_SCHEDULE_TIMEOUT_MS } from '../scheduler/Scheduler';
import type { TargetOutcome } from '../scheduler/TargetOutcome';
import {
  EXECUTION_MODES,
  ExecutionMode,
  createSchedulerRuntime,
  runWithTimeout,
} from './scheduler-runtime';
import {
  EXIT_ERROR,
  outcomeToTargetResult,
  summarizeExecution,
  type BatchExecutionResult,
  type BatchOutboxSummary,
  type BatchTargetResult,
} from '../batch/executionResult';


function stringOption(args: CommandArgs, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = args.options[name];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export class ExecuteSlotCommand extends BaseCommand {
  readonly name = 'execute-slot';
  readonly description = 'Execute one canonical occurrence once (batch/CI execution plane)';
  readonly aliases: string[] = ['batch'];
  readonly metadata = {
    category: CommandCategory.DOWNLOAD,
    requiresAuth: true,
    longRunning: false,
  };

  validate(args: CommandArgs) {
    const errors: string[] = [];
    const scheduleId = stringOption(args, 'schedule-id', 'scheduleId');
    if (!scheduleId) errors.push('--schedule-id is required (which schedule to execute)');
    const slotId = stringOption(args, 'slot-id', 'slotId');
    if (!slotId) errors.push('--slot-id is required (canonical occurrence identity)');
    const mode = stringOption(args, 'mode') ?? 'live';
    if (!EXECUTION_MODES.includes(mode as ExecutionMode)) {
      errors.push(`--mode must be one of ${EXECUTION_MODES.join(', ')}`);
    }
    const attempt = stringOption(args, 'attempt');
    if (attempt && (!Number.isInteger(Number(attempt)) || Number(attempt) < 1)) {
      errors.push('--attempt must be a positive integer');
    }
    const timeout = stringOption(args, 'timeout-ms', 'timeoutMs');
    if (timeout && (!Number.isFinite(Number(timeout)) || Number(timeout) <= 0)) {
      errors.push('--timeout-ms must be a positive number');
    }
    return { valid: errors.length === 0, errors };
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const scheduleId = stringOption(args, 'schedule-id', 'scheduleId')!;
    const slotId = stringOption(args, 'slot-id', 'slotId')!;
    const mode = (stringOption(args, 'mode') ?? 'live') as ExecutionMode;
    const attempt = Number(stringOption(args, 'attempt') ?? '1');
    const botId = stringOption(args, 'bot-id', 'botId');
    const occurrenceAtRaw = stringOption(args, 'occurrence-at', 'occurrenceAt');
    const occurrenceAt = occurrenceAtRaw ? Number(occurrenceAtRaw) : undefined;
    const resultFile = stringOption(args, 'result-file', 'resultFile');
    const excludeFile = stringOption(args, 'exclude-work-ids', 'excludeWorkIds');
    const timeoutMs = Number(stringOption(args, 'timeout-ms', 'timeoutMs') ?? DEFAULT_SCHEDULE_TIMEOUT_MS);
    const targetFilter = (stringOption(args, 'targets') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const startedAt = new Date();
    const startedMs = Date.now();
    const outcomes: BatchTargetResult[] = [];
    let runtime: Awaited<ReturnType<typeof createSchedulerRuntime>> | undefined;
    let expectedTargetIds: string[] = [];
    let outbox: BatchOutboxSummary | undefined;
    let fatal: string | undefined;

    try {
      runtime = await createSchedulerRuntime(args.options.config as string | undefined);
      const schedule = resolveSchedules(runtime.config).find((plan) => plan.id === scheduleId);
      if (!schedule) {
        throw new Error(`unknown schedule: ${scheduleId}`);
      }
      if (schedule.enabled === false) {
        throw new Error(`schedule is disabled: ${scheduleId}`);
      }

      // The canonical target list comes from the schedule (and may be narrowed by
      // the dispatcher). It is the expectation set: anything missing from the
      // outcomes is reported as `missing`, never silently dropped.
      const scheduleTargets = schedule.targetIds ?? [];
      expectedTargetIds = targetFilter.length > 0
        ? (scheduleTargets.length > 0
            ? scheduleTargets.filter((id) => targetFilter.includes(id))
            : targetFilter)
        : scheduleTargets;
      if (expectedTargetIds.length === 0) {
        throw new Error(`no targets resolved for schedule ${scheduleId}`);
      }

      context.logger.info('Executing canonical occurrence', {
        slotId,
        scheduleId,
        attempt,
        mode,
        targets: expectedTargetIds,
      });

      // Durable duplicate history: works this bot already handled, fetched by the
      // caller (the batch runner asks the control plane). Without it a disposable
      // runner re-selects work that was delivered weeks ago.
      const excludedWorkIds = excludeFile ? readExcludedWorkIds(excludeFile, context) : undefined;

      await runWithTimeout(
        runtime.runJob(runtime.config, schedule, {
          // Ad-hoc by design: the control plane owns the occurrence ledger now, so
          // this run must not open or resume a local scheduled Slot.
          adhoc: true,
          triggerSource: 'http',
          deliveryMode: mode,
          onTargetOutcome: (targetId: string, outcome: TargetOutcome) => {
            outcomes.push(outcomeToTargetResult(targetId, outcome));
          },
          ...(excludedWorkIds ? { excludedWorkIds } : {}),
        }),
        timeoutMs,
        () => runtime!.cancelActive(`batch timeout after ${timeoutMs}ms`),
        `slot ${slotId}`
      );

      // Bounded drain: deliveries created by this run get one chance to confirm
      // before we report. Rows that cannot finish now stay durable and are
      // resolved by the control plane's reconciliation, never by a blind resend.
      outbox = await runtime.drainOutbox();
    } catch (error) {
      fatal = error instanceof Error ? error.message : String(error);
      context.logger.error('Batch execution failed', { slotId, error: fatal });
    } finally {
      try {
        runtime?.close();
      } catch {
        // Closing must never mask the real failure above.
      }
    }

    const summary = summarizeExecution(outcomes, expectedTargetIds);
    const finishedAt = new Date();
    const result: BatchExecutionResult = {
      slotId,
      scheduleId,
      ...(botId ? { botId } : {}),
      attempt,
      mode,
      ...(occurrenceAt !== undefined && Number.isFinite(occurrenceAt) ? { occurrenceAt } : {}),
      status: fatal ? 'failed' : summary.status,
      exitCode: fatal ? EXIT_ERROR : summary.exitCode,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedMs,
      targets: summary.targets,
      ...(outbox ? { outbox } : {}),
      ...(fatal ? { error: fatal } : {}),
    };

    const serialized = JSON.stringify(result, null, 2);
    if (resultFile) {
      writeFileSync(resultFile, serialized, 'utf8');
      context.logger.info('Wrote batch result', { resultFile });
    } else {
      // stdout is the machine interface when no file is requested; keep it clean
      // (all human logging goes to stderr/the logger).
      process.stdout.write(`${serialized}\n`);
    }

    if (fatal) {
      return this.withExitCode(this.failure(fatal, result), EXIT_ERROR);
    }
    return this.withExitCode(
      this.success(`slot ${slotId}: ${result.status}`, result),
      result.exitCode
    );
  }

  getUsage(): string {
    return `execute-slot

Execute ONE canonical occurrence once and exit. This is the batch/CI execution
plane: the control plane decides which occurrence is due, this command runs it.

Required:
  --schedule-id <id>       Schedule to execute (e.g. bot1-daily)
  --slot-id <id>           Canonical occurrence (e.g. bot1-daily@2026-09-11T1800)

Optional:
  --occurrence-at <ms>     Canonical occurrence instant (epoch ms), for audit
  --attempt <n>            Attempt number, echoed into the result (default 1)
  --bot-id <id>            Bot identity, echoed into the result
  --targets <a,b>          Restrict to these target ids (default: schedule targets)
  --mode live|shadow|dry-run  Downstream publishing mode (default live)
  --result-file <path>     Write the result JSON here
  --timeout-ms <n>         Hard bound for the run (default: schedule timeout)
  --exclude-work-ids <f>   JSON file of works this bot already handled:
                           {"illustration":["id",...],"novel":[...]} (or the control
                           plane's {"works":{...}} response). Durable duplicate
                           history a disposable runner cannot know by itself.

Machine interface: pass --result-file and read that file. Stdout also carries the
process logger's lines, so it is NOT a strict JSON channel.

Exit codes (the exit code IS the execution status):
  0 success    every target was delivered/stored/deduplicated
  2 partial    some targets delivered, some did not (incl. all-no-candidate)
  3 failed     nothing was delivered
  4 uncertain  a send was not confirmed; never auto-retried
  1 error      the process itself could not run the slot

Examples:
  pixivflow execute-slot --schedule-id bot1-daily --slot-id bot1-daily@2026-09-11T1800 \\
    --mode shadow --result-file /tmp/slot-result.json`;
  }
}

/**
 * Read durable duplicate history. Accepts either the bare map or the control
 * plane's envelope, and tolerates a missing/garbled file by logging loudly rather
 * than silently running without history — that would re-post old work.
 */
function readExcludedWorkIds(
  path: string,
  context: CommandContext
): { illustration?: string[]; novel?: string[] } | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const source = (parsed.works && typeof parsed.works === 'object' ? parsed.works : parsed) as Record<
      string,
      unknown
    >;
    const toIds = (value: unknown): string[] | undefined =>
      Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;
    const illustration = toIds(source.illustration);
    const novel = toIds(source.novel);
    if (!illustration && !novel) {
      context.logger.warn('Duplicate-history file had no usable ids', { path });
      return undefined;
    }
    context.logger.info('Loaded durable duplicate history', {
      illustration: illustration?.length ?? 0,
      novel: novel?.length ?? 0,
    });
    return { ...(illustration ? { illustration } : {}), ...(novel ? { novel } : {}) };
  } catch (error) {
    context.logger.warn('Could not read the duplicate-history file; continuing without it', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
