# Configuration Reference

A single config file decides what PixivFlow collects, where it stores, and when it runs. This document goes through each config block; if you only want a minimal working config, start with [Quick start](QUICKSTART.md).

## Where the config file lives

Default path: `config/standalone.config.json` (under `config/` at the repository root).

Actual lookup order:

1. Command-line argument `--config <path>`;
2. Environment variable `PIXIV_DOWNLOADER_CONFIG`;
3. Auto-detection: the first usable config file found in the config directory;
4. Fall back to the default path.

Multiple configs can be managed with `pixivflow config` (switch, backup, restore).
If you don't want to write it by hand, run the interactive wizard:

```bash
pixivflow setup
```

## Minimal working config

The login command fills in the `pixiv` section automatically; you only need to care about `targets`:

```json
{
  "logLevel": "info",
  "scheduler": { "enabled": false },
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 20 }
  ]
}
```

Keys prefixed with `_` are ignored and can be used as comments.

## pixiv credentials

| Field | Description |
| --- | --- |
| `clientId` / `clientSecret` | Pixiv OAuth app credentials; the defaults are the official app's public values and usually stay unchanged |
| `deviceToken` | Always `"pixiv"` |
| `refreshToken` | The core login credential, written by `login` / `refresh` |
| `userAgent` | API request UA; keep the default |
| `accountId` | Optional. The **stable internal identity** of this credential profile (default `"default"`) — the Resource Identity (`pixiv-account:<accountId>`) for resource governance. Never use bot/schedule/target names; the credential itself never participates in the key. In multi-account deployments give each account a distinct `accountId`; capacities are independent of each other. |

Never hand-craft or paste someone else's refreshToken; see [LOGIN](LOGIN.md) for how to obtain one.

## targets: download targets

An array; each item describes one class of content to collect, with AND semantics between conditions.

### Common fields

