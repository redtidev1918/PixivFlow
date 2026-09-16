# Observability

Lightweight, in-repo observability for PixivFlow. No ELK/Loki/Grafana dependencies.

## 1. Structured JSON logs

Set env `PIXIV_LOG_FORMAT=json` to emit one JSON object per line. Without it the
existing text format is preserved.

Fields on every JSON line:

```json
{
  "timestamp": "...",
  "level": "ERROR",
  "message": "download_failed",
  "service": "pixivflow",
  "component": "illustration_target",
  "bot_id": "bot1",
  "schedule_id": "bot1-daily",
  "slot_id": "bot1-daily@2026-09-16T2200",
  "pixiv_id": "123456",
  "stage": "download",
  "error_type": "PIXIV_RATE_LIMITED",
  "http_status": 429,
  "retryable": true,
  "exception": "...",
  "trace_id": "..."
}
```

`bot_id` / `schedule_id` / `slot_id` / `stage` are merged automatically inside a
scheduled target run (`runWithContext`). `pixiv_id` / `stage` / `http_status` /
`error_type` / `retryable` are emitted by the download executor and handlers.

## 2. Download stage events

The executor emits, per candidate attempt:

- `download_started`
- `download_completed`
- `download_retry`
- `download_http_failed` (when the error carries an HTTP status)
- `download_failed`

## 3. Error taxonomy

Central mapping in `src/observability/classify.ts`:

| error_type | retryable | typical signal |
| --- | --- | --- |
| `PIXIV_AUTH_FAILED` | false (unless HTTP 401) | login/token/forbidden |
| `PIXIV_RATE_LIMITED` | true | HTTP 429 / `rate limit` |
| `PIXIV_NOT_FOUND` | false | HTTP 404 |
| `PIXIV_CDN_FORBIDDEN` | false | CDN / `i.pximg` 403 |
| `NETWORK_TIMEOUT` | true | timeout / ECONN / abort / HTTP 5xx |
| `DOWNLOAD_CORRUPTED` | true | truncated / invalid image |
| `IMAGE_PROCESS_FAILED` | false | stage `image_process` |
| `TELEGRAM_UPLOAD_FAILED` | false | telegram send |
| `CONFIG_ERROR` | false | config errors |
| `INTERNAL_ERROR` | true | fallback / unexpected |

## 4. `system_errors` table

Append-only error ledger (migration adds it idempotently):

```
id, service, component, bot_id, schedule_id, slot_id, pixiv_id, stage,
error_type, message, http_status, retryable, trace_id, created_at, resolved_at
```

Populated by illustration/novel target handlers on job-level failures.
`resolved_at` is set by the admin API.

## 5. Admin API (protected by WebUI Basic Auth when enabled)

- `GET /admin/logs` — log file list: `name`, `size`, `updated`
- `GET /admin/logs/download` — gzip-filtered log download
  filters: `service`, `bot_id`, `level`, `stage`, `from`, `to`, `file`
- `GET /admin/system-errors` — error rows
  filters: `limit`, `error_type`, `bot_id`, `stage`, `resolved`, `from`, `to`
- `POST /admin/system-errors/:id/resolve` — mark resolved

Example:

```bash
curl -u "$USER:$PASS" 'http://host:3000/admin/logs'
curl -u "$USER:$PASS" 'http://host:3000/admin/logs/download?bot_id=bot1&level=ERROR&stage=download' -o bot1-error.gz
curl -u "$USER:$PASS" 'http://host:3000/admin/system-errors?bot_id=bot1&resolved=false'
```

## 6. Log rotation & retention

Handled in `src/logger.ts`:

- `PIXIV_LOG_MAX_BYTES` (default 20 MB): rotate when the current file exceeds this
- Rotated files are gzipped as `pixiv-downloader-<ts>.log.gz`
- `PIXIV_LOG_RETENTION_DAYS` (default 30): archived `.gz` files older than this are deleted

## 7. Alerting

The scheduler already reports each failed/timeout run to notifying delivery
targets (`notificationUrl`/`scheduleOutcomeUrl`) and stops after
`maxConsecutiveFailures` (production configs use 5). To receive consecutive-
failure alerts, ensure at least one delivery target declares a
`notificationUrl`; `notifyScheduleFailure` then sends `连续失败：N`.

## 8. Mini App

`/admin/logs` and `/admin/system-errors` are the backend a Mini App / dashboard
consumes. The in-repo webui frontend bundle is not built yet
(`webui-frontend/`), so UI wiring is intentionally left to a real frontend.
