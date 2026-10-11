# PixivFlow

Language / 语言: [中文](README.md) · English

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

PixivFlow is an open-source command-line downloader for Pixiv. It saves illustrations, manga, ugoira animations and novels, collects works in bulk by tag, ranking and other filters, and can run downloads on a schedule. Files are stored on your own computer or server.

[Install](#install) · [Quick start](#quick-start) · [What it does](#what-it-does) · [Batch downloads](#batch-downloads) · [Scheduled downloads](#scheduled-downloads) · [WebUI](#webui) · [Common questions](#common-questions) · [Full documentation](https://redtidev1918.github.io/PixivFlow/)

## Install

```bash
npm install -g pixivflow
```

Node.js 22.13 or newer is required (npm 9+). You also need a Pixiv account and a network that can reach Pixiv; some networks require a proxy. Interactive login opens Chrome or Chromium on your machine.

Run `pixivflow --help` afterwards to confirm the command is available.

## Quick start

```bash
pixivflow login
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
pixivflow dirs
```

- `login` opens a browser to sign in to Pixiv. Credentials are stored locally and reused by later commands.
- `download --url "<work URL>"` downloads one work. Illustration, manga, ugoira, novel, novel-series and artist-profile URLs all work.
- `dirs` prints the configuration file, database and download directories actually in use.

> **Watch out for credential leaks.** The login command prints the access token, refresh token and similar values to the terminal. Never paste terminal output, logs or screenshots containing them into issues, chat groups or public sites. Remove them before asking for help.

Server login and importing an existing token are covered in the [login guide](docs/en/LOGIN.md); the supported URL formats are listed in the [usage guide](docs/en/USAGE.md).

## What it does

| Feature | Description |
| --- | --- |
| URL download | Paste a work, novel, series or artist-profile link and download it |
| Batch download | Collect works by tag, ranking, publication date, bookmark count and more, with optional AI-work exclusion and novel language filtering |
| Scheduled downloads | Run downloads on a cron expression and timezone, with support for several independent schedules |
| Deduplication and history | Download records live in a local database, so works you already have are skipped |
| File management | `pixivflow dirs` shows where files are saved, `pixivflow status` shows download statistics |
| Tag discovery | `pixivflow topic resolve "<topic>"` expands a topic into related Pixiv tags from tag and work metadata; no language model is involved |
| External delivery | After a download, deliver results to your own service or [TelePost](https://github.com/redtidev1918/TelePost) over webhook or HTTP multipart |

Day-to-day use is one path: sign in to Pixiv → pick a work or set collection rules → download → save locally. Long-running automated collection adds a filtering and delivery step.

## Batch downloads

To collect several works by rule, run the setup wizard first:

```bash
pixivflow setup
pixivflow download
```

Works you already downloaded are skipped, so a run may add fewer works than the configured limit.

<details>
<summary>Setting collection rules manually (illustration and novel example)</summary>

If a configuration already exists, back it up and edit it:

```bash
pixivflow config backup
pixivflow config edit
```

Replace the current `targets` array with the one below and keep your existing login and other fields. This snippet downloads at most 10 illustrations and 5 novels per run:

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 10 },
    { "type": "novel", "tag": "ファンタジー", "limit": 5 }
  ]
}
```

Validate the configuration, then start the download:

```bash
pixivflow config validate
pixivflow download
```

</details>

Frequently used filter fields:

| Field | Meaning |
| --- | --- |
| `type` | `illustration` for illustrations and manga, `novel` for novels |
| `tag` | The Pixiv tag to search for; tags shown on the work page work well |
| `limit` | Maximum number of works per run |
| `mode` | `search` (by tag), `ranking` (by ranking) or `topic` (expand a topic into tags) |
| `minBookmarks` | Minimum bookmark count, for filtering popular works |
| `startDate` / `endDate` | Publication date range in `YYYY-MM-DD` form |
| `excludeAI` | Whether to exclude AI-generated works |

More examples are in the [batch download tutorial](docs/en/QUICKSTART.md#download-by-tag) and the full set of filters is in the [configuration reference](docs/en/CONFIG.md).

## Scheduled downloads

Make sure batch downloads work first, then set up a schedule. You can configure it in the `pixivflow setup` wizard or edit the configuration directly.

<details>
<summary>Setting a time manually: every day at 03:00 Beijing time</summary>

Set `scheduler` in the current configuration:

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

This is a configuration fragment; merge it into your existing configuration. Validate it and start the scheduler:

```bash
pixivflow config validate
pixivflow scheduler
```

To run several times a day, or to give different targets different times, use the `schedules` array to configure independent schedules. When `schedules` is present, the legacy `scheduler.cron` is ignored. See the [configuration reference](docs/CONFIG.md) for the fields.

</details>

The scheduler only runs while this command is running. Downloads do not happen while the machine is off or asleep; by default the process catches up on one missed run after a restart. See the [configuration reference](docs/en/CONFIG.md) for the exact behaviour, and the [Docker guide](docs/DOCKER.md) (Chinese) to keep it running on a server.

## Configuration and file locations

```bash
pixivflow dirs      # actual paths of the configuration file, database and download directories
pixivflow config    # show the current configuration; subcommands include show / validate / edit / set
pixivflow status    # download statistics and recent records
```

- The default `persistent` mode keeps downloaded files on disk.
- With `cache` mode plus a delivery target, local files can be removed once the receiving service confirms them; files that fail to deliver are kept.

See the [configuration reference](docs/en/CONFIG.md) for storage layout and cleanup policy.

## WebUI

PixivFlow ships an optional browser interface from the same npm package:

```bash
pixivflow web
```

It serves `http://localhost:3000` by default and includes the frontend files, so nothing else needs to be installed. The interface shows download records and schedule status, manages download tasks, and can download a pasted URL directly. Keep the command running while you use it and press `Ctrl+C` to stop.