| Field | Type | Description |
| --- | --- | --- |
| `type` | required | `illustration` or `novel` |
| `id` | string | Stable unique id referenced by schedules; letters, digits, `_`, `-` only, max 64 chars |
| `limit` | number | Maximum items to download per run |
| `minBookmarks` | number | Minimum bookmark threshold |
| `startDate` / `endDate` | string | Publish-date range `YYYY-MM-DD`; placeholder support [below](#date-placeholders) |
| `maxPageCount` | number | Maximum pages per work (positive integer); multi-page works beyond the limit are judged unusable for this run |
| `aiMetadataCheck` | boolean | Optional file-metadata AI detection: supplements `illust_ai_type` when it is missing or not yet classified by Pixiv (a second layer beyond `excludeAI`) |

### Search mode fields (`mode: "search"`, default)

| Field | Values | Description |
| --- | --- | --- |
| `tag` | string | Search tag; separate multiple tags with spaces |
| `tagRelation` | `and` / `or` | Multiple tags: require all (default) or any hit |
| `searchTarget` | `partial_match_for_tags` / `exact_match_for_tags` / `title_and_caption` | Match mode |
| `sort` | `date_desc` / `date_asc` / `popular_desc` | Result ordering |
| `restrict` | `public` / `private` | Work visibility scope |
| `random` | boolean | Randomly pick one from the results |

### Ranking mode fields (`mode: "ranking"`)

| Field | Values | Description |
| --- | --- | --- |
| `rankingMode` | see below | Ranking type |
| `rankingDate` | `YYYY-MM-DD` | Date; defaults to today; supports the `YESTERDAY` placeholder |
| `filterTag` | string | Optional; when set, searches works of that tag published on the date and sorts locally by bookmark/view popularity |

All `rankingMode` values: `day`, `week`, `month`, `day_male`,
`day_female`, `day_ai`, `week_original`, `week_rookie`, `day_r18`,
`day_male_r18`, `day_female_r18`.

Without `filterTag`, the Pixiv ranking API is called and `rankingDate` means the ranking date. With
`filterTag` set, to get "the hottest works of the given tag published yesterday", `rankingDate`
is used as a single-day publish window to fetch candidates, which are then sorted by popularity; `rankingMode` does not participate in the query in this case.

### Topic mode fields (`mode: "topic"`)

Semantic topic download. Unlike `tag` (which matches one exact Pixiv tag), `topic` only expresses "I want works of this theme"; PixivFlow automatically derives the related search space — you don't need to research and maintain a related-tag table up front.

| Field | Values | Description |
| --- | --- | --- |
| `topic` | string | **Required**. The topic word (e.g. `ボテ腹`); automatically expanded into related tags at runtime |
| `date` | `YESTERDAY` / `TODAY` / `YYYY-MM-DD` | Single-day publish window, resolved dynamically at runtime; defaults to `YESTERDAY` |
| `limit` | number | Daily Top N for this topic (configured separately for illustration/novel) |
| `excludeAI` | boolean (default false) | Illustration targets exclude works explicitly marked by Pixiv as AI-generated; missing/unknown marks are not killed by mistake |
| `topicDiscovery` | object | Optional advanced overrides, see below; all have defaults |
| `candidateCollection` | object | Optional advanced overrides, see below |

`topicDiscovery`: `maxTags` (default 12), `sampleWorks` (default 100), `cacheDays` (default 7), `minScore` (default 0.22), `refresh` (default false), `includeR18` (default false — when set `true`, sampling and collection both include R-18 works; Pixiv illustration search filters R-18 by default via `filter=for_ios`, while novel search includes them anyway), `relatedTags` (default `always`, see below), `seedTier` (default `off`), `tagRelations` (default: no source restriction), `matchTranslatedNames` (default `false`).
`candidateCollection`: `maxPerTag` (default 40), `maxCandidates` (default 250), `minMetadataScore` (default 0.35).

The last three `topicDiscovery` keys (`seedTier` / `tagRelations` / `matchTranslatedNames`) are all optional, **with defaults exactly equivalent to the behavior before they existed**; each resolved Tag also carries `source` (provenance) and `weight` (semantic weight for ordering reads, same value as `score`). Rules and diagnostics: [Tag space & ranking rules](../TAG_RANKING.md) (Chinese).

Workflow: Topic → (Pixiv tag suggestions + recent-work tag co-occurrence, with PMI-style specificity scoring automatically suppressing generic tags like R-18/オリジナル) → related tag space → search the day's works per tag → PID dedup → lightweight relevance filtering using only tag/title/description (**acceptance gate only** — passing `minMetadataScore` means belonging to the topic) → passing candidates ranked **purely by local popularity `calculatePopularityScore()`** → download history removed from the bounded popularity candidate pool → backfill up to Top N. Illustrations and novels use their own independent tag spaces; results are cached in the data volume `topic-cache/` (default 7 days); refresh failures automatically degrade to the old cache or the topic word alone, without interrupting the schedule. On repeated runs of the same publish date, an already-submitted #1 does not make the task run empty; `limit=1` keeps 20 illustration candidates by default, with a regular backfill pool cap of 100 (an explicitly configured larger `limit` is still respected), then batch-deduped by the download plan. **No LLM/VLM/Embedding/local model is used anywhere in this flow.**

Capability boundary: if a work has no topic-related tag/title/description (visually related but metadata-unrelated), it cannot be recognized without a vision model — this is a design trade-off, not a bug.

The target-level `topicProfile` (`primary` / `related` / `strategy.freshnessWeight` / `strategy.popularityWeight` /
`inventory.maxAgeDays` / `inventory.reserveSize`, etc.) is an advanced candidate-supply override, aimed at supply tuning rather than routine configuration;
its semantics and governance rules live in the [candidate-supply RFC](../architecture/candidate-supply-rfc.md) (Chinese).

#### `topicDiscovery.relatedTags`: may related tags act as independent search channels

The derived tag space is **hierarchical** (the topic word is what the operator wants; the other tags are only hints), not a set of interchangeable peers. The default `always` treats every tag in the space as a search channel each day, so a high-weight peer tag (e.g. `丸吞` in the space when collecting `西瓜肚`) may fill `limit` with its own works of the day:

| Value | Semantics |
| --- | --- |
| `always` (default) | The whole related tag space participates in the day's search; after the `minMetadataScore` gate, ranking is **purely by local popularity** (historical behavior, backward compatible) |
| `when_seed_insufficient` | Search only the topic tag first; expand to related tags only when it **cannot fill `limit`** that day. Selection adds a "works carrying the topic tag first" tier before popularity; related tags only backfill |
| `never` | Search only the topic tag (when the space lacks the topic word, degrades to traversing the whole space to avoid returning empty) |

```json
{ "id": "bote-illust", "type": "illustration", "mode": "topic", "topic": "西瓜肚", "limit": 1,
  "topicDiscovery": { "relatedTags": "when_seed_insufficient" } }
```

Diagnostics: the logs of `pixivflow topic test "<topic>" --date YESTERDAY` print `[TopicRecall] mode=... seedAccepted=... relatedTags=...` and `searchedTags=` (the tag list actually searched this run), so you can directly confirm whether related tags were searched.

#### `topicDiscovery.seedTier`: is the topic tag a hard tier

| Value | Semantics |
| --- | --- |
| `off` (default) | Keeps historical behavior: after the `minMetadataScore` gate, ranking is **purely by popularity** (with `relatedTags: "always"` the topic tag gets no tier) |
| `on` | The topic tag becomes a **hard tier**: works carrying it always rank ahead of works carrying only related tags, however hot the latter are; within a tier, still by popularity |

Diagnostics: selected items in `pixivflow topic test` carry the `seedTier=on` marker; rows with `seed=yes` in the `pixivflow topic resolve` table are the topic tag.

#### `topicDiscovery.tagRelations`: which tags are allowed/forbidden to enter the search

Acts **before searches are issued**, deciding which tags are actually searched that day (not just affecting display).

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `allowSources` | `("seed"\|"cooccurrence"\|"autocomplete")[]` | all | Only use tags from these sources. Unknown source names are rejected by config validation |
| `allow` | string[] | `[]` | When non-empty, **only the listed tags** are used; the topic tag is always kept |
| `deny` | string[] | `[]` | Unconditionally dropped, **taking priority over `allow` and `allowSources`** |

```json
{ "id": "bote-illust", "type": "illustration", "mode": "topic", "topic": "西瓜肚", "limit": 1,
  "topicDiscovery": { "tagRelations": { "allowSources": ["seed", "cooccurrence"], "deny": ["丸吞"] } } }
```

The topic tag is never dropped by `allow` / `allowSources`; only `deny` can drop it, and when the space becomes empty after dropping, it degrades to **searching with the topic word alone** (consistent with the degradation on derivation failure), never returning empty results.

#### `topicDiscovery.matchTranslatedNames`: do translations count as hits

Default `false`: only the work's tag `name` is compared with resolved tags (historical behavior). When set `true`, a work's `translated_name` can also hit the corresponding resolved tag — useful when "the topic word and the work's tags are in different languages".

```json
{ "topicDiscovery": { "matchTranslatedNames": true } }
```

A translation is just **another spelling of the same resolved tag**: a work is never reported as carrying a tag it doesn't have, and the same resolved tag counts only once per work (writing both the tag name and its translation does not score twice).

Daily at 10:00 Beijing time, download yesterday's hottest non-AI illustration (1) and Chinese novel (1) on the "ボテ腹" topic:

```json
{
  "targets": [
    { "id": "bote-illust", "type": "illustration", "mode": "topic", "topic": "ボテ腹", "date": "YESTERDAY", "limit": 1, "excludeAI": true },
    { "id": "bote-novel",  "type": "novel",       "mode": "topic", "topic": "ボテ腹", "date": "YESTERDAY", "limit": 1,
      "languageFilter": "chinese", "languageCandidateLimit": 20, "strictLanguageFilter": true }
  ],
  "schedules": [
    { "id": "bote-daily", "enabled": true, "cron": "0 10 * * *", "timezone": "Asia/Shanghai",
      "targetIds": ["bote-illust", "bote-novel"] }
  ]
}
```

Use `pixivflow topic resolve "ボテ腹"` to view the derived tag space, and `pixivflow topic test "ボテ腹" --date YESTERDAY` for a dry-run preview (no download).

### Targeted ID fields

When set, search is skipped and the download is precise:

| Field | Applies to | Description |
| --- | --- | --- |
| `illustId` | illustration | A single illustration, e.g. the number in URL `artworks/12345678` |
| `novelId` | novel | A single novel, e.g. the id in `novel/show.php?id=26132156` |
| `seriesId` | novel | A whole novel series, `novel/series/{id}` |
| `userId` | both | All works of that user |

These fields are equivalent to URL direct links — when in doubt, [`--url`](USAGE.md#url-direct-download) is easiest.

### Novel-specific fields

| Field | Values | Description |
| --- | --- | --- |
| `languageFilter` | `chinese` / `non-chinese` | Filter novels by language based on the full body |
| `languageCandidateLimit` | 1–100 (default 20) | Cap of candidates checked in popularity order; e.g. when Top 1 is not Chinese, keep checking the next until `limit` is filled |
| `strictLanguageFilter` | boolean (default false) | When true, rejects novels whose language cannot be reliably judged (e.g. body too short); enable when "Chinese only" must be guaranteed |
| `noMatchPolicy.lookbackDays` | 0–7 (default 0) | When no target-language novel exists today, look back day by day; topic and language conditions are never silently relaxed |
| `noMatchPolicy.notify` | boolean (default false) | When still no result at the end, notify the review chat via the delivery target's `notificationUrl`; the notification is persisted into the outbox and retried with exponential backoff |
| `detectLanguage` | boolean (default true) | Record detection results into metadata |

`mode: "topic"` first takes `languageCandidateLimit` novel candidates by popularity, then serially checks full bodies and stops once `limit` is reached; this preserves popularity order and avoids over-submission from concurrent checks. For low-bandwidth deployments of "hottest 1 Chinese novel", `limit: 1`, `languageCandidateLimit: 20`, `strictLanguageFilter: true` is recommended. When you want "fill as much as possible without silence", additionally set `noMatchPolicy: { "lookbackDays": 3, "notify": true }`; it checks at most yesterday and the 3 days before, and never degrades into Japanese or unrelated topics.

#### Pixiv animations (ugoira)

Since 2.10.31, ugoira are synthesized into infinitely looping GIFs after download, using per-frame durations from Pixiv metadata.
Delivery targets only receive the `.gif`; TelePost recognizes it as `animation`, and both the review chat and the channel display the animation directly —
no more two ZIP/JSON documents. No new configuration needed.

- npm/source installs need `python3` and `ffmpeg` on PATH; the official full and scheduler Docker images already include them.
- The original ZIP and frame-delay JSON are kept locally; in `cache` mode they are cleaned up together with the GIF after successful delivery, and kept for retry on failure.
- Conversion failure does not register a download success; on recovery runs, unfinished local ZIPs are converted again — delivery never skips conversion.
- Output's longest edge is at most 640 pixels; frame delays are rounded to GIF's 10ms precision; over 49 MiB or conversion timeout errors out — never truncates the animation to fake success.
- Old ZIP/JSON submissions already in the review queue are not automatically replaced by the upgrade, avoiding unconfirmed duplicate publication of the same work.
- Verification: `python3 src/__tests__/download/test_ugoira_to_gif.py`, covering real encoding, frame order, duration, looping, and exception cleanup.

#### Operations notifications (delivery results notified to the review chat)

With `notificationUrl` configured on a delivery target, PixivFlow can send ops notifications to the review chat — all written into
the delivery outbox for persistence, carrying stable idempotency identities, retried with exponential backoff. `notificationUrl` can point directly at the
[Apprise API](../APPRISE.md) (Chinese), which forwards to Email, Telegram, Discord, ntfy, and more:

| Trigger | Message | Notes |
| --- | --- | --- |
| Candidate exhaustion (no match) | `⚠️ PixivFlow 本次没有可投稿内容` | Controlled by `noMatchPolicy.notify: true`; the target itself must enable the switch. |
| **Download hard failure** | `❌ PixivFlow 本次下载失败` | A hard error during the target's delivery (overlong title hitting `ENAMETOOLONG`, network/permission errors, etc., failing the whole target). No extra switch needed — sent as long as the target has `delivery.target` configured (a notification channel exists); targets without a notification endpoint are stopped by delivery validation with only a warning. Effective for both illustration and novel targets. |
| **Schedule failure or timeout** | `⚠️ PixivFlow 定时任务失败/超时` | Notifies the review chats involved in the schedule, including the consecutive-failure count; when `maxConsecutiveFailures` is reached it clearly states the schedule has auto-stopped. |
| **Database recovery** | `⚠️ PixivFlow 数据库自检未通过` | When a corrupted database is quarantined and rebuilt at startup, all targets with `notificationUrl` are notified. |

Hard-failure messages include the target name and an error summary (errors over 200 chars are truncated), and hint that the reviewer can click "🔄 refetch/swap"
to retry or wait for the next scheduled run. This way even silent download errors reach reviewers immediately, without digging through logs.

### Target storage & delivery modes

| Field | Values | Description |
| --- | --- | --- |
| `storageMode` | `persistent` / `cache` | Default `persistent`; `cache` deletes local files after successful delivery |
| `delivery.target` | string | Target name in the top-level `delivery.targets` (single-platform delivery) |
| `delivery.targets` | string[] | Multiple target names in the top-level `delivery.targets`: fan the same work out to multiple platforms |
| `delivery.fields` | object | Form-field overrides for this target |

`delivery.targets` coexists with `delivery.target`, the array winning; in `cache` mode at least one route is required
(non-empty array or valid `target`), and every entry must be an existing key of the top-level `delivery.targets`, otherwise config
validation fails. Each target owns an independent delivery intent, outbox row, and retry budget: one platform's failure does not affect the
others, and retries only resend unconfirmed platforms; a work counts as "delivered" only when all targets are confirmed. With no
`delivery.targets` configured at all, behavior is exactly the same as historical versions. Details:
[delivery runtime architecture](../architecture/delivery-runtime.md) (Chinese).

### Target capability declarations

The top-level `delivery.targets.<name>.capabilities` is **optional**: it declares the message shapes and hard limits the delivery
target truly supports (capabilities are data, not code). When omitted, the built-in profile of the platform type is used
(`httpMultipart` declares all capabilities with no limits; `telegram` declares caption ≤1024, upload ≤50MB,
album 2–10 items). The delivery engine decides delivery shapes by capabilities, not platform names.

| Field | Values | Description |
| --- | --- | --- |
| `text` / `image` / `file` / `album` / `video` | boolean | Whether the shape is supported (overrides platform default) |
| `maxTextLength` / `maxCaptionLength` / `maxUploadBytes` / `maxAttachmentsPerMessage` | integer ≥ 0 | Hard limits, unit: chars / bytes / items |
| `albumMin` / `albumMax` | integer ≥ 1 | Album size range |
| `requiresTwoPhaseUpload` | boolean | Upload first for a handle, then send referencing the handle (Feishu image_key/file_key) |
| `minSendIntervalMs` | integer ≥ 0 | Minimum send interval for the same target (throttle); 0 = unlimited |
| `truncatePolicy` | `split` / `truncate` / `error` | What to do with overlong text: split, truncate, or fail rather than silently truncate |
| `idempotencyMechanism` | `none` / `platform_key` / `upstream_ledger` | Whether the platform itself is idempotent; if not, the PixivFlow ledger covers it |

Numeric limits **can only tighten, never loosen** platform defaults: writing a larger number than the platform's does not take effect (it would only
fail at the platform API) — PixivFlow keeps the smaller value from the platform profile. Throttling is the opposite — **only stricter is allowed**
(`minSendIntervalMs` takes the larger value; the slower wins), because loosening throttling risks account bans.

`type: "telegram"` (the example below) is **deprecated**: it requires PixivFlow itself to hold a Telegram Bot Token,
which conflicts with the long-term architecture of "TelePost is the only publishing backend", and will be removed in a future version. New configs should use
`type: "httpMultipart"` to deliver to the TelePost Submission API; old configs keep working, but do not build on them further.

```json
{
  "delivery": {
    "targets": {
      "tg-review": {
        "type": "telegram",
        "botId": "bot1",
        "botToken": "${TELEGRAM_BOT1_TOKEN}",
        "chatId": "-1001234567890",
        "publishChatId": "@channel",
        "controlPlaneUrl": "${CONTROL_PLANE_URL}",
        "controlPlaneToken": "${CONTROL_PLANE_TOKEN}",
        "capabilities": { "album": false, "maxUploadBytes": 10485760 }
      }
    }
  }
}
```

The field source is `TargetCapabilities` in `src/delivery/capabilities.ts` (the platform profiles
`PLATFORM_CAPABILITIES` are likewise given as data on the `services` side); a mistyped field name (e.g. `supportsAlbum`
instead of `album`) is not treated as a capability — validation only emits a warning — the validator
suggests `Did you mean "album"?`, because "looks effective, actually ignored" is harder to debug than a hard error.

Invalid declarations (non-boolean, negative, non-integer, `albumMin > albumMax`) are rejected at both config validation entries
(loader and unified validator) with error code
`CONFIG_VALIDATION_DELIVERY_CAPABILITY_INVALID`. How work content degrades by capability
(album expansion, unsupported media going to `unsupported` instead of being silently dropped):
[delivery runtime architecture §4.2/§4.3](../architecture/delivery-runtime.md) (Chinese).

### TelePost submission chain (`type: "httpMultipart"`)

`httpMultipart` is **multipart-form** delivery: POST the downloaded files plus rendered form fields to the
receiver in one shot. The current production receiver is TelePost's `POST /api/botN/v1/submissions`. The request side must get
these things right:

| Requirement | Description |
| --- | --- |
| `files` | TelePost's required file field (`fileField` defaults to `files`). In cache mode, originals and previews are sent in one-to-one correspondence |
| `tags` | TelePost's required field. Templates like `"Pixiv,{{topicTag}},{{xRestrictTag}},{{workTags}}"` work fine |
| `idempotency_key` | **Mandatory**, value `{{idempotencyKey}}`. It is the convergence basis for redelivery after ACK timeout (see below). When the target does not declare this field it is **auto-added** (`autoIdempotencyKey: false` disables): omitting it is exactly the common cause of the same work being submitted twice |
| `link` | Optional, source link to the original work; TelePost requires an `http(s)://` prefix |
| `note` | Optional description. **Attribution belongs here**, e.g. `"作者：{{author}}\nPixiv ID: {{pixivId}}"`: `{{author}}` is the Pixiv author name, present for both `illustration` and `novel`; when the Pixiv response carries no author it renders as an empty string — no fabricated `Unknown` |
| Source fields | `target_id` / `source_label` / `source_ref` / `scheduled_at` are all optional: `target_id` lets manual "refetch/replace" target this target; the other three are only for review-card display and troubleshooting |

**How the response decides the delivery outcome.** TelePost's `data.status` is a **record state**, not a transfer result;
`data.business_status` is the formal business ACK; the two are **produced in pairs** with the HTTP status code, so
PixivFlow classifies by reading the HTTP status code and the record state, without an extra `business_status` branch:

| TelePost response | Downstream outcome |
| --- | --- |
| `201` + `business_status: accepted` (record `pending_review`, new review item) | `accepted` → ledger `delivered`, cell `submitted` |
| `201` + `business_status: accepted` (record `published`, direct publish with review off) | Same as above, `remote_id` takes `message_id` |
| `200` + `business_status: idempotent_replay` (`reused: true`, same key) | `idempotent_replay` → **treated as success**, only one message in the channel |
| `200` + `business_status: duplicate_existing` (another key already published the same work) | `duplicate_existing` → ledger records `duplicate`, no duplicate submission |
| `400` + `business_status: permanent_failure` | Deterministic rejection → dead-letter on the first round; resending as-is is pointless |
| `503` + `business_status: retryable_failure` | Retryable → back off and redeliver, **idempotency key unchanged** (on the TelePost side it is unknown whether Telegram received it; an unchanged key prevents duplicate publication) |

`remote_id` prefers `review_id`, falling back to `message_id`: in review mode (the default for API tokens)
the record that can be pinned by the idempotency key is the **review item** — recording a channel message id as the delivery target would mask "not actually published yet".
When a **terminally failed** review item is reused by key, TelePost returns `400` (not 200), and this path lands
correctly as a deterministic failure via the HTTP status code alone.

Both the template variables in `fields` and the `ack` envelope mapping can be overridden, but the default `ack` is exactly TelePost's
`{ok, data:{review_id, reused, reuse_reason, matched_idempotency_key}}` — no need to write it in daily use; the overridable sub-keys are
`dataPath` / `idField` / `statusField` / `reusedField` / `reasonField` / `keyField`.
`scheduleOutcomeUrl` is an optional **schedule terminal summary** endpoint: each schedule occurrence's terminal state (success/partial/failed) is delivered
to it by the durable outbox (reusing `headers` for auth), and TelePost relays it as a user-visible message; it is independent of
`refetchOutcomeUrl` (manual-refetch terminal verdicts).
The complete evidence for this boundary (every response shape and its corresponding downstream outcome) lives in
`src/__tests__/delivery/telepost-compat.test.ts`; the authoritative definition on the TelePost side is its own
`docs/API.md` §"Submission business ACK".

`readinessUrl` is an optional consumption barrier: point it at TelePost's `/ready` (in multi-bot deployments the router process's
`/ready`, which returns 200/503 by each bot subprocess's real readiness). **Do not** point it at `/live` or a
nonexistent path — when the probe fails the worker puts the outbox row back without consuming an attempt, but also never delivers.

### Generic messaging gateway (`type: "webhook"`)

`webhook` is a **platform-agnostic** delivery target: PixivFlow only POSTs a unified message document to an existing
messaging gateway (TelePost, AstrBot, Hermes Messaging Gateway, a self-built adapter, or any HTTP service);
the gateway itself handles QQ / WeChat / Telegram / Discord / Feishu login, protocols, and message rendering. PixivFlow
**implements no platform protocol and generates no pairing QR codes**; if the gateway provides its own pairing endpoint,
`pairingUrl` lets the WebUI render it (PixivFlow only reads it — see below).

```json
{
  "delivery": {
    "targets": {
      "gateway-a": {
        "type": "webhook",
        "url": "${GATEWAY_URL}/hook",
        "token": "${GATEWAY_TOKEN}",
        "signingSecret": "${GATEWAY_SIGNING_SECRET}",
        "pairingUrl": "${GATEWAY_URL}/pairing",
        "headers": { "X-Origin": "pixivflow" },
        "mediaTransport": "reference",
        "maxInlineBytes": 8388608,
        "timeoutMs": 30000,
        "capabilities": { "album": true, "maxAttachmentsPerMessage": 9, "minSendIntervalMs": 1500 }
      }
    }
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `url` | ✅ | Gateway endpoint, http/https or `${ENV}` reference |
| `token` | | Bearer credential (supports `${ENV}`), never logged |
| `signingSecret` | | When declared, every request carries `X-Webhook-Timestamp` and `X-Webhook-Signature` (`sha256=HMAC-SHA256(secret, "<timestamp>.<rawBody>")`) |
| `headers` | | Extra request headers (supports `${ENV}`) |
| `mediaTransport` | | `reference` (default; sends local absolute paths — requires the gateway on the same machine) / `base64` (inline bytes) |
| `maxInlineBytes` | | With `base64`, payloads beyond this size are **rejected outright** (fail rather than silently truncate) |
| `timeoutMs` | | Per-request timeout, default 30000 |
| `pairingUrl` | | The **gateway's own** pairing endpoint (supports `${ENV}`). PixivFlow only GETs and renders as-is — no QR generation, no session storage, no persistence; unconfigured ⇒ `GET /api/gateways/:name/pairing` returns 404 `GATEWAY_PAIRING_UNSUPPORTED` |
| `pairingAllowRedirects` | | Default `false`. Whether to follow redirects when reading `pairingUrl`; pairing payloads are untrusted input, so following needs explicit opt-in |
| `capabilities` | | See [Target capability declarations](#target-capability-declarations) |

The request body is a platform-agnostic unified message document (`schemaVersion` / `idempotencyKey` /
`work{…}` / `message{text,mediaTransport,parts[],media[]}` / `delivery{…}`),
**containing no platform credentials**. The gateway's response decides the delivery outcome:
2xx + an explicit success status word counts as success; `pending`/`queued`/`submitted`-style "recorded, not published" is treated as retryable
(keep retrying with the same idempotency key); `failed`/`rejected`-style terminal failure is **never recorded as success**;
2xx with an unrecognized status word is treated as retryable (no guessing). 429/5xx is retryable; other 4xx is deterministic rejection
(first-round dead-letter). This type has **no** `maxAttempts` / `retryDelayMs`: the durable outbox is its
only retry layer. Details:
[delivery runtime architecture §5.1](../architecture/delivery-runtime.md) (Chinese).

Ops commands (no config changes; read-only ledger + probes):

```bash
pixivflow gateway list                      # per route: type / redacted endpoint / enabled / connection state / delivery counts
pixivflow gateway status qq-main --limit 20 # recent delivery intents of the route + their outbox states
pixivflow gateway test qq-main              # probe whether the endpoint answers and record the observation (answering ≠ delivery success)
pixivflow delivery status --target qq-main  # ledger view
pixivflow delivery status <deliveryId>      # a single intent (equivalent to --id <deliveryId>)
pixivflow delivery retry --target qq-main --dry-run   # preview is the default
pixivflow delivery retry --target qq-main --yes       # only re-open routes still owed delivery
pixivflow delivery retry <deliveryId> --yes           # re-open just this one (still through the outbox)
```

For `webhook`, `gateway test` only proves "the endpoint answers" (any HTTP status code, including 404/405); for
`httpMultipart` it judges 2xx per the declared `readinessUrl`; for `telegram` it returns `unknown`
(media never leaves Telegram). The endpoint written into `gateway_connections` is already `redactUrl`-ed;
credentials are neither persisted nor printed. `delivery retry` never touches delivered/duplicate rows, and refuses manual re-opening
while the corresponding outbox row is still executable (the worker retries by itself — manual re-opening would duplicate delivery).

`cache` mode uses generically named delivery targets. The current built-in provider is the streaming
`httpMultipart`; the addresses and fields below are examples only:

```json
{
  "delivery": {
    "outboxRetryBaseMs": 300000,
    "outboxRetryMaxMs": 21600000,
    "targets": {
      "my-api": {
        "type": "httpMultipart",
        "url": "https://example.test/submissions",
        "readinessUrl": "https://example.test/ready",
        "notificationUrl": "https://example.test/notifications",
        "method": "POST",
        "headers": { "Authorization": "Bearer ${MY_API_TOKEN}" },
        "fileField": "files",
        "previewFileField": "previews",
        "fields": { "title": "{{title}}", "source_id": "{{pixivId}}" },
        "arrayFormat": "comma",
        "maxAttempts": 3,
        "retryDelayMs": 2000
      }
    }
  }
}
```

Field values support the `{{title}}`, `{{displayTitle}}`, `{{seriesTitle}}`, `{{pixivId}}`, `{{type}}`, `{{tag}}`, `{{topic}}`,
`{{workTags}}`, `{{author}}`, `{{link}}`, `{{topicTag}}`, `{{spoiler}}`, `{{xRestrict}}`,
`{{xRestrictLabel}}`, `{{xRestrictTag}}`, `{{rankingDate}}`, `{{publishedDate}}`,
`{{language}}`, `{{bookmarkCount}}`, `{{viewCount}}`
templates. `{{title}}` is the work title: for series novels it is the **chapter name** (e.g. `Day 1`); the parent series name comes separately via
`{{seriesTitle}}` (empty string for non-series works); `{{displayTitle}}` is the composed title — series novels render as
`《系列名》 章节名` (e.g. `《我的胎归者女友》 Day 1`), non-series works are the same as `{{title}}` —
template title slots should prefer `{{displayTitle}}`. `{{author}}` is the Pixiv author name (present for both `illustration` and `novel`); when the Pixiv response
has no author it is an empty string — **not** filled with `Unknown`, so a template writing `作者：{{author}}` visibly
exposes the empty value instead of fabricating an attribution. `{{bookmarkCount}}`/`{{viewCount}}` are the work's bookmark/view counts (Pixiv
`total_bookmarks`/`total_view`), rendered compactly for large numbers (`1.2k`, `34.6w`); empty string when the API
did not return them — usable in descriptions as popularity evidence. `{{xRestrict}}` keeps Pixiv's raw integer (0=all ages, 1=R-18, 2=R-18G);
`{{xRestrictLabel}}` outputs `all-ages` / `R-18` / `R-18G`; `{{xRestrictTag}}`
outputs Telegram-tag-friendly `AllAges` / `R18` / `R18G`. These three are independent of
`{{spoiler}}` — downstream decides masking per channel policy. `{{tag}}` is the unified target tag: normal search uses `tag`, tag rankings
use `filterTag`, semantic topic mode uses `topic`; `{{workTags}}` is the work's own Pixiv
tags, comma-joined. To submit source, scheduled topic, and work tags together, configure
`"tags": ["Pixiv", "{{tag}}", "{{workTags}}"]`. Headers
and URLs support `${ENV_NAME}`. `arrayFormat` can be `comma`, `repeat`, or `json`.

**The `spoiler` field is the target's own policy**: `{{spoiler}}` only reports "whether Pixiv marked this work as restricted"
(`x_restrict > 0`); whether to actually mask is decided by the receiver. Three recommended writings — `false` (default no masking;
R-18/R-18G display as usual), `"{{spoiler}}"` (legacy compatible: restricted works always masked), `true` (mask everything).
The value can be a JSON boolean or string: it is uniformly rendered as a string at delivery, and the receiver judges truthiness by `true/1/yes`.
If the receiver is TelePost, this **one** value decides masking for both its **review-chat preview** and its **channel publication**
(per-item toggling uses the mask button on the review card), so don't build conditionals into the template
to "show reviewers unmasked first, mask at publish"; the reference deployment sets both targets to `false`.

**Empty-value discipline**: variables are only substituted when they have a value; known variables without a value render as empty strings, unknown variables are kept as-is.
So `{{rankingDate}}` only exists for candidates from **ranking sources** (`mode: "ranking"`, or a target with
`rankingDate` set to `YESTERDAY`/a date) — topic/tag/search-mode candidates have no ranking date and render as empty strings,
so a template like `📅 {{rankingDate}} · ⭐ {{bookmarkCount}}` leaves a gap like "📅  · ⭐ 12".
`{{publishedDate}}`, `{{language}}`, `{{slot*}}` can likewise be empty. Therefore: **do not bind potentially empty variables
to fixed punctuation on the same line** — either use pattern-matched templates or put the whole line into an optional fragment. `{{author}}` is filled on both
the illustration and novel paths; if some chain really cannot obtain the author, the template exposes the empty value rather than fabricating an attribution.

`readinessUrl` is an optional consumption barrier: on non-2xx the worker puts the outbox row back without incrementing attempts;
do not use `/live`, which only means the process is alive. In cache mode, illustrations download the smaller `large`/`medium`
previews from Pixiv and send them in one-to-one correspondence with the `fileField` originals via `previewFileField` (default `previews`); the original
is still the authoritative artifact, and the receiver may ignore previews.

#### Telegraph (telegra.ph) album upload

To automatically publish downloaded illustrations to a [Telegra.ph](https://telegra.ph) album page, pair with the
[telepress](https://github.com/redtidev1918/TelePress) REST service:
telepress packs the received images, uploads them, and generates album pages with "previous/next" navigation —
no code change on the PixivFlow side, just one more `httpMultipart` target.

Start the telepress service first (any machine; use an internal address when colocated with PixivFlow):

```bash
pip install "telepress[api]"
telepress-server --host 0.0.0.0 --port 8000
```

Then add the target in `delivery.targets`:

```json
{
  "delivery": {
    "targets": {
      "telegraph": {
        "type": "httpMultipart",
        "url": "http://127.0.0.1:8000/publish/gallery",
        "fileField": "files",
        "fields": {
          "title": "{{title}}",
          "tags": "{{workTags}}",
          "link": "{{link}}",
          "spoiler": "{{spoiler}}"
        },
        "maxAttempts": 3,
        "retryDelayMs": 2000
      }
    }
  }
}
```

`title` becomes the album page title; `tags` renders the work's Pixiv tags as a `#tag` footer;
`link` generates a source link to the original work; R-18 works (`{{spoiler}}` is `true`) get an
adult-content notice attached to the first page. telepress auto-compresses each image to within 5 MiB and paginates at 100 images
per page, returning `{"ok": true, "url": "...", "files": N}`.

> **`success` does not participate in the verdict.** It is a legacy key, parsed only for compatibility with old configs: delivery outcomes are decided entirely
> by the business ACK (`ack` + `data.business_status`; see
> [delivery runtime architecture §5](../architecture/delivery-runtime.md), Chinese). It has been removed from the example above.

Note that the telepress album target only accepts image files;
novels are not submitted to this album target — they follow the rich-media novel chain below.

#### Rich-media novels → TelePress `/publish/rich-novel`

Pixiv novels now produce **structured artifacts**, no longer a single TXT: `novel.txt` (authoritative body),
`novel.md` (markdown sidecar with inline image references), `images/` (body illustrations), and `novel.zip`
(packaged archive). Delivery emphasizes "rich media, readable online" — do not describe it as "only downloads txt".

Point the `delivery.richNovelPreview` config of a novel target at TelePress's rich-media publishing endpoint;
PixivFlow uploads the `md` + `images` files, and TelePress handles Catbox upload, Markdown rendering, and
Telegraph page generation, finally writing the Telegra.ph reading link into the submission field (default
`novel_preview_url`):

```json
{
  "delivery": {
    "target": "telepost",
    "fields": { "title": "{{title}}", "tags": "{{workTags}}" },
    "richNovelPreview": {
      "url": "http://127.0.0.1:8000/publish/rich-novel",
      "headers": { "Authorization": "Bearer ${TELEPRESS_API_KEY}" },
      "timeoutMs": 60000,
      "field": "novel_preview_url"
    }
  }
}
```

Behavior highlights (`src/delivery/TelePressRichNovel.ts`):

- Plain-text novels (no `.md` sidecar or no `images/`) do not trigger rich-media publishing — they return
  `no_rich_novel_assets`, behaving exactly like the old chain.
- Each downloaded illustration's `url + localPath` is automatically read from the novel metadata sidecar and handed
  to TelePress as the `manifest` field (`[{"local": "images/001.jpg", "source": "https://i.pximg.net/..."}]`)
  alongside the multipart. With `TELEPRESS_PIXIV_PROXY_BASE` configured, TelePress rewrites matching Pixiv CDN
  sources to `<base>/pixiv/...` and uses them directly
  (`status=proxied`); without a proxy or on mismatch, it still falls back to uploading the local images to the image host.
  V1 still sends the image files as well, so the fallback does not depend on the proxy chain.
- If TelePress returns 4xx with unusable content, it is recorded per `operatorHint` (e.g. `telepress_http_401`)
  and diagnosable; network errors/timeouts/5xx are marked `retryable=true` and retried later by the outbox.
- On success the Telegraph `url` is injected into the field (default `novel_preview_url`) and submitted together
  with the normal submission/notification to receivers like TelePost; failures never delete the downloaded body artifacts.

Tasks are written into the SQLite `outbox` table before delivery. Failed delivery of a work does not delete downloaded files; no-candidate notifications are also
written into this outbox first, without depending on the current process's memory state. A standalone worker keeps consuming after the process starts;
`outboxRetryBaseMs` defaults to
`300000` (5 minutes), `outboxRetryMaxMs` defaults to `21600000` (6 hours), with exponential backoff after failures,
avoiding bandwidth burn during remote outages. Work files and metadata sidecars are deleted only after success.
Dead rows are formally replayed with `pixivflow outbox retry <id>` or `retry --dead`, idempotency keys unchanged;
`run-once` is not an outbox recovery command. `delivery.deleteAfterDelivery: false` can keep files for debugging.

## storage: storage & directory organization

| Field | Default | Description |
| --- | --- | --- |
| `databasePath` | `./data/pixiv-downloader.db` | SQLite database location |
| `downloadDirectory` | `./downloads` | Download root directory |
| `illustrationDirectory` | `{root}/illustrations` | Illustration directory, relative or absolute |
| `novelDirectory` | `{root}/novels` | Novel directory |
| `illustrationOrganization` / `novelOrganization` | `flat` | Directory organization mode, see the table below |
| `cacheRetentionDays` | `14` | How old (days) download caches `maintain` cleans up; `0` disables time-based cleanup |
| `cacheMaxSizeMB` | `0` | Hard size cap (MiB) of the download cache; on overflow, whole works are evicted oldest-first; `0` disables |

`cacheRetentionDays` and `cacheMaxSizeMB` can be used together: the maintenance task first cleans expired works, then,
if still over capacity, evicts the oldest whole works. Capacity cleanup never touches `delivery-outbox`, so files pending
delivery during a remote outage are kept. A 1 GiB Fly volume should set `cacheMaxSizeMB: 384`, reserving room for the database,
review data, and failure retries.

The 12 directory organization modes:

| Mode | Directory structure |
| --- | --- |
| `flat` | Everything flat in one directory |
| `byAuthor` | By artist name |
| `byTag` | By first tag |
| `byDate` | By work creation month `YYYY-MM` |
| `byDay` | By work creation day `YYYY-MM-DD` |
| `byDownloadDate` | By download month |
| `byDownloadDay` | By download day |
| `byAuthorAndTag` | Artist → tag, two levels |
| `byDateAndAuthor` | Creation month → artist |
| `byDayAndAuthor` | Creation day → artist |
| `byDownloadDateAndAuthor` | Download month → artist |
| `byDownloadDayAndAuthor` | Download day → artist |

Changing `*_Organization` does not move existing files automatically; run
`pixivflow normalize` to put them in place.

## scheduler: scheduled tasks

### Single-schedule compatibility format

| Field | Default | Description |
| --- | --- | --- |
| `enabled` | false | When true, the bare `pixivflow` command enters the scheduler directly |
| `cron` | `0 3 * * *` | Standard cron expression; common ones in the table below |
| `timezone` | `Asia/Shanghai` | IANA timezone name |
| `maxExecutions` | unlimited | Total execution cap; exits when reached (good for limited collection) |
| `minInterval` | 0 (ms) | Minimum interval between two runs; overly dense triggers are skipped |
| `timeout` | unlimited | Per-task timeout (ms); the run is terminated on timeout |
| `maxConsecutiveFailures` | unlimited | Stop the scheduler after N consecutive failures |
| `failureRetryDelay` | 0 (ms) | Wait interval after a failure |

On schedule failure or timeout, as long as the corresponding target's delivery target has `notificationUrl` configured, the review chat receives a
persistent ops notification; when auto-stopping at `maxConsecutiveFailures`, the same message states it explicitly.

### Multi-schedule format

A top-level `schedules[]`, when present, replaces the legacy `scheduler.cron`. Each entry inherits all run limits from the table above,
plus:

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Unique schedule id, also used for logs and independent failure/execution counters |
| `name` | no | Recognizable display name |
| `targetIds` | no | Target ids for this run; omitted or empty array means all targets |

All schedules still live in one PixivFlow process, sharing auth, database, and file services. Simultaneously triggered schedules
enter a global serial queue; each schedule keeps at most one pending instance, preventing unbounded backlog during outages.
On 512 MiB environments, stagger the crons and set `download.concurrency: 1`.

```json
{
  "schedules": [
    { "id": "bot1", "enabled": true, "cron": "10 5 * * *", "timezone": "Asia/Shanghai", "targetIds": ["bot1-art", "bot1-novel"] },
    { "id": "bot2", "enabled": true, "cron": "30 5 * * *", "timezone": "Asia/Shanghai", "targetIds": ["bot2-art", "bot2-novel"] }
  ]
}
```

`schedulerRuntime` controls the resident scheduler. **There is only one core question: who owns the wall clock (who triggers timed execution).**

| Field | Default | Description |
| --- | --- | --- |
| `mode` | `"internal"` | `internal` = this process runs on time with its own cron timers (VPS / Docker / systemd / Fly always-on / split PixivFlow). `external` = this process does **not** start cron and does **not** catch up history at startup; timed execution is only triggered by external authenticated HTTP (scale-to-zero / autosleep platforms, e.g. a stopped Fly machine woken by Cloudflare cron). Unset (legacy configs) is treated as `internal` — upgrade behavior unchanged. |
| `catchUpMissedRuns` | true | `internal` only: at process start, if a cron was missed during downtime, run once for **the missed canonical occurrence** (bounded — no unbounded history replay). Always off under `external`: being stopped is the normal money-saving state; cold starts never catch up. |
| `watchConfig` | true | Watch the current config file and hot-reload automatically |
| `reloadDebounceMs` | 500 | Debounce after file replacement, minimum 100ms |
| `queueLimit` | 8 | Global pending-schedule cap; each schedule still keeps only one entry |
| `resourceGovernance.pixivAccounts` | `{ "<accountId>": { "maxConcurrency": 1 } }` | **Resource capacity** (concurrency admission cap) per Pixiv account profile. Concurrency is governed by the real constrained resource, not by bot/schedule/target: all work sharing the same account (scheduled, fallback, manual refetch, manual recovery) shares the same capacity. Current production recommendation is `maxConcurrency: 1`; it can rise to 2 when real data proves it safe, with no scheduler architecture change. Waiting for capacity is normal queueing, not failure. |
| `trigger.enabled` | false | Whether to mount the authenticated HTTP trigger service. `external` mode **always** mounts it (the external clock depends on it); `internal` mode can set `true` to additionally open manual/ops triggers. HTTP triggering and "who owns the clock" are two orthogonal things. |
| `trigger.port` / `trigger.host` | 8090 / `0.0.0.0` | Trigger service listen address. When Fly injects `PORT`, `PORT` wins. |
| `trigger.token` | env | Bearer token; defaults to the `SCHEDULER_TRIGGER_TOKEN` environment variable. With neither, the trigger endpoint **rejects everything (fail-closed)**. The token never enters logs/responses. |
| `trigger.graceMinutes` | 90 | How long after its scheduled moment an occurrence still accepts external triggers (tolerating watchdog/network retries/wake latency). Beyond the window it is judged expired — no history backfill. |
| `queuedTimeoutMs` | 1800000 (30 min) | **Queue cap**: a slot still `pending` (including manual-refetch waiting queue) whose creation time exceeds this duration without starting execution → terminated as `failed` by the liveness sweep, reason code `queued_too_long` (user copy: "queue timeout, execution never started"). Avoids infinite pending while account capacity is busy. Values below 60 s are clamped to 60 s; non-numeric/invalid values only warn (non-fatal) and fall back to the default. |
| `stallTimeoutMs` | 900000 (15 min) | **Stall cap**: a `running` slot whose `heartbeat_at` (falling back to `started_at`, then `created_at`) has made no progress for this long **and** whose execution lease is dead → terminated as `failed` by the sweep, reason code `stalled_no_heartbeat` (user copy: "execution interrupted, no progress for a long time"). It is the fallback for "the process died and nobody knows", not a timeout retry. |
| `exitWhenIdle` | false | **external mode only**: the process exits on its own once the durable ledger is drained (no non-terminal Slot, no in-flight/undelivered outbox rows) — run-to-completion for autosleep platforms. It does not look at HTTP activity: the trigger endpoint returns as soon as the occurrence is durable, so HTTP idleness says nothing about whether a download has finished |
| `idleGraceMs` | 600000 (10 min) | Idle merge window before exiting (not a timeout): two schedules ten minutes apart are normally served by a single wake-up, and a delivery retry landing just after the run drains avoids a second cold start |
| `maxLifetimeMs` | 10800000 (3 h) | Lifetime cap of a single wake-up, preventing a machine from never exiting in abnormal situations |
| (sweep period) | 60 s | The resident scheduler sweeps every 60 s (floor 60 s, at most 100 rows per batch). In the same tick it **first resumes** interrupted slots (crash-resume), **then** terminates slots that exceed the caps without progress; just-resumed slots do not participate in this tick's termination (they haven't acquired a lease yet). The delivery side separately has `delivery_abandoned` ("submission unhandled, abandoned"): converges when a cell is `delivery_pending`/`selected` but has no executable delivery and no other running lease. |

