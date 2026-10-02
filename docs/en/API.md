# PixivFlow API Documentation

This document lists every REST endpoint exposed by the PixivFlow WebUI server and the Socket.IO events used for live log streaming. Endpoints are grouped by route prefix (`/api/auth`, `/api/config`, `/api/download`, `/api/stats`, `/api/logs`, `/api/files`, `/api/gateways`, `/api/deliveries`, `/api/scheduler`, `/admin/*`, plus `GET /api/health`, `GET /api/status`, `GET /api/version`) with request/response examples. It also explains how to start the server, the error-code convention, and why the API has no authentication layer. All shapes are taken from the handler source code in `src/webui/routes/handlers/`.

It is written for developers calling the WebUI HTTP interface directly (frontend development, script integration, container health checks). Examples are distilled from the source in `src/webui/websocket/` and `src/webui/routes/`; uncertain fields are described conservatively — the source code is the authority.

## Startup & basics

- Local start: `pixivflow web` (alias `pixivflow w`); **production default port 3000** (`PORTS.PROD_API = 3000` in `src/webui/ports.ts`; the dev backend also uses 3000). Available options and equivalent environment variables:

| Source | Description |
| --- | --- |
| `--port <n>` / `PORT` | Listen port, default 3000; startup fails if the port is taken (`EADDRINUSE`) |
| `--host <h>` / `HOST` | Listen address, default `localhost` |
| `--static-path <dir>` / `STATIC_PATH` | Frontend build output directory (must contain `index.html`); when omitted, `webui-frontend/dist` is auto-detected — if not found, only the API is served |

- Docker start: `docker-compose up -d pixivflow-webui` (service definition in the root `docker-compose.yml`: internal `PORT=3000`, `HOST=0.0.0.0`, `STATIC_PATH=/app/webui-frontend/dist`, host port `${WEBUI_PORT:-3000}:3000`).

```bash
# Health check
curl http://localhost:3000/api/health
```

```json
{ "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z" }
```

When no static directory is configured, `GET /` returns JSON listing all API prefixes and the version. With a static directory configured, non-`/api` paths fall back to the SPA `index.html`; therefore the server also registers the alias **`GET /health`** (same response as `/api/health`) so container health checks and reverse proxies can probe API availability directly without relying on the SPA fallback path.

When the port is taken, the default is to error out; setting `PIXIV_WEBUI_AUTO_PORT=true` makes it automatically switch to the next free port and log the actual port.

## Authentication notes

**The REST API has no authentication by default**: no login state, API key, or JWT middleware is mounted on the route groups — any client that can reach the port can call them. The `/api/auth/*` group manages the **Pixiv account's OAuth tokens** (acquiring/validating/clearing refresh tokens) and is unrelated to protecting this API. For deployment, rely on port binding for access control (local default `localhost`; inside the Docker image `0.0.0.0`, exposure decided by port mapping); CORS is open by default (`origin: '*'`).

**Optional Basic Auth (since 2.4.0)**: when both `WEBUI_USERNAME` and `WEBUI_PASSWORD` are set, all requests (including static pages and Socket.IO handshakes) require HTTP Basic auth except health probes and Runtime Contract probes (`/api/health`, `/health`, `/api/status`, `/status`, `/api/version`, `/version`). Unset keeps the no-auth behavior. For public deployments, a reverse proxy with TLS is still recommended.

Endpoints involved in the Pixiv login flow: `GET /api/auth/status` checks whether the token is valid → `POST /api/auth/login` (the backend launches the system browser to complete authorization) or `POST /api/auth/login-with-token` (existing refresh token) → afterwards `POST /api/auth/refresh` refreshes and `POST /api/auth/logout` clears at any time.

**In-host login (added in F4.1, for runtimes with their own window such as desktop hosts)**: `POST /api/auth/login/host/start` returns `authUrl` (with PKCE challenge) and `redirectUri`; the **caller's own window** loads the authorization page and watches for the redirect; after capturing the callback URL, `POST /api/auth/login/host/complete` submits `loginId` + `code` (or the whole `callbackUrl`) to exchange for tokens. The PKCE `code_verifier` stays on the backend throughout and never passes through the caller. Suitable for hosts like Tauri/WKWebView that puppeteer cannot drive.

## REST endpoints