See the [WebUI guide](docs/en/WEBUI.md) for pages, access credentials and settings for reaching it from another machine. The frontend source lives in the [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) repository.

## Other installation methods

- **Docker** — a good fit for scheduled downloads on a server or NAS. The repository provides `Dockerfile`, `Dockerfile.scheduler` and `docker-compose.yml`; see the [Docker guide](docs/DOCKER.md).
- **Desktop client** — maintained in the separate [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) repository; check that repository for installers and maturity.
- **Android / Termux** — follow the [Termux installation guide](docs/TERMUX_INSTALL.md).
- **Build from source**:

  ```bash
  git clone https://github.com/redtidev1918/PixivFlow.git
  cd PixivFlow
  npm install
  npm run build
  node dist/index.js --help
  ```

## Common questions

<details>
<summary>Login fails or the token expired. What now?</summary>

Run `pixivflow login` again. On a server or anywhere a browser cannot open, use the headless login or import an existing token as described in the [login guide](docs/en/LOGIN.md).

</details>

<details>
<summary>Pixiv is unreachable from my network.</summary>

Run `pixivflow health` to check connectivity and credentials. If you need a proxy, configure it as described in the network and proxy section of the [configuration reference](docs/en/CONFIG.md).

</details>

<details>
<summary>Why did the download find 0 works?</summary>

Check whether the tag, date and bookmark filters are too narrow. It may also be that matching works were already downloaded, or that every candidate was filtered out. Run `pixivflow status` to see recent records.

</details>

<details>
<summary>Where are the files?</summary>

Run `pixivflow dirs`. It prints the real paths of the configuration file and download directories. Paths differ between installation methods, so trust this command.

</details>

<details>
<summary>Why is the scheduled download not running?</summary>

Check that the `pixivflow scheduler` process is still running, that `scheduler.enabled` is `true`, and that the cron expression and timezone are correct. Downloads do not happen while the machine is off or asleep; use a server or Docker for 24/7 operation.

</details>

<details>
<summary>How do I read the logs?</summary>

Run `pixivflow logs` for the runtime log; `pixivflow dirs` also shows the log directory. Use `pixivflow outbox` / `pixivflow delivery` to investigate delivery queue problems.

</details>

<details>
<summary>Ugoira downloaded without a GIF.</summary>

Building the GIF needs `python3` and `ffmpeg`. If the conversion fails, the original frame files are kept. The Docker image in this repository already contains both; see [ugoira configuration](docs/CONFIG.md#pixiv-动图ugoira) (Chinese).

</details>

<details>
<summary>Command cheat sheet</summary>

| Task | Command |
| --- | --- |
| Show help | `pixivflow --help` |
| Sign in | `pixivflow login` |
| Download one URL | `pixivflow download --url "<work URL>"` |
| Download from configuration | `pixivflow download` |
| First-time setup wizard | `pixivflow setup` |
| Edit / validate the configuration | `pixivflow config edit` / `pixivflow config validate` |
| Show file locations | `pixivflow dirs` |
| Show download statistics | `pixivflow status` |
| Check environment and connectivity | `pixivflow health` |
| Open the browser interface | `pixivflow web` |
| Start scheduled downloads | `pixivflow scheduler` |
| Expand a topic into tags | `pixivflow topic resolve "<topic>"` |
| Debug the delivery queue | `pixivflow outbox` / `pixivflow delivery` |

</details>

Still stuck? Open an [issue](https://github.com/redtidev1918/PixivFlow/issues) with reproduction steps, your version, your system and sanitized error output. Report vulnerabilities as described in the [security policy](SECURITY.en.md).

## Documentation

| What you want to know | Guide |
| --- | --- |
| Complete walkthrough | [Quick start](docs/en/QUICKSTART.md) |
| Packages and download options | [Download page](docs/en/download.md) |
| Login and credential maintenance | [Login guide](docs/en/LOGIN.md) |
| Every download mode and option | [Usage](docs/en/USAGE.md) · [Configuration](docs/en/CONFIG.md) |
| Browser interface | [WebUI guide](docs/en/WEBUI.md) |
| Server and container deployment | [Docker guide](docs/DOCKER.md) (Chinese) · [Termux](docs/TERMUX_INSTALL.md) (Chinese) |
| Delivery to another service | [Gateway delivery](docs/GATEWAY.md) (Chinese) |
| Operational notifications | [Apprise](docs/APPRISE.md) (Chinese) |
| Upgrading from an older version | [Migration](docs/MIGRATION.md) (Chinese) · [Changelog](CHANGELOG.md) |
| Architecture and troubleshooting | [Architecture](docs/ARCHITECTURE.md) (Chinese) · [Schedule outcomes](docs/SLOT_OUTCOME.md) (Chinese) |
| npm release process | [Releasing](docs/RELEASING.md) (Chinese) |

## Related projects

- [TelePost](https://github.com/redtidev1918/TelePost) — Telegram submission, review and publishing
- [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy) — deployment bundle that wires the two together
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) — browser interface frontend
- [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) — desktop client

Division of responsibility: PixivFlow handles Pixiv authentication, candidate discovery and downloading; TelePost handles submission and review on the Telegram side; the deployment bundle connects them.

## Acknowledgements

- [gallery-dl](https://github.com/mikf/gallery-dl) — reference for ugoira and novel text handling
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) — App API endpoint semantics
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) — OAuth login flow reference
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) — login library

This project is not affiliated with Pixiv Inc. See [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md) for the full notice.

## License

[MIT](LICENSE)
