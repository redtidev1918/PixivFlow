# Operational notifications through Apprise API

Language: [中文](../APPRISE.md) · English

[Apprise API](https://github.com/caronc/apprise-api) forwards small operational notifications to email, Telegram, Discord and other channels. Run it separately and point a delivery target's `notificationUrl` at it. Work artifacts still use their normal delivery endpoint, such as TelePost's multipart submissions API. Do not send Pixiv files or original-image email attachments to Apprise.

## Payload remapping

PixivFlow's TelePost-compatible notification payload uses `text` and `idempotency_key`:

```json
{
  "text": "⚠️ PixivFlow scheduled task failed…",
  "idempotency_key": "pixivflow:schedule-failure:morning:7"
}
```

Apprise expects `body`. Its third-party webhook remapping query maps text, marks the notification as a warning, and removes the unrecognized idempotency field:

```text
:TEXT=BODY&:TYPE=WARNING&:IDEMPOTENCY_KEY=
```

The logical event keeps a stable key through PixivFlow retries. Apprise/email may not deduplicate it, so delivery is at least once; email exactly once is not promised.

## Start a local sidecar

```bash
mkdir -p deploy/apprise
cp examples/apprise/pixivflow.example.cfg deploy/apprise/pixivflow.cfg
```

Edit the file with one Apprise channel URL per line, then start from the repository root:

```bash
APPRISE_CONFIG_FILE=./deploy/apprise/pixivflow.cfg \
docker compose \
  -f docker-compose.yml \
  -f docker-compose.apprise.example.yml \
  up -d apprise
```

The example publishes `127.0.0.1:8000` on the host. PixivFlow's Compose setup uses the existing host-gateway mapping to reach `http://host.docker.internal:8000`; do not expose the notification API to the public internet or LAN without authentication. Verify connectivity from the actual sender environment.

Set the endpoint through an environment variable:

```env
PIXIVFLOW_NOTIFICATION_URL=http://host.docker.internal:8000/notify/pixivflow?:text=body&:type=warning&:idempotency_key=
```

Only change `notificationUrl` on an existing target; keep work delivery pointed at its receiver:

```json
{
  "delivery": {
    "targets": {
      "telepost": {
        "type": "httpMultipart",
        "url": "http://telepost:8080/api/v1/submissions",
        "notificationUrl": "${PIXIVFLOW_NOTIFICATION_URL}",
        "headers": { "Authorization": "Bearer ${TELEPOST_TOKEN}" }
      }
    }
  }
}
```

Existing TelePost notification URLs remain supported. If your config contains a legacy `success.statuses: [201]` restriction, check notification compatibility with Apprise's 200 response; work delivery is still judged by its business ACK. A 204 response usually means the Apprise key has no configured channels; inspect `/json/urls/pixivflow`.

## Test the endpoint

```bash
curl -sS -X POST \
  'http://host.docker.internal:8000/notify/pixivflow?:text=body&:type=warning&:idempotency_key=' \
  -H 'Content-Type: application/json' \
  --data '{"text":"PixivFlow Apprise test","idempotency_key":"pixivflow:test:1"}'
```

When testing on the host itself, use `http://127.0.0.1:8000`.

## Channel URLs

The [official service documentation](https://github.com/caronc/apprise/wiki#notification-services) defines provider-specific URLs. Examples use placeholders:

```text
# SMTP: replace host, port, user and password for your provider.
mailtos://smtp.gmail.com:465?user=you%40gmail.com&pass=APP_PASSWORD&to=ops@example.com&name=PixivFlow
# Telegram: bot token followed by chat ID.
tgram://123456789:AA.../123456789/
# ntfy and Gotify:
ntfy://ntfy.example.com/pixivflow_alerts
gotifys://gotify.example.com/A...
```

Multiple lines provide fan-out. Prefer the stateful `/notify/pixivflow` key over `/notify`: PixivFlow then stores a single endpoint while channel credentials stay in Apprise. Use an unguessable topic and access controls for public ntfy services.

## Security and remote deployment

Keep SMTP passwords, Telegram tokens, Discord webhooks and channel keys in the Apprise config or its environment. PixivFlow can interpolate `${ENV_NAME}`. Its URL redaction hides userinfo and the entire query, but that does not make publicly exposed endpoints safe.

For separate hosts or Fly.io, place Apprise behind HTTPS and authentication. Follow the Apprise README for its Nginx Basic Auth setup. PixivFlow supports authentication headers:

```json
{
  "notificationUrl": "${PIXIVFLOW_NOTIFICATION_URL}",
  "headers": { "Authorization": "Bearer ${APPRISE_API_TOKEN}" }
}
```

Basic Auth userinfo may also be injected through an environment URL. Never commit real secrets. On a small VPS use `APPRISE_WORKER_COUNT=1`. The Chinese guide records about 565 MB image size and 128 MiB idle RAM for one worker, with `/status` returning `OK`; these are historical measurements, not fixed requirements. A 256 MiB machine running both applications may need a separate Apprise host.

## Retries and event scope

Current notifications use the SQLite transactional outbox; `notifyOnce()` makes one HTTP attempt and the outbox owns retry scheduling. Old `delivery-outbox/*.json` manifests are imported idempotently and archived after the row is committed. Persistent replay uses exponential backoff starting at five minutes and capped at six hours (`delivery.outboxRetryBaseMs` / `outboxRetryMaxMs`). Notification failure leaves retry work and does not change the downloaded work's result. The older Chinese guide describes the pre-migration manifest/provider retry path.

Examples of legacy keys:

```text
pixivflow:schedule-failure:<scheduleId>:<executionNumber>
pixivflow:db-recovery:<YYYY-MM-DD>
pixivflow:no-match:<targetId>:novel:<startDate>:<endDate>
pixivflow:hard-fail:<targetId>:<type>:<YYYY-MM-DD>
```

Durable scheduled occurrences have a separate summary contract: success, partial and failed occurrences each get one logical terminal notification with key `notification:<slot>:summary` when a target declares `scheduleOutcomeUrl`. These are structured JSON (`schedule_id`, `slot_id`, `status`, `targets`), sent to `scheduleOutcomeUrl`; they are not the generic `text` payload above and cannot use that remapping unchanged. Keep the TelePost schedule-outcome endpoint, or use an adapter that understands the structured payload. Manual refetch outcomes similarly use `refetchOutcomeUrl`. The older Chinese Apprise guide's statement that success notifications are never sent applies to its legacy examples, not durable schedules. A curl test alone does not prove a schedule notification was delivered.

## Troubleshooting

| Response/symptom | Check |
| --- | --- |
| 400, payload lacks requirements | Include `text` and the `:text=body` remapping |
| 204 | Confirm `/config/pixivflow.cfg` is mounted and contains active channel URLs |
| 424 | Inspect response `details` for downstream channel failures |
| Repeated outbox retries | Test the same endpoint, network, authentication and channel URLs from the sender |
| Test works but event is absent | Confirm the scheduled target uses this notifier; legacy no-match notifications also require `noMatchPolicy.notify: true` |

Apprise already handles channel protocols and authentication. PixivFlow keeps generic HTTP notification delivery instead of adding a second email/Telegram/Discord provider system. Related: [Docker](DOCKER.md), [Gateway delivery](GATEWAY.md), [Configuration](CONFIG.md).