The endpoints below are grouped by route prefix and correspond to all route groups mounted in `src/webui/server/server-routes.ts` (endpoint counts evolve with releases — the source is authoritative). Convention: most responses carry an `errorCode` field (enum in `src/webui/utils/error-codes.ts`); a few handlers still return HTTP 200 on validation failure and express the result via `data.success: false` — marked where applicable.

### GET /api/health (alias `/health`)

Unconditionally returns `{"status":"ok","timestamp":"<ISO time>"}` with no resource checks.

### Runtime Contract group: `/api/status`, `/api/version` (aliases `/status`, `/version`)

Probe endpoints of the ecosystem Runtime Contract (new, append-only, non-sensitive — for CLI/WebUI/Desktop/Docker to uniformly probe process state and version). Both `/api/…` and `/…` dual-path aliases are registered, consistent with the health check; payloads contain no download lists, tokens, or configuration. The version comes from the identity authority `package.json` (not the potentially lagging generated file `src/version.ts`).

`GET /api/status` (sample response — always check the latest release for the version number):

```json
{
  "schemaVersion": 1,
  "state": "ok",
  "pid": 12345,
  "startedAt": "2026-09-26T00:00:00.000Z",
  "uptimeSec": 42,
  "version": "3.6.0"
}
```

`GET /api/version`:

```json
{ "schemaVersion": 1, "name": "pixivflow", "version": "3.6.0" }
```

With Basic Auth enabled, these two endpoints share the default exemption paths with the health check; if ops customizes `exemptPaths`, the new endpoints require auth by default (safer — exempt them explicitly as needed).

### Auth group: `/api/auth`

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| GET | `/status` | Auth status: reads the refresh token from config and actually calls Pixiv to validate it | none |
| POST | `/login` | Browser/Puppeteer login to obtain tokens; writes back to the config file on success | body: `username?`, `password?`, `headless` (default true), `proxy?`; username/password required in headless mode |
| POST | `/refresh` | Refresh the access token; if a new refresh token is returned it is written back to config automatically | body: `refreshToken?` (falls back to config file → unified store) |
| POST | `/login-with-token` | Submit a refresh token directly; validated first, then saved | body: `refreshToken` (required) |
| POST | `/login/host/start` | In-host login step 1: create a PKCE session and return `authUrl`/`redirectUri` | none |
| POST | `/login/host/complete` | In-host login step 2: exchange the captured authorization code for tokens and write back to config | body: `loginId` (required), `code` or `callbackUrl` (one of the two) |
| POST | `/logout` | Clear tokens from the config file and the unified store | none |

```json
// GET /api/auth/status
{
  "data": {
    "authenticated": true,
    "hasToken": true,
    "tokenValid": true,
    "isAuthenticated": true,
    "user": { "id": "1234567", "name": "<user nickname>" }
  }
}

// POST /api/auth/login-with-token  request body
{ "refreshToken": "<pixiv refresh token>" }
// Success response
{
  "success": true,
  "errorCode": "AUTH_LOGIN_SUCCESS",
  "data": {
    "accessToken": "<access token>",
    "refreshToken": "<refresh token>",
    "expiresIn": 3600,
    "user": { "id": "1234567", "name": "<user nickname>" }
  }
}
```

Errors: `AUTH_USERNAME_PASSWORD_REQUIRED` (400), `AUTH_LOGIN_FAILED` (401), `AUTH_REFRESH_TOKEN_REQUIRED` (400), etc.; the `user` field is non-empty only on successful validation.

### Config group: `/api/config`

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| GET | `/` | Current config (`refreshToken`/`clientSecret` masked as `***`); an active history snapshot is merged and applied first | none; includes `_meta.configPath`, and `_validation` on validation failure |
| PUT | `/` | Update config and write back to file, also auto-saves into history under a date name | body: `StandaloneConfig` subset (JSON); placeholder fields do not overwrite real values |
| POST | `/validate` | Validate a submitted config (attempts to complete tokens from the unified store) | body: full config object |
| GET | `/backup` | Save the current config as `*.backup.<timestamp>.json` | none |
| POST | `/restore` | Overwrite the current config file with a backup | body: `backupPath` (must exist) |
| GET | `/diagnose` | Parse the current config and return stats/warnings/field list | none |
| POST | `/repair` | Auto-repair the config file | body: `createBackup` (default true) |
| GET | `/history` | Config history list | none |
| POST | `/history` | Save a history snapshot | body: `name`, `description?`, `config` |
| GET | `/history/:id` | Single history entry (with full `config_json`) | numeric path id |
| DELETE | `/history/:id` | Delete a history entry | path id |
| POST | `/history/:id/apply` | Apply a history entry to the current config file | path id |
| GET | `/files` | List candidate config files | none |
| POST | `/files/switch` | Switch the config file in use | body: `path` |
| POST | `/files/import` | Import a new config file | body: `config`, `name` |
| DELETE | `/files/:filename` | Delete a config file | path filename (safe filenames only) |
| GET | `/files/:filename/content` | Read a config file's content | path filename |
| PUT | `/files/:filename/content` | Overwrite a config file's content | body: `content` (string) |

