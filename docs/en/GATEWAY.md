# External gateway delivery

Language: [中文](../GATEWAY.md) · English

PixivFlow sends a platform-neutral message to your gateway; the gateway calls QQ, Feishu or another platform. A platform's own webhook usually needs an adapter, rather than just a URL substitution. Login, sessions, platform credentials and protocol handling belong to the gateway. PixivFlow owns acquisition, artifacts, delivery intents, retries and audit.

## Minimal configuration

Run `pixivflow dirs` to locate the active config. Merge this fragment, preserving your authentication, network and storage settings:

```json
{
  "delivery": {
    "deleteAfterDelivery": false,
    "targets": {
      "my-gateway": {
        "type": "webhook",
        "url": "http://127.0.0.1:8790/pixivflow/deliver",
        "mediaTransport": "reference"
      }
    }
  },
  "targets": [
    {
      "type": "illustration", "tag": "風景", "limit": 1,
      "storageMode": "cache", "delivery": { "target": "my-gateway" }
    }
  ]
}
```

This example retains files after delivery. `reference` requires shared filesystem access; use bounded `base64` for a remote gateway. See the [multi-delivery example](https://github.com/redtidev1918/PixivFlow/blob/master/config/examples/standalone.config.multi-delivery.json) for authentication and multiple routes.

```bash
pixivflow config validate
pixivflow gateway test my-gateway
pixivflow download
pixivflow delivery status
```

`gateway test` proves endpoint reachability, not completed platform delivery. Check the delivery ledger and the receiving platform.

## Request contract

This is a gateway payload, **not** a PixivFlow config:

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "pixivflow:my-gateway:illustration:12345678:daily-hot:daily-hot",
  "deliveryTarget": "my-gateway",
  "work": {
    "id": "12345678", "type": "illustration", "title": "Work title",
    "sourceUrl": "https://www.pixiv.net/artworks/12345678",
    "spoiler": false, "tags": []
  },
  "message": {
    "text": "Work title\nhttps://www.pixiv.net/artworks/12345678",
    "mediaTransport": "reference",
    "parts": [
      { "kind": "text" },
      { "kind": "image", "media": { "kind": "image", "path": "/data/artifacts/12345678_p0.jpg", "mime": "image/jpeg" } }
    ],
    "media": [{ "kind": "image", "path": "/data/artifacts/12345678_p0.jpg", "mime": "image/jpeg" }],
    "dropped": []
  },
  "delivery": {
    "idempotencyKey": "pixivflow:my-gateway:illustration:12345678:daily-hot:daily-hot",
    "slotId": "daily-hot", "targetId": "daily-hot", "triggerSource": "schedule"
  }
}
```

| Field | Meaning |
| --- | --- |
| `idempotencyKey` | Stable for the same intent and route across retries; use it to deduplicate |
| `message.parts` | Ordered text/image/album/file/video delivery units; preserve their order |
| `message.media` | Flat media inventory; `kind` is required, other fields appear when available |
| `message.dropped` | Media omitted by capabilities/contract, with reasons; retain for diagnostics |
| `work.spoiler` | Respect spoiler/folding behavior when the platform supports it |
| `delivery.slotId`, `targetId`, `triggerSource` | Attribution context, not deduplication keys |
| `work.tags` | Currently an empty reserved array; use `message.text` when tags are needed |

Media may carry `path`, `dataBase64`, `mime`, `size`, `sourceUrl`, `assetId`. In `reference` mode `path` is an absolute path on the sender's host. In `base64` mode `dataBase64` replaces the path. `maxInlineBytes` rejects oversized inline payloads rather than sending a partial package.

Read or persist referenced bytes **before** acknowledging delivery. Outbox files can be cleaned after `accepted`, `idempotent_replay` or `duplicate_existing`. If mount paths differ, the gateway must handle the container path explicitly; PixivFlow does not translate paths across hosts.

### Headers and HMAC

| Header | When sent |
| --- | --- |
| `X-PixivFlow-Delivery` | Fixed delivery marker |
| `X-Idempotency-Key` | Same key as the body |
| `Authorization: Bearer <token>` | When `token` is configured |
| `X-Webhook-Timestamp`, `X-Webhook-Signature` | When `signingSecret` is configured |

```text
X-Webhook-Timestamp: 1735689600
X-Webhook-Signature: sha256=<hex>
signed input = <timestamp> + "." + <raw request body>
signature = hex(HMAC-SHA256(signingSecret, signed input))
```

Verify against the original body bytes before JSON parsing, or retain the raw body. Also check a reasonable timestamp window.

## Response semantics

HTTP success does not override a terminal business failure:

| Response | Result/action |
| --- | --- |
| 2xx with no status word | Accepted; record `id`/`message_id` if present |
| 2xx with a recognized success word (`published`, `ok`, `success`, `accepted`, etc.) | Accepted |
| 2xx with an unknown status | Retryable |
| 2xx with `failed`, `rejected`, `invalid`, `expired`, `blocked` | Terminal remote failure; do not retry |
| 2xx with `pending`, `queued`, `processing`, etc. | Retryable; do not claim completed delivery |
| 409 or duplicate status | `duplicate_existing`; previously delivered |
| 429 or 5xx | Retry with exponential backoff/full jitter; bounded attempts then dead letter |
| Other 4xx | Permanent failure, dead-letter on the first attempt |
| Connection failure/timeout | Retryable transport failure |

```json
{ "status": "accepted", "id": "gw-9f2c1a", "message": "sent to QQ group 123456" }
```

```json
{ "status": "pending", "message": "queued for the next rate-limit window" }
```

Only `id` and `message_id` become `remoteId`. Put failure detail in `reason`, `error` or `message`; it is retained in `last_error`. Never echo secrets in response bodies.

## Capabilities

The field names come from `TargetCapabilities` in `src/delivery/capabilities.ts`. Overrides tighten limits; they cannot expand built-in capabilities. Unknown keys are ignored with warnings. For albums use flat `album`, `albumMin`, `albumMax`, not `supportsAlbum` or a nested object.

| Field | Purpose |
| --- | --- |
| `maxTextLength`, `maxCaptionLength` | Text/caption bounds |
| `maxAttachmentsPerMessage` | Attachment count before splitting |
| `maxUploadBytes` | Per-file byte bound; unsupported media is reported |
| `album`, `albumMin`, `albumMax` | Album support and size bounds; otherwise flatten |
| `minSendIntervalMs` | Minimum sending interval; the slower value wins |
| `truncatePolicy` | `split`, `truncate`, `error` |
| `idempotencyMechanism` | `none`, `platform_key`, `upstream_ledger`; a declaration, not automatic receiver deduplication |

Omit capabilities you cannot guarantee. Conservative text-first defaults are safer than claiming album support the gateway does not implement.

## QQ / OneBot v11

PixivFlow does not implement OneBot or QQ login. The external adapter translates the [OneBot v11 protocol](https://github.com/botuniverse/onebot-11):

```text
PixivFlow → unified JSON gateway → OneBot HTTP → NapCat/Lagrange/LLOneBot → QQ
```

The gateway verifies authentication/signatures, deduplicates by key, converts ordered `message.parts` to OneBot segments, and maps the result back to the contract. Text plus several image segments form one multi-image message. An image's `file` can use a local path, HTTP URL or `base64://`. File attachments instead use `upload_group_file {group_id, file, name}`, followed by a notice. Message sending uses `POST /send_group_msg` with `{group_id, message:[...]}` and the gateway's separate OneBot bearer token.