**Trigger endpoint** (callable by any HTTP cron; Cloudflare is only the official reference adapter):

```
POST /internal/schedules/{scheduleId}/run
Authorization: Bearer <SCHEDULER_TRIGGER_TOKEN>
(optional JSON body) { "label": "今日早班" }   # human-readable source label only; not part of identity
```

The server resolves the canonical occurrence **only** from the schedule's own `cron` + `timezone` and the current moment; the request body accepts no date — history cannot be backfilled. Duplicate/concurrent/retry triggers all converge to the same durable occurrence.

Review-chat target-level refetch uses a separate endpoint:

```
POST /internal/targets/{targetId}/refetch
Authorization: Bearer <PIXIVFLOW_REFETCH_TOKEN>
{ "requestId": "<UUID>", "correlationId": "<opaque, ≤200 chars, optional>" }
```

When `PIXIVFLOW_REFETCH_TOKEN` is missing the endpoint rejects requests. A request selects only one target from an enabled schedule, and that target must have `refetchOutcomeUrl` plus an exact `refetch_request_id: "{{refetchRequestId}}"` delivery field configured. `requestId` is the retry idempotency key — repeated requests reuse the same `manual-` Slot; `correlationId` (usually the review-chain id) is persisted with the Slot, only used for result correlation after recovery — this service does not interpret its content. The server persists first, then returns `202 accepted` (`{status:"accepted", slotId, disposition}`), with execution and delivery in the background; manual Slots are separated from scheduled occurrences and never mark a scheduled task as completed. The manual Slot's request UUID is also written to `schedule_slots.manual_request_id`, so **after a sleeping machine resumes the Slot it still knows it is a manual replacement**: the delivery payload carries `refetch_request_id` (empty string for scheduled runs); on no candidate, duplicate, or final failure, `no_alternative` / `failed` is reported back through the `refetchOutcomeUrl` durable outbox. A successful replacement is correlated by the UUID carried in the submission itself. The `run-once` CLI remains an ad-hoc, Slot-less command.

