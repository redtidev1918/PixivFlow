# PixivFlow documentation

Language: [中文](../README.md) · English

Start with [Quick start](QUICKSTART.md) to download one work. If downloads already work, use the task index below.

## Find a guide

| What you want to do | Guide |
| --- | --- |
| Install and download your first work | [Quick start](QUICKSTART.md) · [Download page](download.md) |
| Sign in, import a token or resolve authentication failures | [Login](LOGIN.md) |
| Collect by tag, ranking, topic or artist | [Features and commands](USAGE.md) |
| Change limits, dates, bookmarks, directories or proxies | [Configuration](CONFIG.md) · [Examples](https://github.com/redtidev1918/PixivFlow/tree/master/config/examples) |
| Run scheduled downloads on a server or NAS | [Docker](../DOCKER.md) (Chinese) |
| Run on Android | [Termux](../TERMUX_INSTALL.md) (Chinese) |
| Send works to QQ, Feishu or your own service | [Gateway delivery](../GATEWAY.md) (Chinese) |
| Receive operational notifications | [Apprise](../APPRISE.md) (Chinese) |
| Migrate from v1 scripts to the CLI | [Migration](../MIGRATION.md) (Chinese) |

## File locations and the browser interface

```bash
pixivflow dirs
pixivflow web
```

`dirs` shows the active configuration and download paths. `web` starts the browser interface at the address shown in the terminal, normally `http://localhost:3000`. The scheduling center shows the status and reason for each download target.

See the [desktop client documentation](https://redtidev1918.github.io/pixivflow-desktop/) for desktop installation and troubleshooting.

## Advanced use

The following guides are in Chinese:

| Guide | Contents |
| --- | --- |
| [Tag space and ranking](../TAG_RANKING.md) | Tag sources, scoring and candidate diagnostics |
| [Gateway contract](../GATEWAY_CONTRACT.md) | Message format, signing, responses and pairing |
| [Reference gateway](https://github.com/redtidev1918/PixivFlow/tree/master/examples/gateway) | A runnable gateway example |
| [Helper scripts](../SCRIPTS.md) | Script purposes and arguments |

<details>
<summary>Development, architecture and service integration</summary>

| Guide | Contents |
| --- | --- |
| [WebUI API](API.md) | REST endpoints and Socket.IO events |
| [Pixiv Client Kit](PIXIV_CLIENT_KIT.md) | Reusable Pixiv App API client |
| [Architecture](../ARCHITECTURE.md) (Chinese) | Modules, download pipeline and storage |
| [Observability](../OBSERVABILITY.md) (Chinese) | Logs, metrics and alerts |
| [Schedule outcomes](../SLOT_OUTCOME.md) (Chinese) | Result types and terminal states |
| [Architecture index](../architecture/README.md) (Chinese) | Design documents and governance |
| [Releasing](../RELEASING.md) (Chinese) | Versions and npm publication |

The frontend source is in [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui). Contributor guidance is in [CONTRIBUTING](https://github.com/redtidev1918/PixivFlow/blob/master/CONTRIBUTING.md).

</details>

## Feedback and project links

Open an [issue](https://github.com/redtidev1918/PixivFlow/issues) with reproduction steps and sanitized error output. Report vulnerabilities as described in the [security policy](https://github.com/redtidev1918/PixivFlow/blob/master/SECURITY.en.md).

[Repository](https://github.com/redtidev1918/PixivFlow) · [Releases](https://github.com/redtidev1918/PixivFlow/releases) · [Changelog](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md) · [npm package](https://www.npmjs.com/package/pixivflow)