OneBot `retcode: 0` means accepted; `status: "async"` or `retcode: 1` means pending, not success. HTTP 401/403/404 should remain 4xx. After successful sending, persist the key and return `duplicate_existing` for replays instead of sending again.

### Login and pairing

Scan the QR code in **NapCat's own panel**; NapCat retains the session. Follow its [documentation](https://napneko.github.io/) for the installed version. Do not point PixivFlow directly at NapCat's message endpoint: it does not understand the unified PixivFlow body.

The adapter can expose three routes:

```text
POST /deliver   verify/deduplicate → OneBot send/upload → ACK
GET  /pairing   query get_login_info → small pairing/status JSON
GET  /health    query get_status → online/good health projection
```

`pairingUrl` lets the WebUI display a gateway's own status read-only. PixivFlow does not generate QR codes, own sessions or persist platform login. Non-2xx pairing responses remain `pairable: false` with gateway detail. A NapCat HTML panel URL is not a pairing API and will not become a QR image.

```json
{
  "delivery": {
    "targets": {
      "qq-main": {
        "type": "webhook",
        "url": "${QQ_GATEWAY_URL}/deliver",
        "token": "${QQ_GATEWAY_TOKEN}",
        "pairingUrl": "${QQ_GATEWAY_URL}/pairing",
        "capabilities": {
          "maxTextLength": 4000, "maxAttachmentsPerMessage": 9,
          "album": true, "albumMin": 2, "albumMax": 9,
          "minSendIntervalMs": 500
        }
      }
    }
  }
}
```

