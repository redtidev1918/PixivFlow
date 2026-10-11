# WebUI guide

The WebUI is PixivFlow's browser interface and an optional entry point. Everything the CLI does is available on the command line; the interface makes it easier to watch progress, manage download tasks and fetch a link without editing the configuration.

The frontend source lives in the [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) repository. The npm package already ships the built static files, so there is nothing extra to install.

## Starting it

```bash
pixivflow web
```

It listens on `http://localhost:3000` by default and prints the address in the terminal. Keep the command running while you use the interface and press `Ctrl+C` to stop it.

| What you need | Command |
| --- | --- |
| Use another port | `pixivflow web --port 8080` |
| Use a specific configuration file | `pixivflow web --config "/path/to/my config.json"` |
| Bind another interface | `pixivflow web --host 0.0.0.0` (configure credentials first, see below) |
| Use a custom static bundle | `pixivflow web --static-path ./webui-frontend/dist` |

Config path precedence is `--config` > `PIXIV_DOWNLOADER_CONFIG` > default. Relative paths use the command's working directory; quote paths containing spaces. Missing explicit files and invalid JSON are errors, with no silent fallback. The WebUI, API, download tasks and scheduler modules share the selected file. The environment variable also applies to other CLI commands.

## What each page does

| Page | What you can do |
| --- | --- |
| Dashboard | Download counters and recent activity |
| Download tasks | Start, stop and inspect download tasks, plus the directories works are saved to |
| URL download | Paste one or many URLs and download them without touching the configuration |
| Scheduler | Read-only view of recent schedule runs with per-target status and terminal reason |
| Download history | Browse past task records |
| Configuration | View and edit the configuration; secret fields are masked by the server |
| Logs | Follow the runtime log |
| File browser | Browse downloaded files |

The Scheduler distinguishes no configured plans, disabled plans and plans with no execution records. These are healthy empty states and do not require Pixiv login. Real configuration, API and database failures still appear as errors.

## Screenshots

URL download: paste a work URL, or one URL per line for a batch.

![URL download](../assets/readme/webui-url-download.en.png)

Download tasks: start, stop and inspect tasks, with the illustration and novel directories shown.

![Download tasks](../assets/readme/webui-download-tasks.en.png)

Dashboard: download counters and recent activity.

![Dashboard](../assets/readme/webui-dashboard.en.png)

## Network access and security

- By default the server listens on `localhost` only, so only browsers on the same machine can reach it.
- To reach it from another device, set `WEBUI_USERNAME` and `WEBUI_PASSWORD` to enable HTTP Basic Auth:

  ```bash
  WEBUI_USERNAME=admin WEBUI_PASSWORD='choose-a-strong-password' pixivflow web --host 0.0.0.0
  ```

- Binding to a non-loopback address without credentials makes the server refuse to start (fail-closed). It only runs unauthenticated when you explicitly set `WEBUI_ALLOW_PUBLIC_NO_AUTH=true`, and it shows a security warning in that case. Anyone who can reach the port can then read the configuration, download files and start downloads, so do not use that mode on an untrusted network.
- For HTTPS, set both `WEBUI_TLS_CERT` and `WEBUI_TLS_KEY`.
- Secret fields in the configuration (such as `clientSecret` and `refreshToken`) are masked by the server before they reach the browser.

## How it relates to the other entry points

The WebUI and the CLI share one configuration file and one local database. Download tasks started in the interface use the same download and scheduling logic as `pixivflow download`, so nothing is tracked twice.

The interface is only available while `pixivflow web` is running. To keep it online on a server or NAS, see the [Docker deployment guide](DOCKER.md). Proxies and network settings are covered in the [configuration reference](CONFIG.md).

## Frontend development and further reading

This repository ships only the built frontend in `webui-frontend/dist`. The source, component structure and build process live in [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui):

- [WebUI documentation site](https://redtidev1918.github.io/pixivflow-webui/)
- [Development guide](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/DEVELOPMENT_GUIDE.md) · [Component guide](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/COMPONENT_GUIDE.md) · [Build options](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/BUILD_OPTIONS.md)
- REST endpoints and Socket.IO events: [WebUI API](API.md)
