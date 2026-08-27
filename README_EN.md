# PixivFlow

Pixiv batch download and scheduled collection tool. Bulk-download
illustrations and novels, search by tag, filter by bookmarks and dates,
and run recurring collection jobs on a schedule. CLI and WebUI included.
Built with TypeScript and Node.js; runs on Windows, macOS, Linux and Docker.

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-18%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=flat-square)](LICENSE)
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

Chinese version: [README.md](README.md).

## Feedback

Bugs and feature requests go to
[Issues](https://github.com/redtidev1918/PixivFlow/issues); please run
`pixivflow health` first and include its output (strip tokens and other
secrets before sharing). Security issues are handled privately — see
[SECURITY.md](SECURITY.md).

## License

[GPL-3.0-or-later](LICENSE)