```json
// GET /api/config (excerpt)
{
  "data": {
    "logLevel": "info",
    "pixiv": { "refreshToken": "***", "clientSecret": "***" },
    "storage": { "databasePath": "./data/pixiv-downloader.db" },
    "targets": [],
    "_meta": { "configPath": "/app/config/standalone.config.json", "configPathRelative": "config/standalone.config.json" }
  }
}

// POST /api/config/validate  request body and response
{ "logLevel": "info", "targets": [{ "type": "illustration", "tag": "風景", "limit": 10 }] }
→ 200
{ "valid": false, "errors": ["CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED"] }
```

### Download group: `/api/download`

Task mutual exclusion: only one active task at a time; conflicts return **409 + `DOWNLOAD_TASK_ALREADY_RUNNING`**.

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| POST | `/start` | Start a download task (runs in background) | body: `targetId?` (targets index or tag), `config?` (partial config override), `configPaths?` (merge targets from multiple configs) |
| POST | `/stop` | Stop the running task | body: `taskId` |
| GET | `/status` | Task status: in-memory tasks + database history merged; with `taskId` queries one, otherwise returns all | query: `taskId?`; on 404 the error code is wrapped in `data.errorCode` |
| GET | `/logs` | In-memory logs of a single task | query: `taskId` (required), `limit?` |
| GET | `/history` | Database task history (paginated) | query: `page` (default 1), `limit` (default 20), sort/filter params |
| DELETE | `/history/:taskId` | Delete one task history entry | path taskId |
| DELETE | `/history` | Clear all task history | none; returns `deletedCount` |
| POST | `/run-all` | Run all targets (equivalent to `pixivflow download`) | body: `configPaths?` |
| POST | `/random` | Randomly pick a built-in popular tag and download one image/novel | body: `type?` (`illustration` default, or `novel`); response includes the chosen `tag` |
| POST | `/url` | Download a single work by Pixiv URL or bare ID | body: `url` (supports `artworks/`, `novel/show.php?id=`, `illust_id=`, short links `/i/`, etc.) |
| POST | `/batch-url` | Batch download by URL | body: `urls` (non-empty array); response includes validUrls/invalidUrls stats |
| POST | `/parse-url` | Parse a URL only, without triggering a download | body: `url`; parse failure is still HTTP 200 with `data.success:false` |
| GET | `/incomplete` | Incomplete task list (failed/partial in execution_log) | none |
| DELETE | `/incomplete` | Clear incomplete task records | none; returns `deletedCount` |
| DELETE | `/incomplete/:id` | Delete one incomplete task record | numeric path id |
| GET | `/incomplete/test` | Connectivity self-check endpoint | none; returns taskCount and a sample |
| POST | `/resume` | Re-run a target by tag+type | body: `tag`, `type`; 404 if the target does not exist |

```json
// POST /api/download/start  request body
{ "targetId": "0" }
// Success response
{ "success": true, "taskId": "task_1735689600000", "errorCode": "DOWNLOAD_START_SUCCESS" }

// GET /api/download/status (excerpt)
{
  "data": {
    "activeTask": {
      "taskId": "task_1735689600000",
      "status": "running",
      "startTime": "2025-01-01T00:00:00.000Z",
      "progress": { "current": 3, "total": 10, "message": "已下载 插画 12345 (3/10)" },
      "logs": []
    },
    "allTasks": [],
    "hasActiveTask": true
  }
}
```

Task status values: `running` / `completed` / `failed` / `stopped` (`DownloadTaskManager.TaskStatus`, persisted synchronously to the `task_history` table).

### Stats group: `/api/stats`

