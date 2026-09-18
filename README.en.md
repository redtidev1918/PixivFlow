# PixivFlow

**Language / 语言:** [中文](README.md) · English

**Pixiv downloader, filter and automatic collection tool.**

Download a single Pixiv artwork (illustration, novel, ugoira) directly, or batch-collect
by tag, ranking, publish date and bookmark count, and let the scheduler keep collecting
on a cron. Results stay on your disk, or get delivered reliably over HTTP to another
service — downstreams are optional, PixivFlow alone covers
discover → filter → download → save.

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

## Typical scenarios

**1. Download one link.** Paste any Pixiv link — artwork, novel, series, or user
profile are all recognized:

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
```

**2. Batch download by conditions.** Define what to collect in your config (tag,
ranking, date range, minimum bookmarks) and run it in one pass. Downloaded items are
tracked in SQLite and skipped, so re-running never re-downloads. See
[Filtering and targets](#filtering-and-targets).

**3. Collect on a schedule and deliver.** Run it under cron: discover, download, and
optionally hand files to another service — the local copy is deleted only after the
receiver confirms.

```text
Pixiv ──► PixivFlow ──┬──► local, permanent (persistent)
                      └──► HTTP delivery (cache) ──► TelePost / any compatible service
```

## Quick start

Requires Node.js 22.13 or later; use a currently supported LTS release in production.

```bash
npm install -g pixivflow
pixivflow --help
```

Sign in to your Pixiv account (creates OAuth credentials, one time):

```bash
pixivflow login                 # desktop with a browser
pixivflow login-headless        # headless server
```

Download something — paste any Pixiv link (artwork, novel, series, or a user
profile are all recognized):

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
```

Bulk-download from your configured targets and start the scheduler:

```bash
pixivflow download
pixivflow scheduler             # long-running cron collection
```

Prefer not to hand-write config? The interactive wizard `pixivflow setup` generates it.
For a GUI, run `pixivflow web` (frontend:
[pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui)).

