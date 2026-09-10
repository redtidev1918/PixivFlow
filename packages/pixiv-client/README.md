# @redtidev/pixiv-client

Independent, reusable **Pixiv App API client kit** for TypeScript/Node.js.

It knows Pixiv. It does **not** know your application: no config schema, no
database, no browser login, no scheduler. It currently lives as an npm
workspace package inside the PixivFlow monorepo and is intentionally **not
yet published** (see "When to split out" below).

```ts
import { createPixivClient, StaticTokenProvider } from '@redtidev/pixiv-client';

const pixiv = createPixivClient({ auth: new StaticTokenProvider(process.env.PIXIV_ACCESS_TOKEN!) });

const illust = await pixiv.illustrations.get(123_456);
const page   = await pixiv.illustrations.searchPage({ word: '風景', limit: 30 });
const bytes  = await pixiv.media.fetch(illust.meta_single_page!.original_image_url!);
```

## Features

- **Auth port, not login implementation** — inject anything implementing
  `AccessTokenProvider` (optionally `RefreshableAccessTokenProvider`). Browser
  OAuth/PKCE, puppeteer and python helpers stay in the host application.
- **One transport** for every call: base URL, App headers, Bearer auth,
  timeout (`AbortController`), HTTP(S) proxy (undici) and SOCKS proxy
  (axios + socks-proxy-agent), response parsing, typed errors.
- **Typed errors** — `PixivNotFoundError`, `PixivRateLimitError`,
  `PixivAuthenticationError`, `PixivServerError`, `PixivNetworkError`,
  `PixivTimeoutError`, `PixivCircuitOpenError`, ... classify with `instanceof`,
  never with `message.includes('429')`.
- **Single 429 gate** — one global rate limiter paces all requests and applies
  one shared cooldown. No nested retries, no request storms.
- **Slot-reservation pacing** — concurrent callers are serialized to
  t, t+interval, t+2·interval ... (the old coordinator woke them in a burst).
- **Conservative defaults**: 1000 ms minimum interval, jitter 25 %, first 429
  cooldown 60 s, exponential 60→120→240→480 s capped at 15 min, Retry-After
  always honored as a floor.
- **Penalty decay** — one success never clears the penalty; it decays after a
  configurable run (default 20) of consecutive successes.
- **Circuit breaker** — repeated 429s OPEN the gate; requests fast-fail with
  `PixivCircuitOpenError`; after the cooldown a single half-open probe tests
  recovery.
- **Persistent state port** — inject a `RateLimitStateStore` (e.g. an SQLite
  adapter) so restarts/deploys remember an active cooldown. Default is
  in-memory.
- **In-flight coalescing** — 10 concurrent `get(123)` calls make 1 HTTP
  request.
- **Pagination without auto-crawl** — `searchPage`/`rankingPage` plus the
  optional `paginate()` helper; always bounded by `limit`/`maxPages` and
  `AbortSignal`-aware.
- **Structured events** via `onEvent` (`request_start`, `request_retry`,
  `rate_limited`, `circuit_opened`, `auth_refresh`, ...). No credentials are
  ever logged or emitted.

## Retry ownership

| Failure                         | Owner                                        |
| ------------------------------- | -------------------------------------------- |
| network reset / timeout / 5xx   | transport retries (default 2), linear backoff|
| 429 while circuit CLOSED        | transport waits the shared gate cooldown     |
| 429 after circuit OPEN threshold| fails fast; durable retry belongs to the host (scheduler/outbox) |
| 401                             | one `refreshAccessToken()` + retry, then error|
| 400 / 403 / 404                 | never retried                                |

The kit never rotates proxies or IPs on 429 and never alternates between the
App and Web API to dodge rate limits. Endpoint-capability fallback (the novel
text v2→v1/ajax chain) is allowed; anti-rate-limit rotation is not.

## API surface

- `createPixivClient(options)` / `new PixivClient(options)`
- `pixiv.illustrations` — `get/detail`, `detailWithTags`, `searchPage`,
  `search`, `rankingPage`, `ranking`, `userWorksPage`, `listByUser`,
  `ugoiraMetadata`
- `pixiv.novels` — `get/detail`, `detailCompatible`, `detailWithTags`,
  `searchPage`, `search`, `rankingPage`, `ranking`, `userWorksPage`,
  `listByUser`, `listSeries`, `text`
- `pixiv.tags.autocomplete(word)`
- `pixiv.users.user(userId)` (Pixiv removed `/v1/user/profile`, so there is no "current user" endpoint)
- `pixiv.media.fetch(url)` → `ArrayBuffer`
- `pixiv.getRateLimitStatus()` — `{ circuitState, cooldownRemainingMs, penaltyLevel, last429At, nextAllowedInMs }`

The package has zero knowledge of host types (`TargetConfig`, schedulers,
SQLite, delivery, …). Mapping a host query into kit options is the host's
job, e.g. `mapTargetToPixivQuery(target): IllustSearchOptions`.

## When to split out into its own repo

Do **not** split yet. Split only once both hold:

1. A second real consumer exists (another bot, an Electron client, a
   standalone downloader …) — PixivFlow alone does not justify cross-repo
   version coordination.
2. The public API has run stable for a while and the host adapter has stopped
   churning.

At that point: history-split `packages/pixiv-client` → its own repo →
publish `@redtidev/pixiv-client` and depend on the released version.

## License

MIT