The requester can read back the durable state with the same token: `GET /internal/targets/{targetId}/refetch/{requestId}`. When present it returns `{requestId, slotId, state, slotStatus}`; `state` is the cell state (`pending`, `selected`, `artifact_ready`, `delivery_pending`, `submitted`, `no_candidate`, `duplicate`, `failed`); mismatched request or target returns 404. `submitted` only means the downstream submission ACKed — the final review replacement is still governed by TelePost's review/attempt states. A dead-lettered outcome can be audited and retried by exact row with `pixivflow outbox retry <id>` after confirming the target config is fixed.

### Manual recovery (§manual-recovery)

"Try again / retry with relaxed conditions" for a failed target uses a separate endpoint (same `PIXIVFLOW_REFETCH_TOKEN`):

```text
POST /internal/targets/{targetId}/recover
Authorization: Bearer <PIXIVFLOW_REFETCH_TOKEN>
{ "requestId": "<UUID>", "retryMode": "normal" | "relaxed" }
```

- **Only named presets are accepted** (`normal` / `relaxed`, default `normal`); raw client
  acquisition parameters are never accepted. `relaxed` only relaxes soft items (lookbackDays / candidateScanLimit /
  languageCandidateLimit, including their caps); hard constraints are never relaxed.
- Overrides are occurrence-scoped: written to `schedule_slots.recovery_mode`, and crash-resume
  reuses the same preset; **global config is never written, future schedules are never affected**.