| Method | Path | Description | Main params/query |
| --- | --- | --- | --- |
| GET | `/overview` | Overview stats (`data` includes totalDownloads, illustrations, novels, recentDownloads) | none |
| GET | `/downloads` | Download records by time range | query: `period`, supports `7d`/`30d`/`1y`; other values fall back to `7d` |
| GET | `/tags` | Top N by tag | query: `limit` (default 10) |
| GET | `/authors` | Top N by author | query: `limit` (default 10) |

```json
// GET /api/stats/tags?limit=2
{ "data": { "tags": [ { "name": "風景", "count": 128 }, { "name": "オリジナル", "count": 96 } ] } }

// GET /api/stats/downloads?period=30d (excerpt)
{ "data": { "period": "30d", "downloads": 42, "data": [ { "pixiv_id": "123456", "type": "illustration", "tag": "風景", "title": "...", "file_path": "...", "downloaded_at": "2025-01-01T00:00:00.000Z" } ] } }
```

### Logs group: `/api/logs`

| Method | Path | Description | Main params/query |
| --- | --- | --- | --- |
| GET | `/` | Read log file text lines, paginated | query: `page` (default 1), `limit` (default 100), `level?` (matches lines by `[LEVEL]` substring), `search?` (case-insensitive substring) |
| DELETE | `/` | Clear the log file (truncate to empty) | none |

Log file resolution order: directory of the database's absolute path → working directory `data/pixiv-downloader.log` → project root `data/` → fall back to working directory.

```json
// GET /api/logs?page=1&limit=50&level=error&search=scheduler
{ "data": { "logs": ["[2025-01-01T00:00:00.000Z] [ERROR] Scheduled Pixiv download job failed ..."], "total": 1, "page": 1, "limit": 50 } }
```

### Files group: `/api/files`

Endpoints involving relative paths all do directory-traversal checks (the joined path must stay inside the illustration/novel base directories). `type` is `illustration` (default) or `novel`.

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| GET | `/recent` | Recent download records (database), each checked for file existence | query: `limit` (default 50), `type?`, `filter?` (`today`/`yesterday`/`last7days`/`last30days`) |
| GET | `/list` | Browse the download directory | query: `path?` (relative subdirectory), `type`, `sort` (`name` default/`time`/`downloadTime`), `order` (`asc`/`desc`) |
| GET | `/preview` | File preview: images returned by MIME, text inlined | query: `path` (required, absolute or relative), `type?` |
| DELETE | `/:id` | Delete a single downloaded file (database record kept) | path id; query: `path?` (relative path), `type?` |
| POST | `/normalize` | Normalize/reorganize files and sync database paths | body: `dryRun?(false)`, `normalizeNames?(true)`, `reorganize?(true)`, `updateDatabase?(true)`, `type?('all')` |
| GET | `/location` | **Only answers where a file/directory is on disk** — opens nothing | query: `path?` (omit for the download directory itself), `type?` (`illustration`) |

```json
// GET /api/files/recent?filter=today&type=illustration (excerpt)
{
  "files": [
    {
      "pixivId": "123456",
      "type": "illustration",
      "tag": "風景",
      "title": "夕日の海",
      "filePath": "/app/downloads/illustrations/123456_夕日の海_1.jpg",
      "author": "<author name>",
      "userId": "7654321",
      "downloadedAt": "2025-01-01T00:00:00.000Z",
      "exists": true,
      "size": 1048576,
      "name": "123456_夕日の海_1.jpg",
      "extension": ".jpg"
    }
  ],
  "total": 1,
  "filter": "today",
  "type": "illustration"
}

// POST /api/files/normalize { "dryRun": true }
{ "data": { "success": true, "result": { "totalFiles": 120, "processedFiles": 118, "movedFiles": 10, "renamedFiles": 4, "updatedDatabase": 0, "errors": [], "skippedFiles": 2 } } }
```

```json
// GET /api/files/location?type=illustration&path=/app/downloads/illustrations/123456_夕日の海_1.jpg
{
  "success": true,
  "path": "/app/downloads/illustrations/123456_夕日の海_1.jpg",
  "directory": "/app/downloads/illustrations",
  "exists": true,
  "isDirectory": false
}

// GET /api/files/location?type=illustration (no path: the download directory itself; exists=false before any download)
{
  "success": true,
  "path": "/app/downloads/illustrations",
  "directory": "/app/downloads/illustrations",
  "exists": false,
  "isDirectory": false
}
```

