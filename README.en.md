# PixivFlow

Language / 语言: [中文](README.md) · English

**Save Pixiv illustrations, manga, novels and animations locally, collect works with filters, or download on a schedule.**

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

- Download links to works, novel series and artist profiles.
- Collect illustrations or novels by tags, rankings, publication dates and bookmark counts.
- Set a download schedule and skip works already in your download history.
- View download records and scheduled task status in your browser.

Downloaded files stay on your computer by default. Follow the steps below to save your first work, then set up batch or scheduled downloads when you need them.

[Get started](#get-started) · [Batch downloads](#batch-downloads) · [Scheduled downloads](#scheduled-downloads) · [Common questions](#common-questions) · [Full documentation](https://redtidev1918.github.io/PixivFlow/)

## Choose how to use it

| How you want to use PixivFlow | Where to start |
| --- | --- |
| Use a desktop client | See the [desktop client setup and usage instructions](https://github.com/redtidev1918/pixivflow-desktop) |
| Enter commands in a terminal | Follow the four steps below to download a work; the installation also includes a browser interface |
| Keep it running on a server | See the [Docker guide](docs/DOCKER.md) |
| Run it on Android | See the [Termux guide](docs/TERMUX_INSTALL.md) |

## Get started

These steps use the command-line version. Open PowerShell on Windows or a terminal on macOS / Linux. Copy each command into it and press Enter.

To download a single work, you only need these four steps.

### 1. Install

Have a Pixiv account ready and check that your computer can reach Pixiv. Install [Node.js](https://nodejs.org/) 22.13 or newer; it comes with npm, which must be version 9 or newer.

After installing Node.js, reopen your terminal. Check the versions with the first two commands, then install PixivFlow:

```bash
node -v
npm -v
npm install -g pixivflow
pixivflow --help
```

If `pixivflow --help` displays the command help, installation succeeded.

### 2. Sign in to Pixiv

Install Chrome or Chromium on your computer. Run this command, then follow the prompts to sign in to your Pixiv account:

```bash
pixivflow login
```

After sign-in, credentials are saved locally and reused for downloads. See the [login guide](docs/en/LOGIN.md) for server login and importing an existing login token. Configuration files contain credentials; remove sensitive information before sharing them for help.

### 3. Download your first work

Open the work you want to save on Pixiv and copy its URL from the browser address bar. Replace the example URL below, keeping the double quotes:

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

You can download a novel too:

```bash
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=12345678"
```

`--url` also accepts novel series and artist profile links. See the [usage guide](docs/en/USAGE.md) for more examples.

### 4. Find your files

When the download command finishes, run:

```bash
pixivflow dirs
```

Find the illustration or novel directory in the output and open that path in your file manager to see the downloaded files. Storage locations depend on your installation; use the paths shown by this command.

To save another work, run the download command again with its URL. Run `pixivflow status` to see download counts and recent records.

## Use it in your browser

After installing the command-line version, run:

```bash
pixivflow web
```

Open the address shown in your terminal, normally [http://localhost:3000](http://localhost:3000). The npm package includes the browser interface.

You can inspect download records, configuration and task results in the scheduling center. Per-target statuses and reasons help explain why a run found no new works.

Keep the command running while using the interface; press `Ctrl+C` to stop the web service. If the port is occupied, choose another one:

```bash
pixivflow web --port 8080
```

## Batch downloads

To collect several works at once, choose tags, bookmark counts or publication dates. For example, you can collect up to 10 illustrations tagged “風景” per run. For initial setup, run the wizard and follow its prompts:

```bash
pixivflow setup
```

After setup, run `pixivflow download` to start collecting. Previously downloaded works are skipped, so you may receive fewer new works than the limit you set.

<details>
<summary>Set collection rules manually: illustration and novel examples</summary>

If you already have a configuration, back it up and edit it:

```bash
pixivflow config backup
pixivflow config edit
```

Replace `targets` in your active configuration with the array below, keeping your credentials and other fields. This fragment downloads up to 10 illustrations and 5 novels per run:

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 10 },
    { "type": "novel", "tag": "ファンタジー", "limit": 5 }
  ]
}
```

Save, check your configuration, then download:

```bash
pixivflow config validate
pixivflow download
```

| Setting | Meaning |
| --- | --- |
| `type` | `illustration` for illustrations / manga; `novel` for novels |
| `tag` | A Pixiv search tag; try a tag already shown on a work page |
| `limit` | Maximum number of works to download per run |
| `minBookmarks` | Minimum bookmark count, for filtering popular works |
| `startDate` / `endDate` | Publication date range, in `YYYY-MM-DD` format |

</details>

See the [batch download walkthrough](docs/en/QUICKSTART.md#download-by-tag) for more examples and the [configuration reference](docs/en/CONFIG.md) for all filters.

## Scheduled downloads

To collect works automatically each day, configure a schedule in the `pixivflow setup` wizard. Check that batch downloads work first, then start:

```bash
pixivflow scheduler
```

Keep your computer and this command running; press `Ctrl+C` to stop. Downloads cannot run while the computer is shut down or asleep.

<details>
<summary>Set a time manually: every day at 03:00 in Asia/Shanghai</summary>

Set `scheduler` in your active configuration:

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

Merge this fragment into your existing configuration, save and validate it, then start:

```bash
pixivflow config validate
pixivflow scheduler
```

</details>

See the [scheduled download walkthrough](docs/en/QUICKSTART.md#set-a-download-schedule) for the full steps. For continuous server operation, see the [Docker guide](docs/DOCKER.md).

<details>
<summary>Command reference</summary>

| What you want to do | Command |
| --- | --- |
| Show help | `pixivflow --help` |
| Sign in | `pixivflow login` |
| Download a link | `pixivflow download --url "<work URL>"` |
| Download configured targets | `pixivflow download` |
| Run the initial setup wizard | `pixivflow setup` |
| Edit / check configuration | `pixivflow config edit` / `pixivflow config validate` |
| Find file locations | `pixivflow dirs` |
| View download statistics | `pixivflow status` |
| Check environment and connectivity | `pixivflow health` |
| Open the browser interface | `pixivflow web` |
| Start scheduled downloads | `pixivflow scheduler` |

</details>

## Common questions

| Problem | What to try |
| --- | --- |
| `pixivflow` command not found | Reopen your terminal, confirm global installation succeeded, and check that the npm global executable directory is in `PATH` |
| Login fails or credentials have expired | Run `pixivflow login` again; see the [login guide](docs/en/LOGIN.md) for alternatives |
| Cannot connect to Pixiv | Run `pixivflow health`; see the network section of the [configuration reference](docs/en/CONFIG.md) if you need a proxy |
| No works were downloaded | Check tags, dates and bookmark filters; matching works may already be in your download history |
| Cannot find downloaded files | Run `pixivflow dirs` for actual locations |
| Missing dependencies for animations | Converting ugoira to GIF needs `python3` and `ffmpeg`; the official Docker image includes both. See the [configuration reference](docs/en/CONFIG.md) |
| A scheduled task did not run | Keep the program running, set `scheduler.enabled` to `true`, and check the schedule expression and time zone |

For further help, open an [issue](https://github.com/redtidev1918/PixivFlow/issues) with reproduction steps, version, operating system and sanitized error output. Report security vulnerabilities as described in the [security policy](SECURITY.en.md).

## More guides

| What you want to learn | Documentation |
| --- | --- |
| Complete setup walkthrough | [Quick start](docs/en/QUICKSTART.md) |
| Packages and download options | [Download page](docs/en/download.md) |
| Login and credential maintenance | [Login guide](docs/en/LOGIN.md) |
| Download modes and settings | [Usage guide](docs/en/USAGE.md) · [Configuration reference](docs/en/CONFIG.md) |
| Server / container deployment | [Docker](docs/DOCKER.md) |
| Send works to another service | [External gateway guide](docs/GATEWAY.md) · [Configuration reference](docs/en/CONFIG.md) |
| Configure operational notifications | [Apprise notifications](docs/APPRISE.md) |
| Upgrade from an older version | [Migration guide](docs/MIGRATION.md) · [Changelog](CHANGELOG.md) |

<details>
<summary>Service integration and developer documentation</summary>

Local storage uses `persistent` mode by default. With `cache` delivery configured, files can be removed after the receiving service confirms success. Read the [configuration reference](docs/en/CONFIG.md) first to choose the storage behavior you want.

For Telegram submission, review and publishing, you can connect [TelePost](https://github.com/redtidev1918/TelePost). See the [deployment kit](https://github.com/redtidev1918/pixivflow-telepost-deploy) to run both projects together.

- [Project architecture](docs/ARCHITECTURE.md)
- [Delivery, retries and gateway contracts](docs/architecture/delivery-runtime.md)
- [Workflow Protocol v1 and Job API](https://github.com/redtidev1918/pixivflow-telepost-deploy/blob/main/docs/architecture/workflow-protocol.md)
- [npm release process](docs/RELEASING.md)
- [WebUI frontend project](https://github.com/redtidev1918/pixivflow-webui)

Build from source:

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
node dist/index.js --help
```

</details>

## Acknowledgments

- [gallery-dl](https://github.com/mikf/gallery-dl) — reference for ugoira and novel text handling
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) — App API endpoint semantics
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) — OAuth login flow reference
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) — login library
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) — WebUI frontend
- [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) — official desktop client

Not affiliated with Pixiv Inc. Full statement: [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md).

## License

[MIT](LICENSE)
