# PixivFlow

**English** | [中文](https://github.com/redtidev1918/PixivFlow/blob/master/README.md)

Pixiv batch download and scheduled collection tool. Bulk-download
illustrations and novels, search by tag, filter by bookmarks and dates,
and run recurring collection jobs on a schedule. CLI and WebUI included.
Built with TypeScript and Node.js; runs on Windows, macOS, Linux and Docker.

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-18%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

## Install

Requires Node.js 18 or later (LTS).

```bash
npm install -g pixivflow
pixivflow --help
```

For servers, prefer the Docker Compose setup described in
[DOCKER.md](docs/DOCKER.md). To build from source:

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
```

Termux / Android: see [TERMUX_INSTALL.md](docs/TERMUX_INSTALL.md).

## Quick start

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

### Multiple schedules and atomic hot reload

`schedules[]` hosts independently timed target groups in one Node process.
Plans share Pixiv authentication, SQLite, and file services, while a bounded
serial queue prevents overlapping downloads from producing memory spikes.
The active config is watched by default: replace it over SSH and PixivFlow
fully validates the new snapshot before swapping the entire cron table. An
invalid edit leaves the previous schedules running. In-flight work finishes
on its old snapshot; the next run sees the new one.

Legacy single-`scheduler` configs remain supported. `schedules`, `targets`,
`delivery`, and `download` are hot-reloadable; changes to `pixiv`, `network`,
or `storage` require a process restart. See the ready-to-edit
[`config/fly-two-bots.example.json`](config/fly-two-bots.example.json) template.

## Download targets

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
conflict.

### Persistent and cache delivery modes

Each target can use `storageMode: "persistent"` (the default, keep files) or
`storageMode: "cache"` (send files to a named delivery target and delete them
only after success). The delivery layer is service-independent; this example
merely translates an HTTP multipart submission API into configuration:

```json
{
  "delivery": {
    "targets": {
      "sharing-api": {
        "type": "httpMultipart",
        "url": "https://example.test/submissions",
        "headers": { "Authorization": "Bearer ${SHARING_TOKEN}" },
        "fileField": "files",
        "fields": { "title": "{{title}}" },
        "success": { "statuses": [201], "jsonPath": "ok", "equals": true }
      }
    }
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

Headers and URLs accept arbitrary `${ENV_NAME}` interpolation. Failed delivery
keeps both files and the durable outbox manifest beside the SQLite database;
the next run retries them before processing new targets.

Interactive configuration wizard: `pixivflow setup`.

## Common commands

| Command | Purpose |
| --- | --- |
| `pixivflow download` | Run downloads per config |
| `pixivflow download --url <url>` | Direct download via URL |
| `pixivflow random` | Random popular artwork |
| `pixivflow scheduler` | Start scheduled jobs |
| `pixivflow config` | Manage config (view / edit / backup / restore) |
| `pixivflow status` | Download stats and recent records |
| `pixivflow health` | Health check: config, directories, connectivity |

More commands in [CLI_MIGRATION_SUMMARY.md](docs/CLI_MIGRATION_SUMMARY.md).

## Documentation

Full tutorial site: <https://redtidev1918.github.io/PixivFlow/>

| Document | Description |
| --- | --- |
| [QUICKSTART](docs/QUICKSTART.md) | Get running in three minutes |
| [CONFIG](docs/CONFIG.md) | All configuration options |
| [USAGE](docs/USAGE.md) | Feature reference |
| [LOGIN](docs/LOGIN.md) | Account sign-in details |
| [DOCKER](docs/DOCKER.md) | Container deployment |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Architecture notes |
| [RELEASING](docs/RELEASING.md) | npm release workflow |
| [CHANGELOG](docs/project/CHANGELOG.md) | Version history |
| [ACKNOWLEDGMENTS](docs/ACKNOWLEDGMENTS.md) | Credits and references |

Chinese version: [README.md](README.md).

## Feedback

Bugs and feature requests go to
[Issues](https://github.com/redtidev1918/PixivFlow/issues); please run
`pixivflow health` first and include its output (strip tokens and other
secrets before sharing). Security issues are handled privately — see
[SECURITY.md](SECURITY.md).

## Acknowledgments

- [gallery-dl](https://github.com/mikf/gallery-dl) — reference for ugoira and novel text handling
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) — App API endpoint semantics
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) — OAuth login flow reference
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) — login library
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) — WebUI frontend

Not affiliated with Pixiv Inc. Full statement: [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md).

## License

[MIT](LICENSE)
