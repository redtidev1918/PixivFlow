# 外部网关投递（PixivFlow → 你的网关 → 平台）

这份文档给出**两条具体路径**，把 PixivFlow 的作品投递到一个自己写的网关：

1. **通用网关（`type: "webhook"`）** —— 任何语言、任何部署形态都能接。PixivFlow POST 一份统一消息 JSON，网关负责把它变成某个平台的调用。
2. **QQ / OneBot v11（网关侧模式）** —— PixivFlow **不实现** OneBot 协议；由你的网关（或社区实现如 NapCat / Lagrange / LLOneBot）对 QQ 说话，PixivFlow 只对它说话。

> 为什么不在 PixivFlow 里内置这些平台？见
> [投递运行时架构 §5](architecture/delivery-runtime.md)：PixivFlow 只做 **Messaging Gateway
> Client**（内容获取 + 投递账本 + durable outbox），平台协议、扫码登录、会话与凭据留在网关侧。
> 这样平台故障、协议变更、封号风险都不会进入下载与审核链。

## 1. 最小可用配置

放在 `config/<你的配置>.json` 的 `delivery` 段里（完整可加载样例见
[`config/examples/standalone.config.multi-delivery.json`](../../config/examples/standalone.config.multi-delivery.json)）：

```json
{
  "delivery": {
    "targets": {
      "my-gateway": {
        "type": "webhook",
        "url": "https://gateway.example/pixivflow/deliver",
        "token": "${MY_GATEWAY_TOKEN}",
        "signingSecret": "${MY_GATEWAY_SIGNING_SECRET}",
        "timeoutMs": 30000,
        "mediaTransport": "reference",
        "capabilities": {
          "maxTextLength": 4096,
          "maxCaptionLength": 1024,
          "maxAttachmentsPerMessage": 10,
          "maxUploadBytes": 52428800,
          "supportsAlbum": true,
          "albumMin": 2,
          "albumMax": 10,
          "minSendIntervalMs": 500,
          "truncatePolicy": "split",
          "idempotencyMechanism": "upstream_ledger"
        }
      }
    }
  },
  "targets": [
    {
      "id": "daily-hot",
      "storageMode": "cache",
      "delivery": { "targets": ["my-gateway"] }
    }
  ]
}
```

- **凭据只写 `${ENV}` 引用**，绝不写明文；PixivFlow 也不会把它们的值写进日志、WebUI 响应或数据库。
- `delivery.targets`（数组）是扇出入口：一个作品可以被投递到多条路由，彼此**独立失败、独立重试**。
- `delivery.target`（单值）是历史写法，仍可用；两者并存时数组优先。
- 未配置任何路由时，行为与没有投递能力时**完全一致**（投递是可选能力）。

配置检查：`pixivflow config validate`；连通性观察：`pixivflow gateway test my-gateway`
（**只证明端点是否应答，绝不等于投递成功**）。

## 2. 请求：PixivFlow 会 POST 什么

`POST <url>`，JSON body：

```json
{
  "schemaVersion": 1,
  "idempotencyKey": "pixivflow:my-gateway:illustration:12345678:daily-hot:daily-hot",
  "deliveryTarget": "my-gateway",
  "work": {
    "id": "12345678",
    "type": "illustration",
    "title": "作品标题",
    "sourceUrl": "https://www.pixiv.net/artworks/12345678",
    "spoiler": false,
    "tags": []
  },
  "message": {
    "text": "作品标题\nhttps://www.pixiv.net/artworks/12345678",
    "mediaTransport": "reference",
    "parts": [
      {
        "kind": "text"
      },
      {
        "kind": "image",
        "media": {
          "kind": "image",
          "path": "/data/artifacts/12345678_p0.jpg",
          "mime": "image/jpeg",
          "size": 1234567
        }
      }
    ],
    "media": [
      {
        "kind": "image",
        "path": "/data/artifacts/12345678_p0.jpg",
        "mime": "image/jpeg",
        "size": 1234567
      }
    ],
    "dropped": []
  },
  "delivery": {
    "idempotencyKey": "pixivflow:my-gateway:illustration:12345678:daily-hot:daily-hot",
    "slotId": "daily-hot",
    "targetId": "daily-hot",
    "triggerSource": "schedule"
  }
}
```

要点：

| 字段 | 语义 |
| --- | --- |
| `idempotencyKey` | **同一个作品同一条路由恒等**。重试会复用同一个 key ⇒ 网关应据此去重，而不是靠 `message_id` 猜。 |
| `message.parts` | 按顺序的投递单元（`text` / `image` / `album` / `file` / `video`）。顺序就是渲染顺序；同一张图在 album 里会出现多次。 |
| `message.media` | 媒体清单（与 `parts` 里每一项的 `media` 同形）。字段：`kind`、`path`（`reference`）、`dataBase64`（`base64`）、`mime`、`size`、`sourceUrl`、`assetId`——除 `kind` 外都是**存在时才出现**。 |
| `message.dropped` | 因 capability 或契约被丢掉的媒体及原因（**不要静默忽略；这是给你排障用的**）。 |
| `work.spoiler` | 平台若有剧透/折叠能力请遵守；不支持就原样发。 |
| `work.tags` | 预留字段：**当前恒为空数组**，不要依赖它取标签（需要标签时用 `message.text`）。 |

