/**
 * `pixivflow diagnose egress` — minimal Pixiv data-plane egress probe.
 *
 * Reachability is not suitability: a datacenter egress can pass OAuth and still be
 * rate-limit-starved on the production search workload (2026-09-11, GitHub-hosted
 * runners). This command answers, with a handful of tiny requests, three INDEPENDENT
 * questions about the network it runs on:
 *
 *   1. OAuth   oauth.secure.pixiv.net  — one real refresh-token exchange
 *   2. App API app-api.pixiv.net       — 1 small fixed request, status + Retry-After
 *   3. Media   i.pximg.net             — 64 KiB Range request with the app Referer
 *
 * It never runs the business workload (no 12 tags / 100 samples / pagination), so it
 * cannot by itself drive the account into a penalty. Output is a findings list plus a
 * uniform verdict (PASS / DEGRADED / FAIL) suitable for a provider-qualification matrix.
 *
 * Exit codes: 0 = no findings above warn, 1 = warn (degraded evidence), 2 = critical
 * (a data plane is unusable from this egress).
 *
 * The OAuth probe performs ONE real token refresh. PixivAuth persists a rotated refresh
 * token (database + unified storage + config), which is the desired durable behaviour —
 * run this probe only when no production execution holds the credential, exactly like
 * `account rotate`.
 */

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { PixivAuth, isAuthReadOnly } from '../auth/PixivAuth';
import { AuthenticationError } from '../utils/errors';
import type { NetworkConfig } from '../config/types';

type FindingLevel = 'ok' | 'warn' | 'critical' | 'skipped';