- Only failed targets are rerun (`onlyTarget`); the outcome goes through the schedule-outcome channel and renders "recovered" with a `recovery`
  marker — automatic execution history is not rewritten.
- Like refetch, it is durable before returning `202`; when resources are busy it queues (`disposition: "queued"`),
  which is not a failure. The same request UUID is idempotent; `GET /internal/targets/{targetId}/recover/{requestId}`
  reads back the state.

**Execution-source variables in delivery templates** (injected for Slotted scheduled and remote-refetch runs; empty for the `run-once` CLI):
`{{scheduleId}}`, `{{executionId}}` (durable occurrence id), `{{occurrenceAt}}` (ISO),
`{{triggerSource}}`, `{{refetchRequestId}}` (manual refetch UUID, otherwise empty string), plus the compatibility aliases
`{{slotId}}`/`{{slotName}}`/`{{slotDate}}`.
They are generic execution context and can be delivered to any HTTP endpoint — not bound to a specific downstream.

Before rendering, `refetch_request_id` is normalized to a hyphenated lowercase UUID: 32-char hex without hyphens,
uppercase, brace-wrapped, and `urn:uuid:`-prefixed spellings are all reduced to the same UUID (downstreams only accept the single canonical spelling,
otherwise the whole delivery is rejected with 400). The `manual-` Slot's identity keeps the caller's original spelling — only the delivery payload goes through
normalization; if the value is not a UUID at all (e.g. a callback key in the form `api:<reviewId>:<hex>`), the field is delivered as an empty string
with a warn logged — **a legitimate submission never fails because of a piece of unusable provenance**.