### 媒体传输：`reference` 还是 `base64`

| `mediaTransport` | `media[].file` | 网关需要什么 |
| --- | --- | --- |
| `reference`（默认） | `media[].path` = 本机**绝对路径** | 网关与 PixivFlow 共享文件系统（同容器 / 同主机）。网关负责读取该文件。 |
| `base64` | `media[].dataBase64`（没有 `path`） | 网关无需文件访问；受 `maxInlineBytes` 限制，超限**直接拒绝**而不发大包。 |

`reference` 是**读契约**：PixivFlow 只为这次投递保留文件，投递成功后
（`accepted` / `idempotent_replay` / `duplicate_existing`）由 outbox 清理。
网关应**在响应之前**把字节读走或转存。

### 请求头

| 头 | 说明 |
| --- | --- |
| `X-PixivFlow-Delivery` | 固定标识，便于网关做路由与鉴权前置判断。 |
| `X-Idempotency-Key` | 与 body 里的 `idempotencyKey` 同值，便于只用头做去重。 |
| `Authorization: Bearer <token>` | 配了 `token` 时才带。 |
| `X-Webhook-Timestamp` / `X-Webhook-Signature` | 配了 `signingSecret` 时才带，见下。 |

### HMAC 签名怎么验

```
X-Webhook-Timestamp: 1735689600
X-Webhook-Signature: sha256=<hex>

待签串 = `${X-Webhook-Timestamp}.${原始请求体}`
签名   = HMAC-SHA256(signingSecret, 待签串) 的十六进制
```

**必须用原始 body 字节做 HMAC**（先验签再 `JSON.parse`，或保留 raw body）。建议同时做时间窗校验。

## 3. 响应：网关必须回答什么

PixivFlow 只看状态码和 body 里的状态词，**HTTP 200 不等于业务成功**
（`business terminal > HTTP success` 是本项目的硬不变量）：

| 网关回答 | PixivFlow 判定 | 后续行为 |
| --- | --- | --- |
| `2xx` + 无状态词 | `accepted`（成功） | 记录 `remote_id`（若有），清理文件 |
| `2xx` + `published` / `ok` / `success` / `accepted` 等 | `accepted` | 同上 |
| `2xx` + 未知状态词 | **可重试** | 按退避重试；不要用「200 + 奇怪字段」表示失败 |
| `2xx` + `failed` / `rejected` / `invalid` / `expired` / `blocked` | `remote_failed`（**终态**） | 记账为失败，**不重试**（幂等键已钉死这条记录） |
| `2xx` + `pending` / `queued` / `processing` 等 | **可重试** | 网关异步处理时用这个，PixivFlow 会再来问 |
| `409` 或状态词含 `duplicate` | `duplicate_existing`（成功） | 认为之前已投递，清理文件 |
| `429` 或 `5xx` | **可重试** | 指数退避 + full jitter（上限 6 小时），超过 `max_attempts` 进 dead letter |
| 其它 `4xx` | `permanent_failure` | **首轮即 dead**，不浪费重试预算 |
| 连接失败 / 超时 | **可重试** | 传输层失败必须由网关主动 `throw`（PixivFlow 侧即视为可重试） |

推荐响应体：

```json
{ "status": "accepted", "remote_id": "gw-9f2c1a", "message": "sent to QQ group 123456" }
```

或异步时：

```json
{ "status": "pending", "message": "queued for the next QQ rate-limit window" }
```

失败时把**原因**放在 body 里（会被记进 `last_error`，见 `pixivflow delivery status`）。

## 4. 你的能力声明（`capabilities`）决定 PixivFlow 怎么发

PixivFlow 会读你声明的 capability 来组装消息，**只收紧、不放宽**：
覆盖值比内置档案更严格时生效，更宽松时会被忽略（节流只能加严）。