The runnable [OneBot adapter](https://github.com/redtidev1918/PixivFlow/tree/master/examples/onebot-adapter) is a zero-dependency example with self-tests. It still requires a separate QQ implementation and login. Verify login in NapCat, reachability with `gateway test`, actual delivery with the ledger/platform, then replay idempotency separately.

## Deployment and security

Use `${ENV_VAR}` for credentials; do not put tokens in URL queries. PixivFlow redacts endpoints, but relayed gateway errors must also be sanitized. Redirects are disabled by default to avoid forwarding credentials; allow them only intentionally (`pairingAllowRedirects`). Protect the [WebUI](WEBUI.md) with authentication and TLS.

| Gateway location | URL from PixivFlow |
| --- | --- |
| Docker host | `http://host.docker.internal:<port>/...`; Linux host-gateway or default bridge `172.17.0.1` |
| Same Compose network | `http://gateway:8080/...` using the service name |
| Bound only to host loopback | Not reachable from a container; use a reachable interface |
| Same Fly machine | `http://127.0.0.1:<port>` |
| Another Fly app in the organization | `http://<app>.internal:<port>` over 6PN |

Reference media requires a shared filesystem with compatible absolute paths. Without a shared volume, use bounded base64. Fly topology comes from the deploy repository; this repository has no standalone `fly.toml`.

## Operations and reference implementations

```bash
pixivflow gateway list
pixivflow gateway test my-gateway
pixivflow delivery status
pixivflow delivery status --target my-gateway --limit 20
pixivflow delivery status <deliveryId>
pixivflow delivery retry                       # preview
pixivflow delivery retry <deliveryId> --yes     # reopen only this intent
pixivflow delivery retry --yes                 # only still-owed routes
pixivflow outbox list --status dead
```

The WebUI reads `/api/gateways`, `/api/gateways/:name/pairing`, `/api/deliveries` and `/api/deliveries/:id`. `outboxStatus` shows whether retries remain possible. Manual delivery retry is an audited CLI action (`actor=cli`), not a WebUI button.

```bash
node examples/gateway/server.mjs --selftest
node examples/gateway/server.mjs
node examples/onebot-adapter/server.mjs --selftest
npx jest src/__tests__/delivery/onebot-adapter-e2e.test.ts
```

The [reference gateway](https://github.com/redtidev1918/PixivFlow/tree/master/examples/gateway) validates the contract and logs requests; it is not a QQ adapter. [Gateway Contract v1](../GATEWAY_CONTRACT.md) (Chinese) is the authoritative schema/response vocabulary, tied to `src/delivery/gatewayContract.ts` and tests. If this guide conflicts, follow the contract. Related: [Delivery runtime architecture](../architecture/delivery-runtime.md) (Chinese), [Configuration](CONFIG.md), [API](API.md), [Docker](DOCKER.md).