Downloading Pixiv ugoira additionally needs `python3` and `ffmpeg`: frames are
composited into a looping GIF by per-frame delay, ready to be delivered as an animation.
The official Docker image includes both — see
[configuration notes](docs/CONFIG.md#pixiv-动图ugoira).

Build from source:

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
```

Termux / Android: see [TERMUX_INSTALL.md](docs/TERMUX_INSTALL.md).

## Filtering and targets

Define what to collect in the `targets` section of your config. Conditions
combine:

| Field | Meaning | Example |
| --- | --- | --- |
| `type` | `illustration` or `novel` | `illustration` |
| `tag` | Search tag(s); multiple tags are OR'ed | `"風景"` / `["watercolor","impasto"]` |
| `limit` | Max items per run | `20` |
| `minBookmarks` | Minimum bookmark count | `500` |
| `startDate` / `endDate` | Publish date range | `"2025-01-01"` |

Downloaded items are tracked in a SQLite database and skipped automatically;
files that exist without a database record are reconciled, so the two never
conflict. Illustration tasks with `mode: "topic"` keep a bounded hotness candidate
pool: if the top item is already downloaded, the next undownloaded one is promoted by
hotness instead of the run coming back empty.

## Persistent and cache delivery modes

Each target (one tag / schedule) can use one of two storage modes:

- **`persistent`** (the default): keep files forever.
- **`cache`**: send files to a named delivery target and delete the local copy only
  after the receiver confirms — saves disk.

A "delivery target" is just configuration: which URL to POST to and which fields to
send. It is not bound to any service and can point at any compatible HTTP endpoint;
[TelePost](https://github.com/redtidev1918/TelePost) and
[telepress](https://github.com/redtidev1918/telepress) are example downstreams. Example:

```json
{
  "delivery": {
    "outboxRetryBaseMs": 300000,
    "outboxRetryMaxMs": 21600000,
    "targets": {
      "sharing-api": {
        "type": "httpMultipart",
        "url": "https://your-domain.example/api/bot1/v1/submissions",
        "readinessUrl": "https://your-domain.example/ready",
        "notificationUrl": "https://your-domain.example/api/bot1/v1/notifications",
        "headers": { "Authorization": "Bearer ${SHARING_TOKEN}" },
        "fileField": "files",
        "fields": { "title": "{{title}}" },
        "success": { "statuses": [201], "jsonPath": "ok", "equals": true },
        "arrayFormat": "comma",
        "maxAttempts": 3,
        "retryDelayMs": 2000
      }
    },
    "deleteAfterDelivery": true
  },
  "targets": [
    { "type": "illustration", "tag": "archive", "storageMode": "persistent" },
    {
      "type": "illustration",
      "tag": "updates",
      "storageMode": "cache",
      "delivery": {
        "target": "sharing-api",
        "fields": { "tags": ["announcement", "update"], "anonymous": false }
      }
    }
  ]
}
```

Headers and URLs accept `${ENV_NAME}` interpolation (never hard-code tokens). Cache-mode
illustration delivery also sends an optional, one-to-one Pixiv preview in the `previews`
multipart field while retaining the original as the authoritative artifact; a generic
receiver may ignore that field.

Operational notifications can point `notificationUrl` at an
[Apprise API](docs/APPRISE.md) instance, which fans out to Email, Telegram, Discord,
ntfy and more; PixivFlow does not implement those notification protocols itself.

- The `url` above is any compatible HTTP submission endpoint; the example uses
  TelePost's `/api/botN/v1/submissions` (put the `tp_...` from `/gen_token` into
  `SHARING_TOKEN` — that is the example service's own auth scheme).
- The same target can point at [telepress](https://github.com/redtidev1918/telepress)'s
  `/publish/gallery` to publish illustrations as a Telegra.ph gallery, see the
  "Telegraph (telegra.ph) gallery upload" section of [CONFIG.md](docs/CONFIG.md).

## Automation and reliability

### Multiple schedules and atomic hot reload

`schedules[]` hosts independently timed target groups in one Node process.
Plans share Pixiv authentication, SQLite, and file services, while a bounded
serial queue prevents overlapping downloads from producing memory spikes. This runs
comfortably on small machines — measured with `topic` discovery, selection and
download inside a 256 MB cgroup: peak RSS ≈ 106 MB, heapUsed ≈ 33 MB, no OOM
(see [DOCKER.md](docs/DOCKER.md)).
The active config is watched by default: replace it over SSH and PixivFlow
fully validates the new snapshot before swapping the entire cron table. An
invalid edit leaves the previous schedules running. In-flight work finishes
on its old snapshot; the next run sees the new one.

```json
{
  "scheduler": { "enabled": false, "cron": "0 3 * * *" },
  "schedules": [
    { "id": "bot1", "enabled": true, "cron": "10 5 * * *", "targetIds": ["bot1-art", "bot1-novel"] },
    { "id": "bot2", "enabled": true, "cron": "30 5 * * *", "targetIds": ["bot2-art", "bot2-novel"] }
  ],
  "targets": [
    { "id": "bot1-art", "type": "illustration", "mode": "ranking", "rankingDate": "YESTERDAY" },
    { "id": "bot1-novel", "type": "novel", "mode": "ranking", "rankingDate": "YESTERDAY" }
  ]
}
```

Legacy single-`scheduler` configs remain supported. `schedules`, `targets`,
`delivery`, and `download` are hot-reloadable; changes to `pixiv`, `network`,
or `storage` require a process restart. See the ready-to-edit
[`config/fly-two-bots.example.json`](config/fly-two-bots.example.json) template.

### Durable delivery outbox

Delivery is transactional (a SQLite outbox): at-least-once execution with
effectively-once visible effects. Every external side effect (one content delivery,
one notification) becomes a row with an idempotency key and a row-level lease; an
independent worker pumps it right away and retries with exponential backoff (5 minutes
up to 6 hours by default), and rows that exceed `maxAttempts` go dead and are recorded
as `failed` in the delivery ledger. After a crash or machine hang, expired `processing`
leases are taken over by the next process, which retries the same idempotent intent — a
downstream converges via `idempotent_replay` (same key, lost ACK) or
`duplicate_existing` (historical duplicate), so the channel still shows exactly one
message. Legacy file-based `delivery-outbox/*.json` manifests are migrated into SQLite
once at startup, idempotently. "Nothing to publish today" notifications share that table
but are pumped independently, so a temporarily unavailable review endpoint cannot block
content delivery.

When `readinessUrl` is configured, a non-2xx readiness response returns the row to
pending without incrementing its attempt count — strictly separate from `/live`'s
"process is alive" meaning. Dead letters are recovered through first-class CLI:

```bash
pixivflow outbox list --status dead
pixivflow outbox inspect <id>
pixivflow outbox retry <id>   # only accepts dead rows, keeps the idempotency key
pixivflow outbox retry --dead
pixivflow outbox cancel <id>  # cancels rows that have not run yet
```

`run-once` re-runs the download plan; it is not an outbox replay, and you should not
hand-edit SQLite's `next_attempt_at`. For long-running hosts, use `pixivflow doctor`
(stuck slot/outbox leases, pending deliveries, dead rows; `--repair` converges) and
`pixivflow reconcile` (record downstream-confirmed historical duplicates in the delivery
ledger; dry-run by default).

## Common commands

| Command | Purpose |
| --- | --- |
| `pixivflow download` | Run downloads per config |
| `pixivflow download --url <url>` | Direct download via URL |
| `pixivflow random` | Random popular artwork |
| `pixivflow scheduler` | Start scheduled jobs |
| `pixivflow web` | Start the WebUI |
| `pixivflow config` | Manage config (view / edit / backup / restore) |
| `pixivflow status` | Download stats and recent records |
| `pixivflow health` | Health check: config, directories, connectivity |
| `pixivflow doctor` | Reliability check: stuck slot/outbox leases, pending deliveries, dead rows; `--repair` converges |
| `pixivflow reconcile` | Record downstream-confirmed historical duplicates (dry-run by default, `--repair` writes) |
| `pixivflow outbox` | List, inspect, replay dead letters, or cancel durable intents that have not run |
| `pixivflow tags discover <seed>` | Discover related tags (Pixiv autocomplete + tag co-occurrence); lists candidates only |
| `pixivflow tags apply <manifest> --target <id> --select <tag1,tag2>` | Atomically write chosen tags into config after manual confirmation, then hot-reload |
| `pixivflow topic resolve <topic>` | Inspect the derived tag space for a topic (`--type illustration\|novel`, `--refresh`) |
| `pixivflow topic test <topic> --date YESTERDAY` | Dry-run the candidates and Top N for one day, without downloading |

`tags discover` calls the Pixiv autocomplete endpoint and samples recent illustrations/novels to count co-occurring tags, caching results for 7 days; it **never** changes active plans. After reviewing candidates, run `tags apply` to explicitly select tags: it validates the whole config, writes a backup and atomically replaces the file so a running scheduler hot-reloads it.

More commands in [USAGE.md](docs/USAGE.md); see the [migration guide](docs/MIGRATION.md) for upgrading from v1 to v2.

## Deployment

- **Docker / long-running server**: see [DOCKER.md](docs/DOCKER.md).
- **Android / Termux**: see [TERMUX_INSTALL.md](docs/TERMUX_INSTALL.md).
- **Composing with TelePost**: PixivFlow and TelePost are both usable on their own.
  Only if you want to deploy the two together as one workflow do you need the
  [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy)
  deployment and operations kit.

## Documentation

Full tutorial site: <https://redtidev1918.github.io/PixivFlow/>

| Document | Description |
| --- | --- |
| [📥 Download](docs/download.md) | Prebuilt packages, npm and Docker |
| [QUICKSTART](docs/QUICKSTART.md) | Get running in three minutes |
| [CONFIG](docs/CONFIG.md) | All configuration options |
| [USAGE](docs/USAGE.md) | Feature reference |
| [LOGIN](docs/LOGIN.md) | Account sign-in details |
| [DOCKER](docs/DOCKER.md) | Container deployment |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Architecture notes |
| [MIGRATION](docs/MIGRATION.md) | Upgrade from v1 to v2 |
| [RELEASING](docs/RELEASING.md) | npm release workflow |
| [CHANGELOG](CHANGELOG.md) | Version history |
| [ACKNOWLEDGMENTS](docs/ACKNOWLEDGMENTS.md) | Credits and references |

Chinese version: [README.md](README.md).

## Related projects

PixivFlow is fully standalone. These are the related projects in the same author's
ecosystem, and what each one owns:

| Project | What it is | When you need it |
| --- | --- | --- |
| [TelePost](https://github.com/redtidev1918/TelePost) | Telegram channel submission, moderation and automated publishing platform | When you want downloads to land in a Telegram channel for human review before publishing — configure it as a delivery downstream. This is an optional composition; PixivFlow does not depend on it |
| [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy) | Deployment and operations kit for PixivFlow + TelePost (Docker / VPS / cloud) | When you want to deploy and operate both projects together. Running PixivFlow alone does not need it |
| [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) | WebUI frontend for PixivFlow | When you want a GUI to manage downloads and schedules |
| [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) | PKCE OAuth login library and CLI (`ptg`) | PixivFlow's login dependency; also usable on its own to obtain Pixiv tokens |

## Feedback

Bugs and feature requests go to
[Issues](https://github.com/redtidev1918/PixivFlow/issues); please run
`pixivflow health` first and include its output (strip tokens and other
secrets before sharing). Security issues are handled privately — see
[SECURITY.en.md](SECURITY.en.md).

## Acknowledgments

- [gallery-dl](https://github.com/mikf/gallery-dl) — reference for ugoira and novel text handling
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) — App API endpoint semantics
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) — OAuth login flow reference
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) — login library
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) — WebUI frontend

Not affiliated with Pixiv Inc. Full statement: [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md).

## License

[MIT](LICENSE)