interface Finding {
  level: FindingLevel;
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export type EgressVerdict = 'PASS' | 'DEGRADED' | 'FAIL' | 'INCOMPLETE';

export interface EgressProbeSummary {
  provider: string;
  region: string;
  network: string;
  oauth: { status: string; latencyMs: number | null; refreshed: boolean };
  appApi: { status: number | null; ttfbMs: number | null; durationMs: number | null; rateLimited: boolean; retryAfterMs: number | null };
  media: { status: number | null; ttfbMs: number | null; bytes64kDurationMs: number | null; timedOut: boolean };
  verdict: EgressVerdict;
  incomplete: boolean;
  findings: Finding[];
}

/** The documented placeholder rules: empty, the template string, or implausibly short. */
function isPlaceholderToken(token: unknown): boolean {
  const value = typeof token === 'string' ? token.trim() : '';
  return value.length === 0 || value === 'YOUR_REFRESH_TOKEN' || value.length < 10;
}

const PROBE_TIMEOUT_MS = 15_000;

/** this-safe fetch wrapper (Cloudflare/undici reject `this.fetch(...)`). */
const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export class DiagnoseEgressCommand extends BaseCommand {
  readonly name = 'diagnose';
  readonly description = 'Minimal Pixiv data-plane egress probe (usage: diagnose egress)';
  readonly aliases = ['diag'];
  readonly requiresToken = false;
  readonly metadata = {
    category: CommandCategory.MONITORING,
    requiresAuth: false,
    longRunning: false,
    examples: ['pixivflow diagnose egress', 'pixivflow diagnose egress --json', 'pixivflow diagnose egress --illust-id 12345'],
    relatedCommands: ['health', 'doctor'],
  };

  constructor(
    /** Injectable for tests; defaults to a this-safe global fetch. */
    private readonly deps: { fetchImpl?: typeof fetch; provider?: string; region?: string } = {}
  ) {
    super();
  }

  getUsage(): string {
    return [
      'diagnose egress [--json] [--illust-id <id>] [--provider <name>] [--region <code>]',
      '  Minimal Pixiv egress probe: OAuth refresh, one small App API request,',
      '  one 64 KiB media Range request. Exit 0/1/2 = ok/warn/critical.',
    ].join('\n');
  }

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const sub = args.positional[0] || 'egress';
    if (sub !== 'egress') {
      return this.failure(`Unknown diagnose target: ${sub}. Try: pixivflow diagnose egress`);
    }

    const findings: Finding[] = [];
    const fetchImpl = this.deps.fetchImpl ?? defaultFetch;
    const provider = String(args.options.provider ?? this.deps.provider ?? 'local');
    const region = String(args.options.region ?? this.deps.region ?? 'unknown');
    const illustId = String(args.options['illust-id'] ?? '92421724');

    const proxy = context.config?.network?.proxy;
    // --no-proxy tests the DIRECT egress even when a proxy is configured: a
    // qualification matrix wants both paths, and a stale proxy setting must not
    // mask what the network itself can do.
    const noProxy = args.options['no-proxy'] === true;
    const useProxy = !noProxy && !!(proxy?.enabled && proxy.host && proxy.port);
    // The OAuth probe builds its own client from config.network — hand it the same
    // overridden view so all three probes test the SAME egress path.
    const networkForAuth: NetworkConfig = noProxy
      ? { ...(context.config?.network ?? {}), proxy: undefined }
      : context.config?.network ?? ({} as NetworkConfig);

    // --- 1. General reachability (pixiv.net answers 403 to probes; that IS a pass) ---
    await this.probeReachable(fetchImpl, useProxy ? proxy : undefined, findings);

    // --- 2. OAuth: one real refresh exchange ---
    let accessToken: string | null = null;
    let db: Database | null = null;
    const refreshToken = context.config?.pixiv?.refreshToken;
    if (isPlaceholderToken(refreshToken)) {
      findings.push({
        level: 'skipped',
        code: 'oauth-skipped',
        message: 'no usable refresh token in config; OAuth data plane not tested',
      });
    } else {
      try {
        db = new Database(context.config.storage?.databasePath ?? './data/pixiv-downloader.db');
        db.migrate();
        const auth = new PixivAuth(context.config.pixiv, networkForAuth, db, context.configPath);
        const started = performance.now();
        accessToken = isAuthReadOnly()
          ? await auth.getAccessToken() // readonly: cache only; the token endpoint is NOT tested
          : await auth.refreshAccessTokenForClient();
        const latencyMs = Math.round(performance.now() - started);
        const fromCache = isAuthReadOnly();
        findings.push({
          level: 'ok',
          code: fromCache ? 'oauth-cache-ok' : 'oauth-refresh-ok',
          message: fromCache
            ? `OAuth access token served from cache in ${latencyMs}ms (PIXIV_AUTH_READONLY: the token endpoint was NOT tested)`
            : `OAuth refresh succeeded in ${latencyMs}ms`,
          data: { latencyMs },
        });
      } catch (error) {
        if (isAuthReadOnly() || error instanceof AuthenticationError) {
          findings.push({
            level: 'warn',
            code: 'oauth-readonly-blocked',
            message:
              'PIXIV_AUTH_READONLY blocks the token endpoint; OAuth data plane NOT tested. ' +
              'Re-run without the flag (and with no production execution holding the credential).',
            data: { error: error instanceof Error ? error.message : String(error) },
          });
        } else {
          findings.push({
            level: 'critical',
            code: 'oauth-failed',
            message: `OAuth refresh failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }

    // --- 3. App API: one small fixed request ---
    let mediaUrl: string | null = null;
    const appApi = await this.probeAppApi(fetchImpl, accessToken, illustId, findings);
    if (appApi?.mediaUrl) mediaUrl = appApi.mediaUrl;

    // --- 4. Media CDN: 64 KiB Range request with the app Referer ---
    const media = await this.probeMedia(fetchImpl, mediaUrl, findings);

    if (db) db.close();

    const summary = this.summarize(provider, region, findings, appApi, media);
    this.print(context, summary, args.options.json === true);
    const exitCode = findings.some((f) => f.level === 'critical') ? 2 : findings.some((f) => f.level === 'warn') ? 1 : 0;
    return this.withExitCode(this.success(`egress verdict: ${summary.verdict}`, summary), exitCode);
  }

  /** pixiv.net answers 403 to anonymous probes; any HTTP response proves reachability. */
  private async probeReachable(
    fetchImpl: typeof fetch,
    proxy: { host: string; port: number; protocol?: string; username?: string; password?: string } | undefined,
    findings: Finding[]
  ): Promise<void> {
    try {
      const init: RequestInit = { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) };
      if (proxy) {
        // Same proxy path the download pipeline uses (see HealthCommand.checkNetwork).
        const undici = require('undici');
        const protocol = (proxy.protocol || 'http').toLowerCase();
        const auth = proxy.username && proxy.password
          ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
          : '';
        (init as Record<string, unknown>).dispatcher = new undici.ProxyAgent(
          `${protocol}://${auth}${proxy.host}:${proxy.port}`
        );
      }
      const started = performance.now();
      const res = await fetchImpl('https://www.pixiv.net/', init);
      const latencyMs = Math.round(performance.now() - started);
      findings.push({
        level: 'ok',
        code: 'pixiv-net-ok',
        message: `pixiv.net reachable (HTTP ${res.status}) in ${latencyMs}ms`,
        data: { status: res.status, latencyMs },
      });
    } catch (error) {
      findings.push({
        level: 'critical',
        code: 'pixiv-net-unreachable',
        message: `pixiv.net unreachable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /**
   * One small App API request. Any HTTP response proves the data plane is reachable;
   * 429 is the starvation signal this probe exists to surface.
   */
  private async probeAppApi(
    fetchImpl: typeof fetch,
    accessToken: string | null,
    illustId: string,
    findings: Finding[]
  ): Promise<{ status: number | null; ttfbMs: number | null; durationMs: number | null; rateLimited: boolean; retryAfterMs: number | null; mediaUrl: string | null } | null> {
    if (!accessToken) {
      findings.push({
        level: 'skipped',
        code: 'appapi-skipped',
        message: 'no access token (OAuth skipped/failed); App API data plane not tested authenticated',
      });
      return null;
    }
    const url = `https://app-api.pixiv.net/v1/illust/detail?illust_id=${encodeURIComponent(illustId)}`;
    try {
      const started = performance.now();
      const res = await fetchImpl(url, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          // The App API rejects requests without an app User-Agent.
          'user-agent': 'PixivAndroidApp/5.0.234 (Android 11; Pixel 5)',
          'app-os': 'android',
          'app-os-version': '11',
        },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const ttfbMs = Math.round(performance.now() - started);
      const retryAfter = res.headers.get('retry-after');
      const retryAfterMs = retryAfter !== null ? Number(retryAfter) * 1000 || null : null;
      let mediaUrl: string | null = null;
      try {
        const body = (await res.json()) as {
          illust?: { meta_single_page?: { original_image_url?: string }; meta_pages?: { image_urls?: { original?: string } }[] };
        };
        mediaUrl =
          body.illust?.meta_single_page?.original_image_url ??
          body.illust?.meta_pages?.[0]?.image_urls?.original ??
          null;
      } catch {
        // A non-JSON body is recorded via status; the media probe then reports skipped.
      }
      const rateLimited = res.status === 429;
      findings.push({
        level: rateLimited ? 'warn' : 'ok',
        code: rateLimited ? 'appapi-429' : 'appapi-ok',
        message: `App API responded HTTP ${res.status} in ${ttfbMs}ms${retryAfter ? ` (retry-after ${retryAfter}s)` : ''}`,
        data: { status: res.status, ttfbMs, retryAfterMs },
      });
      return { status: res.status, ttfbMs, durationMs: ttfbMs, rateLimited, retryAfterMs, mediaUrl };
    } catch (error) {
      findings.push({
        level: 'critical',
        code: 'appapi-failed',
        message: `App API request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  }

  /** 64 KiB Range request — never a full media download. */
  private async probeMedia(
    fetchImpl: typeof fetch,
    mediaUrl: string | null,
    findings: Finding[]
  ): Promise<{ status: number | null; ttfbMs: number | null; bytes64kDurationMs: number | null; timedOut: boolean }> {
    if (!mediaUrl) {
      findings.push({
        level: 'skipped',
        code: 'media-skipped',
        message: 'no media URL from the App API response; media CDN not tested',
      });
      return { status: null, ttfbMs: null, bytes64kDurationMs: null, timedOut: false };
    }
    try {
      const started = performance.now();
      const res = await fetchImpl(mediaUrl, {
        headers: {
          range: 'bytes=0-65535',
          // i.pximg.net requires the app referer or it answers 403.
          referer: 'https://app-api.pixiv.net/',
        },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const durationMs = Math.round(performance.now() - started);
      await res.arrayBuffer().catch(() => null);
      const ok = res.status === 200 || res.status === 206;
      findings.push({
        level: ok ? 'ok' : res.status === 429 ? 'warn' : 'critical',
        code: ok ? 'media-ok' : res.status === 429 ? 'media-429' : 'media-blocked',
        message: `media CDN responded HTTP ${res.status} in ${durationMs}ms (64 KiB Range)`,
        data: { status: res.status, bytes64kDurationMs: durationMs },
      });
      return { status: res.status, ttfbMs: durationMs, bytes64kDurationMs: durationMs, timedOut: false };
    } catch (error) {
      const timedOut = error instanceof Error && /timeout|abort/i.test(error.message);
      findings.push({
        level: 'critical',
        code: timedOut ? 'media-timeout' : 'media-failed',
        message: `media CDN request failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { status: null, ttfbMs: null, bytes64kDurationMs: null, timedOut };
    }
  }

  private summarize(
    provider: string,
    region: string,
    findings: Finding[],
    appApi: { status: number | null; ttfbMs: number | null; durationMs: number | null; rateLimited: boolean; retryAfterMs: number | null } | null,
    media: { status: number | null; ttfbMs: number | null; bytes64kDurationMs: number | null; timedOut: boolean }
  ): EgressProbeSummary {
    const oauth = findings.find((f) => f.code.startsWith('oauth-'));
    const incomplete = findings.some((f) => f.level === 'skipped');
    const critical = findings.some((f) => f.level === 'critical');
    const degraded = findings.some((f) => f.level === 'warn');
    const verdict: EgressVerdict = critical ? 'FAIL' : degraded ? 'DEGRADED' : incomplete ? 'INCOMPLETE' : 'PASS';
    return {
      provider,
      region,
      network: 'datacenter-egress',
      oauth: {
        status: oauth ? oauth.code : 'oauth-skipped',
        latencyMs: (oauth?.data?.latencyMs as number) ?? null,
        refreshed: oauth?.code === 'oauth-refresh-ok',
      },
      appApi: {
        status: appApi?.status ?? null,
        ttfbMs: appApi?.ttfbMs ?? null,
        durationMs: appApi?.durationMs ?? null,
        rateLimited: appApi?.rateLimited ?? false,
        retryAfterMs: appApi?.retryAfterMs ?? null,
      },
      media,
      verdict,
      incomplete,
      findings,
    };
  }

  private print(context: CommandContext, summary: EgressProbeSummary, asJson: boolean): void {
    if (asJson) {
      context.logger.info(JSON.stringify(summary, null, 2));
      return;
    }
    context.logger.info('━━━ Pixiv egress probe ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const f of summary.findings) {
      const mark = f.level === 'ok' ? '✓' : f.level === 'warn' ? '⚠' : f.level === 'critical' ? '✗' : '·';
      context.logger.info(`  ${mark} [${f.level.toUpperCase()}] ${f.code}: ${f.message}`);
    }
    context.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    context.logger.info(
      `  verdict: ${summary.verdict}${summary.incomplete ? ' (incomplete: some probes were skipped)' : ''}`
    );
  }
}