The hot-reload flow is "read new snapshot → defaults/path processing → full validation → wholesale replacement". On failure the old schedules
keep running. Running tasks are not interrupted; `YESTERDAY` / `TODAY` are recomputed
before each real execution. `schedules`, `targets`, `delivery`, `download` are hot-updatable; after changing
`pixiv`, `network`, `storage`, restart the process. Besides file watching, `SIGHUP` also works:

```bash
kill -HUP <pixivflow-pid>
```

Common cron expressions:

| Expression | Meaning |
| --- | --- |
| `0 3 * * *` | Daily at 03:00 |
| `0 */6 * * *` | Every 6 hours |
| `30 21 * * *` | Daily at 21:30 |
| `0 9 * * 1` | Mondays at 09:00 |

## network: network & proxy

| Field | Default | Description |
| --- | --- | --- |
| `timeoutMs` | 30000 | API request timeout (ms) |
| `retries` | 3 | Failure retry count |
| `retryDelay` | 1000 | Retry interval (ms) |
| `requestPacingMs` | unset | Request pacing floor (minimum interval between adjacent Pixiv API requests, ms); effective only when explicitly set — `0` disables pacing |

Proxy: `network.proxy`'s full fields are `enabled / host / port / protocol (http·https·socks4·socks5) / username / password`.