`GET /api/files/location` **has no side effects**: it does not call `open` / `explorer` / `xdg-open` — it only does path normalization, out-of-bounds rejection, and existence checks. Out-of-bounds (including same-prefix sibling directories like `/downloads-out`) always yields 400 `FILE_PATH_INVALID`; when the file has been deleted it **still returns 200**, honestly reporting `exists: false` — an old record in the history can still "copy path". `directory` is the directory that should be shown in the file manager (parent directory for files, itself for directories); `path` is the original target, so the host can **select** the file rather than just open its folder.

"Show in system file manager" is a capability of the **user's device**, not of this service: desktop hosts use Tauri commands to open it directly on the machine (`open -R` for Finder, `explorer /select,` for Explorer); pure-browser access to a remote deployment has no desktop to open, so the frontend degrades to "copy path". Host capability boundaries: `docs/platform-contract.md` §4.7.

Location queries do not validate Pixiv credentials: a machine with only placeholder tokens in its config can still query the download directory.

Note: the `GET /files/list` response is wrapped in `data` (`{ files, directories, currentPath }`, with file items additionally carrying `downloadedAt`); `GET /files/recent` has no `data` wrapper (`{ files, total, filter, type }`) — frontends should mind the difference.

## Gateways group: `/api/gateways`

Read-only projection: every configured `delivery.targets` entry is treated as a "messaging gateway" in the WebUI.
These endpoints **send no messages** and write no database; delivery itself is still driven by the durable outbox (see
[delivery runtime architecture](../architecture/delivery-runtime.md), Chinese).

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| GET | `/` | List configured gateways with capabilities and delivery counts | none |
| GET | `/:name` | Single gateway detail + recent delivery history | path `name` (`[A-Za-z0-9._-]{1,80}`) |
| GET | `/:name/pairing` | **Passthrough** to the gateway's own pairing endpoint (read-only) | path `name`; the gateway needs `pairingUrl` configured |

```json
// GET /api/gateways (excerpt)
{
  "data": {
    "schemaVersion": 1,
    "pairingSupported": false,
    "gateways": [
      {
        "name": "qq-main",
        "type": "webhook",
        "endpoint": "https://gateway.example/hook",
        "enabled": true,
        "pairingSupported": true,
        "connectionStatus": "connected",
        "connectionUpdatedAt": "2025-01-01T00:00:00.000Z",
        "capabilities": { "type": "webhook", "supported": ["text", "image", "file", "album", "video"] },
        "deliveryCounts": { "pending": 1, "delivered": 42, "duplicate": 0, "failed": 2 }
      }
    ],
    "unconfigured": []
  }
}
```

- `connectionStatus` is one of `unknown` / `unreachable` / `waiting` / `connected` — a **cached projection of the gateway-side pairing
  truth, allowed to be stale**: PixivFlow generates no QR codes and holds no platform login credentials;
  `gateway_connections` rows are just pointers (name / type / endpoint / status / metadata).
  Hence the projection explicitly returns `pairingSupported: false`.
- `endpoint` is always redacted via `redactUrl` (user info and query strings are not echoed); responses contain no token / secret /
  file path / SQL / stack.
- `GET /api/gateways/:name` additionally returns `history[]` (recent deliveries: `status`, `attempts`,
  `lastError`, `createdAt` / `updatedAt` / `deliveredAt`); unknown names return
  `GATEWAY_NOT_FOUND`.
- `unconfigured[]` contains **dangling pointers**: connection rows that exist in the database but no longer have a route in `delivery.targets`
  (usually deleted targets). Exposed explicitly rather than hidden, to aid ops cleanup.
- Failures return `GATEWAY_LIST_FAILED`.

### Pairing passthrough `GET /api/gateways/:name/pairing`

**PixivFlow does not do pairing**: it generates no QR codes, speaks no platform login protocol, holds no session, writes no database. Pairing belongs to
the **gateway process**; the gateway exposes its own HTTP endpoint (`delivery.targets.<name>.pairingUrl` in config),
and PixivFlow only GETs it and hands the answer to the frontend as-is.

The response places the gateway's payload **verbatim** under the `payload` field, adding only provenance on the outside — that is, the response schema is
the **gateway's**, not PixivFlow's:

