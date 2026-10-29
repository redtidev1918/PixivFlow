# Docker deployment

Language: [中文](../DOCKER.md) · English

Use Docker Compose V2 to run PixivFlow on a server or NAS. The image is built from this repository; there is no official registry image to pull. For a native installation, see [Quick start](QUICKSTART.md). For the TelePost production topology, use the [deployment suite](https://github.com/redtidev1918/pixivflow-telepost-deploy).

## Services and persistent files

The root `docker-compose.yml` defines two services sharing the locally built `pixivflow:latest` image:

| Service | Command | Health check | Port |
| --- | --- | --- | --- |
| `pixivflow` | `node dist/index.js scheduler` | Database file exists | None |
| `pixivflow-webui` | `node dist/webui/index.js` | `/api/health` (`/health` is an alias) | `${WEBUI_PORT:-3000}:3000` |

Both use `restart: unless-stopped`. The WebUI waits for the scheduler service to become healthy through `depends_on`. Remove that dependency if you need to operate the WebUI independently.

| Host directory | Container directory | Access |
| --- | --- | --- |
| `./config` | `/app/config` | Read only |
| `./data` | `/app/data` | Read/write: SQLite and logs |
| `./downloads` | `/app/downloads` | Read/write: downloaded artifacts |

The read-only config mount prevents edits through the WebUI. On the host, atomically replace the config to reload cron, targets, delivery and download settings:

```bash
cp /path/to/new-config.json config/standalone.config.json.new
mv config/standalone.config.json.new config/standalone.config.json
```

Changes to `pixiv`, `network` or `storage` require `docker compose restart pixivflow`.

## Build and start

Install Docker Engine and the Compose V2 plugin, then clone this repository. The Dockerfile uses frontend source already present in `webui-frontend/`, or shallow-clones the official [frontend repository](https://github.com/redtidev1918/pixivflow-webui). The build therefore needs GitHub access unless the source is already available.

```bash
docker compose version
mkdir -p data downloads
cp docker-env.example .env
cp config/examples/standalone.config.simple.json config/standalone.config.json
```

Set a valid token in `.env` before downloading:

```env
TZ=Asia/Shanghai
PIXIV_REFRESH_TOKEN=YOUR_REFRESH_TOKEN
# If your proxy runs on the Docker host:
HTTP_PROXY=http://host.docker.internal:6152
HTTPS_PROXY=http://host.docker.internal:6152
```

Edit `targets` in the config. The simple template disables scheduling; enable `scheduler.enabled`, set cron and timezone when ready. Environment credentials override `pixiv.refreshToken`, so the JSON may keep its placeholder.

```bash
docker compose up -d pixivflow
docker compose ps
docker compose logs -f pixivflow
docker compose exec pixivflow ls /app/data
```

The first start builds the image. A database-file health check does **not** prove authentication works. Check the logs for authentication failures and confirm downloads appear on the host after a run.

For an offline/API-only build:

```bash
# Optional: provide frontend source yourself before building.
git clone https://github.com/redtidev1918/pixivflow-webui.git webui-frontend
# Or omit the frontend entirely:
docker compose build --build-arg SKIP_WEBUI_BUILD=true
```

A scheduler-only image always compiles the current source tree:

```bash
docker build -f Dockerfile.scheduler \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  -t pixivflow-scheduler:local .
```

Before declaring a production deployment verified, compare the image's `org.opencontainers.image.revision` with the container's `PIXIVFLOW_REVISION` and the intended release commit.

## Enable the browser interface

Set **both** `WEBUI_USERNAME` and `WEBUI_PASSWORD` in `.env`, then start:

```bash
docker compose up -d pixivflow-webui
```

Open `http://localhost:3000`. Set `WEBUI_PORT=8080` in `.env` and recreate the container to change the host port. The container still listens on 3000. `PORT`, `HOST` and `STATIC_PATH` are fixed in Compose's `environment` block, which overrides values in `env_file`.

Basic Auth protects static files, APIs and Socket.IO; `/api/health` remains available for health checks. Public binding without credentials is refused by default. `WEBUI_ALLOW_PUBLIC_NO_AUTH` is an explicit escape hatch, not a secure deployment setting. For remote access, use authentication and TLS, either in the server or a reverse proxy. Bundled frontend files are under `/app/webui-frontend/dist`.

## Novel export (Markdown / EPUB / PDF)

With `novelExport` enabled (or `download --formats epub`), EPUB generation is pure Node.js and works out of the box in Docker; PDF relies on Chromium:

- **Full image (`Dockerfile`, Alpine)**: Chromium and Noto CJK fonts are bundled; add `PIXIVFLOW_PDF_BROWSER=/usr/bin/chromium-browser` to `.env` (or set `novelExport.pdf.browserPath`) and PDF works — Chinese/Japanese typesetting needs no extra setup. The image runs as root by default and Chromium refuses its sandbox under root, so PDF renders launch that one browser with `--no-sandbox` (the CI "Full image (Alpine) CJK PDF" job exercises this exact path with the bundled Chromium); with a non-root container user the sandbox is always enabled.
- **Scheduler image (`Dockerfile.scheduler`, Debian slim)**: intentionally lightweight, no Chromium. For PDF, mount a browser executable and a CJK font into the container and point `PIXIVFLOW_PDF_BROWSER` / `PIXIVFLOW_PDF_FONT` (or `novelExport.pdf.*`) at the in-container paths; EPUB-only export is unaffected.
- A missing browser reports `PDF_BROWSER_MISSING` and missing CJK fonts report `PDF_CJK_FONT_MISSING` — both explicit errors that never affect TXT download, EPUB export or delivery. Field semantics: see the "Novel export" section in [CONFIG](CONFIG.md).

## Login and credentials

Compose sets `PIXIV_SKIP_AUTO_LOGIN=true`. Obtain a refresh token outside the container rather than relying on unattended browser login. The login adapter order is pixiv-token-getter → Puppeteer → Python gppt.

```bash
# A computer with Chrome/Chromium:
pixivflow login
# Headless alternative, subject to Pixiv challenges and browser availability:
pixivflow login-headless -u USERNAME -p PASSWORD
# Validate and store an existing token in a chosen file:
pixivflow refresh <refresh_token> --config "$(pwd)/config/standalone.config.json"
```

Put the token in `.env` (`PIXIV_REFRESH_TOKEN`) and recreate containers, or set `pixiv.refreshToken` in the host config and restart the scheduler. Client ID and client secret have built-in defaults. See [Login](LOGIN.md) for platform limitations and token renewal.

Treat refresh tokens like passwords. Do not share login output or commit credentials. `.env` is excluded from Git and Docker build context. If a token leaks, revoke it through your Pixiv account and replace stored copies.

## Environment reference

| Variable | Meaning/default |
| --- | --- |
| `TZ` | Container timezone, `Asia/Shanghai` |
| `WEBUI_PORT` | Host port, `3000` |
| `WEBUI_USERNAME` / `WEBUI_PASSWORD` | Both required for Basic Auth |
| `WEBUI_TLS_CERT` / `WEBUI_TLS_KEY` | Both required for HTTPS; files must be readable inside the container. Providing only one rejects startup |
| `PORT` / `HOST` / `STATIC_PATH` | Compose fixes these to `3000`, `0.0.0.0`, `/app/webui-frontend/dist` |
| `PIXIV_DOWNLOADER_CONFIG` | Explicit config path, from the container's perspective |
| `PIXIV_DATABASE_PATH` | `/app/data/pixiv-downloader.db` |
| `PIXIV_DOWNLOAD_DIR` | `/app/downloads` |
| `PIXIV_ILLUSTRATION_DIR` / `PIXIV_NOVEL_DIR` | `/app/downloads/illustrations` and `/app/downloads/novels` |
| `PIXIV_LOG_LEVEL` | `debug`, `info`, `warn`, `error`; default `info` |
| `PIXIV_DB_CACHE_KB` | SQLite cache, 1024–65536 KiB; default 8192 |
| `PIXIV_SCHEDULER_ENABLED` | Scheduler switch, default `true` in Compose |
| `PIXIV_SKIP_AUTO_LOGIN` | Fixed to `true` in Compose |
| `PIXIV_REFRESH_TOKEN` / `PIXIV_CLIENT_ID` / `PIXIV_CLIENT_SECRET` | Optional credential overrides |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | Proxy URLs; lowercase forms also supported |

Proxy selection is `all_proxy` > `https_proxy` > `http_proxy`, and is used only if the config has not already enabled `network.proxy`. HTTP and SOCKS addresses are supported. On Docker Desktop use `host.docker.internal`; the Compose `host-gateway` mapping also supports Linux. Linux's default bridge may use `172.17.0.1`. A host proxy bound only to `127.0.0.1` cannot accept container connections: bind it to the bridge or an appropriate reachable interface.

## Resource limits

The Chinese guide records a topic-mode benchmark on a 256 MB Linux cgroup/Fly machine with `NODE_OPTIONS=--max-old-space-size=128`: topic discovery, filtering/ranking and an illustration+novel schedule completed at approximately 106 MB total peak RSS and 33 MB peak JS heap, without OOM or restarts. These are measured scenarios, not a guarantee for arbitrary workloads. Bounded tags, sampling and candidate pools keep discovery memory limited. Use `docker stats` to observe your deployment; resource-limit examples are in Compose's `deploy.resources` section.

## Backup, upgrade and rollback

Persistent state includes the config, `data/pixiv-downloader.db`, `data/pixiv-downloader.log`, unified token storage (`data/.pixiv-refresh-token` and its backup), and downloads. Stop all writers before taking a filesystem backup:

```bash
docker compose stop pixivflow pixivflow-webui
tar -czf pixivflow-backup-$(date +%Y%m%d).tar.gz data/ config/ downloads/
docker compose start pixivflow pixivflow-webui
```

Upgrade by rebuilding from updated source, including frontend source if maintained locally:

```bash
git pull
docker compose build
docker compose up -d
```

Back up first and review config changes. There is no database downgrade tool. To roll back, restore the matching backup rather than opening a newer schema with old code:

```bash
docker compose down
git checkout vX.Y.Z
docker compose build
tar -xzf pixivflow-backup-YYYYMMDD.tar.gz
docker compose up -d
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Repeated restarts | `docker compose logs pixivflow`; invalid JSON, missing targets or credentials can terminate startup |
| Scheduler unhealthy | Allow the 40-second start period; check DB creation and writable `./data` |
| WebUI unhealthy but visible | Inspect health-check logs and request `/api/health`; the initial start period is normal |
| Zero downloads | Dates, bookmarks, limits, tags and token validity; use `PIXIV_LOG_LEVEL=debug` |
| Pixiv unreachable | Proxy precedence, configured proxy conflicts, container-to-host connectivity |
| Blank page or 502 | Service status, port mapping, `[WebUI] STATIC_PATH` and `index.html`, reverse proxy destination |
| HTTP 401 | Replace the token and restart/recreate as appropriate |
| Wrong times | `TZ` controls container time; `scheduler.timezone` controls cron interpretation |

```bash
docker compose ps
docker compose logs --tail 100 pixivflow
docker stats pixivflow pixivflow-webui
docker inspect --format '{{json .State.Health.Log}}' pixivflow-webui
curl http://localhost:${WEBUI_PORT:-3000}/api/health
```

Related: [Configuration](CONFIG.md), [Usage](USAGE.md), [WebUI](WEBUI.md), [Apprise](APPRISE.md).
