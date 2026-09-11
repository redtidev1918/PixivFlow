# Pixiv Client Kit (`@redtidev/pixiv-client`)

**English** | [中文](../PIXIV_CLIENT_KIT.md)

The Pixiv protocol/network code is an independent internal npm workspace
package at [`packages/pixiv-client`](../packages/pixiv-client). PixivFlow is a
consumer of the kit; the kit knows nothing about PixivFlow.

> The kit is **not** a separate GitHub repository yet — see
> [When to split out](#when-to-split-out-into-its-own-repository).

## Dependency rule

```
PixivFlow (product)  ──▶  @redtidev/pixiv-client (kit)  ──▶  Pixiv HTTP API
       │                          │
       │                          └ no TargetConfig, StandaloneConfig, SQLite,
       │                            puppeteer, scheduler, logger impl, delivery
       │
       └ host adapters: PixivFlowPixivClient, TargetSearchRunner,
         PixivAuthTokenProvider, SQLiteRateLimitStateStore
```

One-directional only. `src/__tests__/independence.test.ts` in the package fails
the build if the kit references host symbols (`TargetConfig`,
`StandaloneConfig`, `better-sqlite3`, `puppeteer`, …) or imports anything
outside its own `src`.

## What the kit provides

- **Transport** — one HTTP stack (`globalThis.fetch` + undici `ProxyAgent` for
  HTTP/HTTPS proxies; axios + `socks-proxy-agent` only for SOCKS, which undici
  does not support). Per-request timeout via `AbortController`, caller
  `AbortSignal` propagation, transient HTTP retry, 401 single refresh, binary
  media fetch returning `ArrayBuffer` (never writes files).
- **App-API services** — `illustrations`, `novels`, `tags`, `users`, `media`
  with typed option DTOs (`IllustSearchOptions`, `RankingOptions`, …). Protocol
  quirks preserved: v2→v1 novel detail fallback, novel text 3-tier fallback
  (`/webview/v2/novel` marker parse → `/v1/novel/text` → `ajax/novel/{id}`
  with browser UA, no auth/App headers).
- **Typed errors** — `PixivError` hierarchy (`PixivHttpError`,
  `PixivRateLimitError`, `PixivNotFoundError`, `PixivTimeoutError`,
  `PixivCircuitOpenError`, …) carrying `status`, `retryAfterMs`, `endpoint`.
  No more `message.includes('429')`.
- **Pagination** — `paginate(fetchPage, opts)` / `firstPage`; bounded walks,
  abortable.
- **Coalescing** — identical in-flight GETs merge into one request.
- **Events** — `onEvent` emits retry/rate-limit/circuit transitions; no token
  or URL-with-secret data.

### Public surface

Only `package.json` `exports` (`.` → `dist`) is public. Everything else is
internal. Entry points: `createPixivClient(options)`, `PixivClient`,
`RateLimitGate`, error classes, model types, option DTOs, the
`AccessTokenProvider` port, `RateLimitStateStore` port, `paginate`.

## The 429 design (single global gate)

There is exactly **one** gate per `PixivClient`; every request acquires a slot
first.

1. **Real slot reservation, not bursty sleeps.** Reservations are serialized
   through a promise-chain mutex; concurrent callers receive strictly
   increasing deadlines (A→0ms, B→1000ms, C→2000ms…), never a shared burst.
2. **Conservative defaults.** `minIntervalMs: 1000` + 25% jitter; first 429
   cooldown **60s**; exponential 60→120→240→480, capped at 15min. A
   `Retry-After` header is honored as a **floor** (`max(retryAfter, ladder)`),
   never as permission to shorten the cooldown.
3. **Penalty decay.** One success does **not** reset the penalty level; a
   configurable run of consecutive successes (`decaySuccesses`, default 20)
   steps it down. State survives across requests via `RateLimitState`.
4. **Circuit breaker.** CLOSED → OPEN after repeated 429s (`openThreshold`),
   which fails fast with `PixivCircuitOpenError`; after the cooldown a single
   HALF_OPEN probe is allowed; success closes, failure reopens.
5. **Persistence port.** `RateLimitStateStore` (load/save by scope); in-memory
   default. PixivFlow provides `SQLiteRateLimitStateStore`
   (`rate_limit_state` table), so Fly suspend/resume and restarts do not
   forget an active Pixiv cooldown.
6. **Observability.** `client.getRateLimitStatus()` returns cooldown
   remaining, penalty level, circuit state, last 429. `doctor` and `health`
   surface it.
7. **Retry ownership (no nested retries).** The transport owns *transient
   HTTP* retries (connection reset, 5xx, one 429 round while the gate is
   healthy). The gate owns the 429 cooldown/backoff. The scheduler/download
   pipeline owns *durable* task-level retry across runs. No layer retries the
   same failure three times.

### Host-side compatibility

- `PixivFlowPixivClient implements IPixivClient` — the existing product
  interface, delegating to the kit. Product behavior (TargetConfig mapping,
  tag-OR merging, inter-page `requestDelay`, date-aware early-stop
  pagination, over-fetch, final sorting) lives in the host's
  `TargetSearchRunner` / `query-mapper`, because it is PixivFlow behavior, not
  Pixiv protocol.
- `PixivAuthTokenProvider` adapts the existing OAuth/refresh-token
  `PixivAuth` (SQLite-cached tokens, PKCE/python login unchanged) to the kit's
  3-method auth port.
- `createPixivFlowClient(auth, config, database)` is the single construction
  path used by all commands, the scheduler runtime and the WebUI.
- Legacy error consumers still work: `NetworkError`/`is404Error`/recovery and
  concurrency code accept kit typed errors via helpers in
  `src/utils/errors.ts` (`isRetryableNetworkError`, `rateLimitWaitMs`).
- Config stays backward compatible: `network.timeoutMs/retries/proxy` map
  straight through. New opt-in `network.requestPacingMs` overrides the kit's
  1000ms default (0 disables pacing only; it cannot disable the 429
  cooldown). The safe default replaces the old 500ms pacing.

## Files

Host (`src/`):

| File | Role |
| --- | --- |
| `pixiv-client/PixivFlowPixivClient.ts` | `IPixivClient` adapter over the kit |
| `pixiv-client/TargetSearchRunner.ts` | host date/tag/pagination semantics |
| `pixiv-client/query-mapper.ts` | TargetConfig → kit option DTOs |
| `pixiv-client/PixivAuthTokenProvider.ts` | auth port adapter |
| `pixiv-client/createPixivFlowClient.ts` | single factory (config, logger, SQLite store, scope) |
| `auth/PixivAuth.ts` | OAuth/refresh token (moved from `pixiv/AuthClient.ts`) |
| `storage/repositories/RateLimitStateRepository.ts` | SQLite gate-state adapter |
| `pixiv/PixivClient.ts`, `pixiv/AuthClient.ts` | deprecated re-export shims |

Deleted: `pixiv/PixivApiCore.ts`, `pixiv/RateLimitCoordinator.ts`,
`pixiv/client/*` (Illust/Novel/Media/Search services), `pixiv/types.ts`,
`pixiv/IPixivRequestHandler.ts` and their 2,400+ lines of old tests. Exactly
one Pixiv HTTP stack remains.

Dependency change: added `undici` (kit); removed unused `https-proxy-agent`.

### The published artifact stays self-contained

`pixivflow` is consumed straight from npm by the Fly/Docker deployments, so the
kit is **bundled** into the published tarball rather than resolved from the
registry: the root `package.json` lists it in `bundleDependencies`, and npm
ships the workspace package at `node_modules/@redtidev/pixiv-client` inside the
tarball (its runtime deps — axios, socks-proxy-agent, undici — are already
direct dependencies of `pixivflow`). Publishing the kit separately is only
needed once an external consumer wants it directly; do NOT turn the dependency
into a plain registry range before that, or every `npm install pixivflow` fails
with a 404.

## When to split out into its own repository

Not yet. The honest gating conditions are:

1. **A second real consumer.** Today PixivFlow is the only consumer; the
   adapter/host boundary has only been proven one way. A second independent
   app (CLI, bot, another service) is what validates that the public surface
   is generally shaped.
2. **Stable public API.** `createPixivClient`, service methods, option DTOs,
   error names and `getRateLimitStatus()` need a period without breaking
   change, then a 1.0 semver line.
3. **Independent CI/release.** Own lint/test/typecheck/publish pipeline
   (currently shares the workspace), versioned changelog, published tarball.
4. **Protocol coverage confidence.** The Web-API boundary is intentionally a
   placeholder; confirm App-API-only is acceptable for external consumers or
   add Web endpoints first.

When all four hold, extracting is mechanical: move `packages/pixiv-client` to
its own repo, publish as `@redtidev/pixiv-client`, switch the workspace
dependency to the released version. The architecture test and `exports`
surface already enforce the boundary that makes that move safe.