```json
// GET /api/gateways/qq-main/pairing (excerpt)
{
  "schemaVersion": 1,
  "readOnly": true,
  "fetchedAt": "2025-01-01T00:00:00.000Z",
  "gateway": "qq-main",
  "type": "webhook",
  "endpoint": "http://127.0.0.1:8790/pixivflow/deliver",
  "pairable": true,
  "contentType": "application/json",
  "truncated": false,
  "payload": { "qr": "data:image/png;base64,…", "state": "scan me" }
}
```

Semantic boundaries:

- `pairable` is `true` only when the gateway answers with 2xx; non-2xx passes the gateway's response body through with
  `GATEWAY_PAIRING_UNAVAILABLE` (`pairable:false`) — **never treated as pairing success**.
- Route without `pairingUrl` ⇒ 404 `GATEWAY_PAIRING_UNSUPPORTED` (so the panel shows no dialog instead of
  showing a broken one).
- Redirects are **not followed** by default (`redirect: manual`); following requires explicitly enabling
  `pairingAllowRedirects: true`, because pairing payloads are untrusted input.
- Unset `${ENV}` variables report 502 just like transport failures — the service does not crash.
- A 2-second in-process cache only keeps polling panels from hammering the gateway; **not persisted**, not shared across processes.
- Transport errors are redacted via `redactError`; responses contain no token, path, or stack.

Error codes: `GATEWAY_PAIRING_UNSUPPORTED` (404), `GATEWAY_PAIRING_UNAVAILABLE` (502 or the gateway's
non-2xx), `PAIRING_READ_FAILED` (500), `GATEWAY_NOT_FOUND` (404).

## Deliveries group: `/api/deliveries`

Read-only projection of the delivery ledger, covering **all** gateway routes (not limited to a single target). These endpoints write no database, retry nothing,
cancel nothing: operator retries are audited CLI actions (`pixivflow delivery retry --yes`, recording an
`actor=cli` event); the WebUI only shows facts the ledger has already decided.

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| GET | `/` | Recent delivery intents + per-route counts + all routes from config | query `limit` (1–200, default 25), `status` (`pending`/`delivered`/`duplicate`/`failed`), `target` (route name), `workType` (`illustration`/`novel`) |
| GET | `/:id` | Single delivery intent + its outbox rows + event trail | path `id` |