| 字段 | 作用 |
| --- | --- |
| `maxTextLength` / `maxCaptionLength` | 文本与图文说明的长度上限；超限按 `truncatePolicy` 处理 |
| `maxAttachmentsPerMessage` | 单条消息附件上限 ⇒ 超过就自动拆成多条 |
| `maxUploadBytes` | 单文件字节上限 ⇒ 超过的媒体进 `dropped[]`（或走文件消息） |
| `supportsAlbum` / `albumMin` / `albumMax` | 是否支持相册（一次多图）；`albumMin` 不足/`albumMax` 超出都会降级为逐条 |
| `minSendIntervalMs` | 最小发送间隔（慢者胜）；例：OneBot 侧建议 ≥500ms，防封号 |
| `truncatePolicy` | `split`（拆条）/ `truncate`（截断）/ `error`（宁可失败不截断） |
| `idempotencyMechanism` | `none` / `platform_key` / `upstream_ledger`；只是**声明**，实际去重仍由 PixivFlow 的账本承担 |

不确定就**不要声明**：内置档案是保守的文字优先，宁可发得朴素，也不要让 PixivFlow 以为你支持相册而丢图。

## 5. 具体例子：QQ / OneBot v11（网关侧）

PixivFlow 不做 OneBot 协议；下面这套是你网关里的**对接形状**（协议细节以
[OneBot v11 规范](https://github.com/botuniverse/onebot-11) 与你的实现文档为准）：

```
PixivFlow --HTTP POST(统一消息 JSON)--> 你的网关 --OneBot v11 HTTP--> NapCat / Lagrange / LLOneBot --> QQ
```

网关侧要做三件事：

1. **收**：验签 + 按 `idempotencyKey` 去重 + 立刻返回 `accepted` / `pending`。
2. **转**：把 `message.parts` 变成 OneBot 消息段数组（`text` 段 + 多个 `image` 段即「多图一条」）。
   - `image` 段的 `file` 支持本地路径 / `http(s)://` / `base64://`；`reference` 模式下先用
     `download_file` 或共享盘路径拿到字节最稳。
   - **文件附件不是消息段**：走 `upload_group_file {group_id, file, name}`（两段式），再发一条提示消息。
   - 发送 API 形如 `POST /send_group_msg`，body 就是 `{group_id, message:[...]}`，**路径即 action**；
     鉴权 `Authorization: Bearer <token>`。
3. **答**：把 OneBot 的 `retcode` 映射成上表的状态词 —— `retcode 0` → `accepted`；
   `status:"async"` 或 `retcode 1` → **`pending`**（结果不可知，别报成功）；
   HTTP 401/403/404 → 让请求以 4xx 失败（PixivFlow 会首轮判永久失败，不浪费重试）。

网关自己建议声明：

```json
{ "capabilities": { "maxTextLength": 4000, "supportsAlbum": true, "albumMin": 2, "albumMax": 9, "minSendIntervalMs": 500 } }
```

**不要让 PixivFlow 直接对 QQ 说话**：token、风控、限速、掉线重连、协议版本漂移都属于网关。

## 6. 安全与部署

- **网络**：网关 URL 若指向内网地址，请确认 PixivFlow 所在主机可达；不要把 token 放进 URL query（会进日志/代理访问日志）。
- **凭据**：只用 `${ENV}`；PixivFlow 的响应与日志都会脱敏，但**网关侧的错误体可能被 relay** —— 别在错误信息里回显你自己的凭据。
- **重定向**：默认**不跟随**重定向（避免凭据被转发到第三方）；确有需要时用 `pairingAllowRedirects`/网关侧显式配置。
- **配对/扫码**：由网关承担。若它暴露一个配对端点，可用 `pairingUrl` 让 WebUI 只读渲染
  （`GET /api/gateways/:name/pairing`，透传，不落库）——见 [API 文档](../API.md#配对透传-get-apigatewaysnamepairing)。
- **不要把 WebUI 暴露到公网**：见 [部署文档](../DOCKER.md) 的鉴权说明。

## 7. 运维与排障

```bash
pixivflow gateway list                     # 有哪些路由、是否启用、连接状态
pixivflow gateway test my-gateway          # 端点是否应答（不等于投递成功）
pixivflow delivery status                  # 按路由的 pending/delivered/failed 计数
pixivflow delivery status --target my-gateway --limit 20
pixivflow delivery retry                   # 默认只预览
pixivflow delivery retry --yes             # 只重开仍欠投递的路由（不会重发已确认的）
pixivflow outbox list --status dead        # 需要人工介入的行
```

WebUI 的只读投影：`GET /api/gateways`、`GET /api/gateways/:name/pairing`、
`GET /api/deliveries`（每条意图带 `outboxStatus`，说明**是否还会有人去重试**）、
`GET /api/deliveries/:id`（意图 + 事件轨迹）。**WebUI 里没有重试按钮** ——
人工重试是经过审计的 CLI 动作（记 `actor=cli` 事件）。

## 相关文档

- [投递运行时架构](architecture/delivery-runtime.md) —— 平面分层、账本与幂等、扇出、capability
- [配置说明](../CONFIG.md) —— `delivery.*` 全部字段与校验规则
- [API 文档](../API.md) —— `/api/gateways*`、`/api/deliveries*` 的请求/响应与错误码