Environment-variable injection rules (common in container deployments): when `ALL_PROXY` / `all_proxy` >
`HTTPS_PROXY` > `HTTP_PROXY` (first non-empty wins) is set and the config has not explicitly enabled a proxy,
the program automatically parses and enables that proxy, supporting http and socks protocols. Details:
[DOCKER · environment variables](../DOCKER.md#环境变量参考) (Chinese). Health-check connectivity probes and login-token refresh (since 2.2.1) also follow this proxy.

## download: performance & stability tuning

| Field | Default | Description |
| --- | --- | --- |
| `concurrency` | 3 | Concurrent downloads |
| `requestDelay` | 500 | Minimum interval between adjacent API requests (ms), anti-rate-limit |
| `dynamicConcurrency` | true | Automatically lower concurrency on rate limiting |
| `minConcurrency` | 1 | Floor of dynamic adjustment |
| `maxRetries` | 3 | Maximum retries per file |
| `retryDelay` | 2000 | File-level retry interval (ms) |
| `timeout` | 60000 | Per-file download timeout (ms) |
| `assetNamespace` | `pixiv` | Media-asset id namespace (the prefix in e.g. `pixiv:<id>:novelcover`); lowercase letters/digits/dashes, max 32 chars; use distinct namespaces when multiple instances coexist so asset ids are not attributed across them |
| `maxFallbackStages` | `3` | Candidate recovery stage budget (0–10): when a required target has no candidates, the scan scope is widened stage by stage; only after the budget is exhausted may the run roll up as a degraded (partial) terminal result (§schedule-recovery) |
| `materializationPolicy` | `eager` | Novel preview media materialization policy: `eager` downloads local images up front (legacy behavior); `on-demand` keeps only MediaReference (`assetId`/`sourceUrl`) on the preview path — ZIP/archives are still materialized as needed |
| `novelCover.unknown` | `skip` | Policy when the novel cover's **content type cannot be recognized**: `skip` is the safe mode — an unrecognizable cover is not delivered as Telegram media (just not sent; no document is lost); `keep` favors availability. Pixiv-generated designed covers (exactly 640x900) are never delivered either way |
| `novelCover.probeFailed` | `skip` | Policy when **image fetching fails** (network/auth/rate-limit — bytes never seen): `skip` is the safe mode — the vast majority of novel covers are Pixiv-generated designed covers, and keeping an unjudged cover amounts to redelivering a design the classifier was meant to block; `keep` favors availability (one failed fetch does not cost the author's cover). Both values log a `coverType=probe_failed` warning |

### `download.novelCover`: novel cover content types

Pixiv puts author covers and its own on-the-fly rendered **designed covers** on the same CDN path (`novel-cover-master/img/...`, one independent hash per novel), and no API field distinguishes the two, so PixivFlow fetches the cover bytes during the download stage and judges the content type from the image header alone:

| Type | Identification | Behavior |
| --- | --- | --- |
| `custom` | Author cover (any non-640x900 canvas) | Delivered normally: `cover_url` + `:novelcover` media asset |
| `pixiv_generated` | Exactly 640x900 | Dropped: `cover_url: null`, no `:novelcover` asset produced |
| `unknown` | Image header unrecognizable | Per `download.novelCover.unknown` (default `skip`, i.e. not sent), with a `coverType=unknown` warning logged |
| `probe_failed` | Fetch failed (network/auth/rate-limit), bytes never seen | Per `download.novelCover.probeFailed` (default `skip`, i.e. not sent), with a `coverType=probe_failed` warning logged |

```json
{
  "download": {
    "novelCover": { "unknown": "skip", "probeFailed": "skip" }
  }
}
```

Diagnostics: `Novel <id> cover classified (coverType=custom)` in the logs means normal delivery; `coverType=pixiv_generated` means a Pixiv designed cover was dropped; `coverType=probe_failed` means fetching failed (kept or skipped per `novelCover.probeFailed`); `coverType=unknown` means the structure may have changed — check whether Pixiv's cover format changed, rather than flipping `unknown` to `keep` and moving on.

Raising concurrency does not always help — Pixiv's server-side rate limiting is sensitive; on heavy
429s, prefer raising `requestDelay` over stacking concurrency.

## Other top-level fields

| Field | Default | Description |
| --- | --- | --- |
| `logLevel` | `info` | `debug` / `info` / `warn` / `error` |
| `initialDelay` | 0 | Delay after startup (ms), for debugging |

## Environment variable overrides

Same-named environment variables override the corresponding config fields, taking priority over JSON:

| Variable | Override target |
| --- | --- |
| `PIXIV_REFRESH_TOKEN` | `pixiv.refreshToken` |
| `PIXIV_CLIENT_ID` / `PIXIV_CLIENT_SECRET` | OAuth credentials |
| `PIXIV_DOWNLOAD_DIR` | `storage.downloadDirectory` |
| `PIXIV_DATABASE_PATH` | `storage.databasePath` |
| `PIXIV_ILLUSTRATION_DIR` / `PIXIV_NOVEL_DIR` | Per-type subdirectories |
| `PIXIV_LOG_LEVEL` | `logLevel` |
| `PIXIV_SCHEDULER_ENABLED` | `scheduler.enabled` (`true`/`false`) |
| `PIXIV_DOWNLOADER_CONFIG` | Directly specify the config file path |

Docker deployment is built on exactly this mechanism; the full mapping is in [DOCKER](../DOCKER.md) (Chinese).

## Date placeholders

The three fields `startDate`, `endDate`, `rankingDate` support two placeholders,
replaced with the current date at execution time:

- `YESTERDAY` — yesterday (the recommended writing for "collect yesterday's new works" on a daily schedule);
- `TODAY` — today.

Combined with the scheduler, targets like "yesterday's daily ranking" need no daily config edits.

---

## Related documents

- [USAGE](USAGE.md) — overall usage and examples of each download mode
- [LOGIN](LOGIN.md) — where the refreshToken comes from
- [DOCKER](../DOCKER.md) (Chinese) — environment variables vs. containers
- [../config/examples/](https://github.com/redtidev1918/PixivFlow/tree/master/config/examples) — official example config collection