Response fields: `readOnly: true`, `routes[]` (`name`/`type`/`enabled` — `enabled` means an enabled
download target still fans out to this route; disabled routes' history is still listed), `counts` (global), `perRoute` (per route),
`deliveries[]` (each with `deliveryTarget`/`workType`/`pixivId`/`status`/`attempts`/`lastError`/
`outboxStatus` — `outboxStatus` tells **whether anyone will still retry it**). `GET /:id` additionally returns
`outbox` (attempts/`maxAttempts`/`nextAttemptAt`/`lastError`) and `events[]` (event/`errorClass`/
`retryable`/`countsAsAttempt`/`actor`/`detail`; detail is redacted when written).

Error codes: `DELIVERY_LIST_FAILED` (500), `DELIVERY_NOT_FOUND` (404),
`DELIVERY_STATUS_INVALID` (400, unknown `status` filter value). Responses contain no token, credentials, file paths, or
stack; `lastError` is a short message written by the provider itself (the delivery plane never writes credentials into it).

## Scheduler group: `/api/scheduler`

Scheduler projection and controlled recovery entry for the WebUI Control Center (Scheduler panel). Read endpoints are read-only projections of durable slots /
execution history; recovery endpoints forward to the scheduler process's internal entry, guarded by Origin and parameter allowlist checks
(`SCHEDULER_RECOVERY_ORIGIN_REJECTED` 403, `targetId` must match the safe charset, `requestId` must be a UUID).

| Method | Path | Description | Main params/body |
| --- | --- | --- | --- |
| GET | `/` | Recent slot list (read-only projection) | none |
| GET | `/executions` | Execution history list | pagination query params |
| GET | `/slots/:slotId/logs` | Logs of a single slot | path `slotId` |
| POST | `/targets/:targetId/recover` | Trigger target-level recovery (forwards to `/internal/targets/:targetId/recover`) | body: `requestId` (UUID, required), `retryMode?` (`normal`/`relaxed`), `correlationId?` (≤200 chars) |
| GET | `/targets/:targetId/recover/:requestId` | Poll the durable recovery slot outcome (same contract the review chain uses) | path `targetId`, `requestId` |

## Ops diagnostics group: `/admin/logs`, `/admin/system-errors`

Admin observability endpoints mounted under `/admin/*` (not `/api/*`); also protected when WebUI Basic Auth is enabled,
mainly used by the WebUI frontend's ops pages.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/logs` | Admin log query |
| GET | `/admin/logs/download` | Packaged log download |
| GET | `/admin/system-errors` | System-level error list |
| POST | `/admin/system-errors/:id/resolve` | Mark a system error as resolved |

## Socket.IO realtime events

Sources: `src/webui/websocket/LogStream.ts` (log stream) and `src/webui/websocket/DownloadStatus.ts` (download status stream), both mounted at `WebUIServer` construction. Clients still have no custom upstream events; every per-connection server-side timer is cleaned up on disconnect.

### Event `logs` (log stream)

- On connection, if the log file exists, recent logs are sent: `{ "type": "initial", "lines": ["[...] ..."] }` (at most 1000 lines kept);
- Afterwards the log file size is polled every second and new content is pushed line by line: `{ "type": "new", "line": "[...] ..." }`;
- Log file resolution is the same as `GET /api/logs` (directory of the database's absolute path first, otherwise `<cwd>/data/pixiv-downloader.log`).

### Event `download` (task status stream)

Real-time snapshot broadcasts on task start, progress, appended logs, and completion/failure/stop (merged and debounced over 150ms on the server):

```json
{
  "kind": "snapshot",
  "status": {
    "hasActiveTask": true,
    "activeTask": { "taskId": "task_1712345678", "status": "running", "progress": { "current": 3, "total": 20 } },
    "allTasks": []
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

Notes:

- The field shape is exactly the same as `GET /api/download/status` — the same type definitions can be reused directly;
- Snapshots only contain recent tasks **in memory** (at most 10); hydration of completed history is left to the REST API;
- There is also a server-side fallback re-push every 5 seconds (only while clients are connected), so missing a single push never stalls the UI.

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
socket.on("download", (payload) => {
  console.log(payload.status.hasActiveTask, payload.status.activeTask?.progress);
});
```

## Error-code convention

Business errors are carried by the `errorCode` string (full enum in `src/webui/utils/error-codes.ts`), which the frontend maps to localized copy. Three rules to remember:

1. Global fallback: uncaught exceptions go into the unified `errorHandler`, returning **500** with `{"error":"Internal Server Error"}` (plus `message` when `NODE_ENV=development`).
2. Some handlers deliberately return **HTTP 200 + `data.success:false`** for business failures (e.g. `POST /api/download/parse-url`); success must be judged by success/errorCode, not the status code alone.
3. Status-code semantics vary: `409` means an active download task already exists; the rest are mostly 400/404/500. A compatible approach is to check both the status code and the errorCode field.
4. **Config validation failures do not return terminal copy**: when a config-reading handler catches a `ConfigError` (whose `cause` is a `ConfigValidationError`), it switches to `buildConfigAwareErrorBody()` from `src/webui/utils/config-error.ts`, returning **500** with `{"errorCode":"CONFIG_VALIDATION_*","message":"<first validation reason>","details":[...]}`: the `errorCode` is classified from the first validation line (not logged in → `CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED`, missing clientId → `CONFIG_VALIDATION_PIXIV_CLIENT_ID_REQUIRED`, everything else falls back to its own `CONFIG_VALIDATION_*` / `CONFIG_INVALID`); `message` is truncated to 400 chars, `details` to at most 8 entries; terminal-only hint blocks like `💡 You need to login first…pixivflow login` are stripped wholesale and only appear in server logs. The frontend uses this to show a localized "not logged in → log in now" guide. This branch only affects config-type exceptions; other failures keep `{"errorCode": "<original _FAILED code>"}`.

## Related documents

- [pixivflow-webui frontend repository](https://github.com/redtidev1918/pixivflow-webui) — the official frontend consumer, reference implementation for REST/realtime events; see its [COMPONENT_GUIDE](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/COMPONENT_GUIDE.md) for the component/data-contract mapping

- [Architecture document](../ARCHITECTURE.md) (Chinese) — how the server-side modules work together
- [Usage guide](USAGE.md) — day-to-day CLI and WebUI operations
- [Docker deployment](../DOCKER.md) (Chinese) — container ports and environment variables
- [Quick start](QUICKSTART.md) — from installation to first download
- [Project README](https://github.com/redtidev1918/PixivFlow) — feature overview
