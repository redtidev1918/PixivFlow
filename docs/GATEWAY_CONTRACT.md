# Gateway Contract v1

> 这份文档是**规范**：它定义一个外部网关必须实现什么，PixivFlow 就会怎么和它对话。
> 面向「怎么写一个网关」的教程式说明在 [GATEWAY.md](GATEWAY.md)；
> 这份文档面向「网关的接口长什么样」。
>
> **本文件的词汇表由代码生成并被测试钉住**：`src/delivery/gatewayContract.ts` 是同一个契约
> 的可执行形式，`src/__tests__/delivery/gateway-contract.test.ts` 会逐行比对本文档的表格
> 与那份代码。改契约必须同时改两处，否则测试失败。

## 0. 一句话

PixivFlow **不知道** QQ、微信、OneBot、NapCat、Telegram、Discord 是什么。它只认识一个契约：

```
PixivFlow ──POST /deliver──▶ 外部网关 ──▶ 平台
PixivFlow ──GET  /pairing──▶ 外部网关      （可选：扫码/登录态展示）
运维      ──GET  /health ──▶ 外部网关      （可选：网关自检）
```

平台协议、登录态、凭据、二维码生成全部在网关里。PixivFlow 只负责「有一份作品要送出去」，
以及「这件事到底成没成」的账本。

## 1. 端点

| 端点 | 方法 | 必需 | PixivFlow 配置字段 |
| --- | --- | --- | --- |
| `/deliver` | POST | 是 | `delivery.targets.<name>.url` |
| `/pairing` | GET | 否 | `delivery.targets.<name>.pairingUrl` |
| `/health` | GET | 否 | `pixivflow gateway status` |

三条约束需要说清楚：

1. **`/deliver` 是唯一必需的端点。** 没有它，什么都送不出去。
2. **路径是约定，不是硬编码。** 命令 `delivery.targets.<name>.url` 指向哪个 URL，PixivFlow 就
   POST 到哪个 URL —— 它的价值在于让所有网关长得一样，而不是限制你必须用某个路径。如果你
   的网关只能挂在 `/webhook/pixiv` 上，也完全可以，PixivFlow 不关心。
3. **`/health` 永远不会成为投递的前置条件。** PixivFlow 从不因为健康检查没过就跳过投递 ——
   一个能拦住投递的健康检查会把「一次失败」变成「两次失败」。它的消费者是运维，不是投递链路。

`pairingUrl` 未配置时，WebUI 不会显示「配对」按钮，`GET /api/gateways/<name>/pairing` 返回
`404 GATEWAY_PAIRING_UNSUPPORTED`。这条只在 `type: "webhook"` 的路由上成立。

## 2. 消息 Schema（`POST /deliver` 的请求体）

请求体就是 `docs/GATEWAY.md` §1 里那个统一消息文档，逐字对应
`src/__tests__/fixtures/gateway-wire-example.json`。字段速查：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 契约版本，当前恒为 `1`。**网关必须拒绝它不认识的版本**，而不是猜。 |
| `idempotencyKey` | PixivFlow 为这次投递生成的稳定键。网关必须按它去重。 |
| `deliveryTarget` | 路由名；未经配置时为 `null`。 |
| `work.id` / `work.type` / `work.title` / `work.sourceUrl` / `work.spoiler` / `work.tags` | 作品元数据。`type` 只会是 `illustration` 或 `novel`。 |
| `message.text` | 正文（标题、标签、简介等已由 PixivFlow 拼好）。 |
| `message.mediaTransport` | `reference` 或 `base64`（见 §3）。 |
| `message.parts` | 有序内容片段：`{kind, media?}`，决定平台侧的顺序。 |
| `message.media` | 媒体清单，元素见 §3。 |
| `message.dropped` | 因平台能力限制被丢弃的片段，带 `reason`。 |
| `delivery.idempotencyKey` / `slotId` / `targetId` / `executionId` / `triggerSource` | 这次投递的上下文，便于网关写日志、归因。 |

### 关于「URL 还是路径」

`message.media[]` 里没有 `url` 字段可以给平台直接拉取。这是**规格里唯一容易和直觉冲突的地方**，
所以单独说明：

- `reference` 传输给的是 `path` —— **PixivFlow 主机上的绝对路径**，只有和 PixivFlow 同机的
  网关能直接读；
- `base64` 传输给的是 `dataBase64` —— 跨机部署时用它，代价是体积。

`sourceUrl`（Pixiv 原图地址）会一起带上，但它是**元数据**，不是投递通道：Pixiv 的原图 URL 需要
Referer/登录态，让网关去拉通常会失败或被防盗链拦掉。网关要么能被 PixivFlow 读到文件（同机
挂载），要么要求 `base64`。这条在 [GATEWAY.md §容器/Fly.io](GATEWAY.md) 里有部署细节。

## 3. 媒体条目

| 字段 | 出现条件 | 含义 |
| --- | --- | --- |
| `kind` | 恒有 | `image` / `video` / `file` |
| `path` | `reference` | PixivFlow 主机上的绝对路径 |
| `dataBase64` | `base64` | 内联内容；受 `maxInlineBytes` 约束 |
| `mime` | 可能有 | MIME 类型 |
| `size` | 可能有 | 字节数 |
| `sourceUrl` | 可能有 | Pixiv 原始地址（**仅元数据**） |
| `assetId` | 可能有 | 稳定的媒体资产 id，可用于跨次投递去重 |

「文件走 `upload_group_file`」这类平台机制**不出现在契约里**，它属于网关内部。网关要做的映射是：

| 契约条目 | QQ/OneBot 网关 | Telegram 网关 | Discord 网关 |
| --- | --- | --- | --- |
| `kind: "file"` | `upload_group_file` | `sendDocument` | attachment |
| `kind: "image"` | `send_group_msg` 图片段 | `sendPhoto` / `sendMediaGroup` | attachment |
| `kind: "video"` | 视频段 | `sendVideo` | attachment |

PixivFlow 只声明 `kind`；怎么送是网关的事。**不要把这些分支写进 PixivFlow 核心。**

## 4. 请求头

| 头部 | 出现条件 | 说明 |
| --- | --- | --- |
| `Content-Type: application/json` | 恒有 | |
| `X-PixivFlow-Delivery` | 恒有 | 路由名（未配置时 `unknown`） |
| `X-Idempotency-Key` | 恒有 | 与 body 里的 `idempotencyKey` 相同，便于在 body 之前就去重 |
| `Authorization: Bearer <token>` | 配了 `token` 时 | 值支持 `${ENV_VAR}` 引用 |
| `X-Webhook-Timestamp` | 配了 `signingSecret` 时 | Unix 秒 |
| `X-Webhook-Signature` | 配了 `signingSecret` 时 | `sha256=<hex>`，见 §6 |

## 5. 响应与 ACK 词汇表

网关**必须**用 JSON 回答，并给出一个 `status` 词。HTTP 200 **不等于**投递成功 —— 这一条的
理由很直接：`200 {status:"failed"}` 是业务失败，如果按 HTTP 状态判断，账本就会把一次失败记成
成功，而这类错误在事后永远查不出来。

词汇表的完整分类如下（由 `GATEWAY_ACK_VOCABULARY` 生成）：

| `status` 词 | 分类 | PixivFlow 怎么做 |
| --- | --- | --- |
| `accepted` | accepted | 记为投递成功 |
| `ok` | accepted | 记为投递成功 |
| `success` | accepted | 记为投递成功 |
| `published` | accepted | 记为投递成功 |
| `sent` | accepted | 记为投递成功 |
| `delivered` | accepted | 记为投递成功 |
| `duplicate` | duplicate | 记为重复，**不会重发** |
| `duplicate_existing` | duplicate | 记为重复，**不会重发** |
| `already_exists` | duplicate | 记为重复，**不会重发** |
| `replayed` | duplicate | 记为重复，**不会重发** |
| `pending` | pending | 可重试：按同一 idempotencyKey 继续投 |
| `queued` | pending | 可重试：按同一 idempotencyKey 继续投 |
| `accepted_pending` | pending | 可重试：按同一 idempotencyKey 继续投 |
| `submitted` | pending | 可重试：按同一 idempotencyKey 继续投 |
| `processing` | pending | 可重试：按同一 idempotencyKey 继续投 |
| `failed` | remote_failed | 业务失败，**终态、不重试** |
| `rejected` | remote_failed | 业务失败，**终态、不重试** |
| `invalid` | remote_failed | 业务失败，**终态、不重试** |
| `expired` | remote_failed | 业务失败，**终态、不重试** |
| `blocked` | remote_failed | 业务失败，**终态、不重试** |
| `HTTP 429` | retryable_failure | 限流，按退避重试 |
| `HTTP 5xx` | retryable_failure | 网关侧故障，按退避重试 |
| `HTTP 4xx (other than 409)` | permanent_failure | 载荷被确定性拒绝，**直接进死信，不烧重试预算** |

### HTTP 状态码本身怎么判

**先看词，再看码。** 如果 body 里的 `status` 是上表里的某个词，那个词就是结论，HTTP 状态码不再参与
判断。这条必须写清楚，因为它有个反直觉的后果：

> 一个网关如果对 401/400/500 也回 `{"status":"rejected"}`，PixivFlow 会把它当成**业务终态失败**，
> 直接进死信、**不再重试** —— 而 401 本来是应该重试的（token 配错了，改完配置就该重投）。

所以想表达「这次请求本身有问题，按 HTTP 码处理」时，**不要给 `status` 词**，
只回 `{"reason":"..."}` 或 `{"error":"..."}`。下面的表就是不带 `status` 词时的判据：

| HTTP 状态 | 结果 |
| --- | --- |
| `409` | duplicate |
| `429` | retryable，按退避重试 |
| `5xx` | retryable，按退避重试 |
| 其他 `4xx` | permanent_failure，进死信 |
| `2xx`（无 `status` 词） | 成功 |
| `2xx` 且 `status` 是 accepted 词 | 成功 |
| `2xx` 且 `status` 是 duplicate 词 | duplicate |
| `2xx` 且 `status` 是 pending 词 | retryable |
| `2xx` 且 `status` 是无法识别的词 | **retryable** —— 不认识的答复不能当成成功 |

举几个判据边界上的例子（都在测试里钉住）：

| 网关回答 | 结果 | 为什么 |
| --- | --- | --- |
| `200 {"status":"failed"}` | 业务失败，终态 | 词优先于码 |
| `200 {"status":"probably-fine"}` | retryable | 不认识的词不敢当成功 |
| `200 {"reason":"bad payload"}` | 成功 | 无词 + 2xx |
| `401 {"reason":"unauthorized"}` | permanent_failure | 无词，看码 |
| `401 {"status":"rejected"}` | 业务失败，终态 | **词优先**，反直觉但已定型 |
| `500 {"reason":"internal error"}` | retryable | 无词，看码 |

可选补充字段（都可省略）：

| 字段 | 用途 |
| --- | --- |
| `id` 或 `message_id` | 远端消息 id，写进账本 |
| `reason` / `error` / `message` | 失败原因，脱敏后进账本与日志 |

### 幂等性由网关负责

PixivFlow 保证**同一个 `idempotencyKey` 只会对应一次业务投递**，并在重试时原样重发。网关必须：

- 见过这个 key 且已成功 → 回 `duplicate_existing`（或 HTTP 409）；
- 见过但没成功 → 允许重试；
- 没力气做持久化的网关，至少要在进程内短期记住。

网关**不该**做的：用「没收到 key」当理由重复发布，或者把 key 当成随机数忽略。

## 6. 签名验证

配了 `signingSecret` 时，PixivFlow 会发：

```
X-Webhook-Timestamp: 1735689600
X-Webhook-Signature: sha256=<HMAC-SHA256(secret, "<timestamp>.<raw body>") 的十六进制>
```

网关必须：

1. 用**原始请求体字节**（不是重新序列化的 JSON）计算 HMAC；
2. 比对时用恒定时间比较；
3. 校验时间戳新鲜度（建议 5 分钟窗口），防重放。

## 7. `GET /pairing`

存在意义：让 WebUI 的投递面板能展示「这个网关的账号登没登」。**PixivFlow 只读不写** —— 它不
生成二维码、不跑登录协议、不提交验证码、不存 session。

回答形状：

```json
{
  "status": "waiting",
  "qrCode": "data:image/png;base64,iVBORw0KGgo..."
}
```

或已经登录时：

```json
{
  "status": "connected",
  "account": "123456789"
}
```

| 字段 | 必需 | 含义 |
| --- | --- | --- |
| `status` | 否（缺失即 `unknown`） | 见下表 |
| `qrCode` / `qr_code` / `qrcode` / `dataUrl` / `data_url` / `image` | 否 | 二维码图片，**必须是 `data:image/*;base64,` 形式**；WebUI 只在这个形状下渲染图片，其余一律当文本显示（防止把 HTML 登录页渲染成二维码） |
| `contentType` + `base64` | 否 | 等价的图片表达方式 |
| `account` | 否 | 已登录账号的可展示标识 |

| `status` 值 | 含义 |
| --- | --- |
| `unknown` | 网关没报告状态 |
| `unreachable` | 探测不到 |
| `waiting` | 等待扫码/登录 |
| `connected` | 已登录 |

**只读透传的两个后果**，必须在实现里体现：

- 网关回答非 2xx 时，PixivFlow 不报错，而是把响应包成 `pairable: false` 并附
  `GATEWAY_PAIRING_UNAVAILABLE`，同时**保留网关原文**；
- 网关回答 HTML（例如把 NapCat 的人类面板当成 `pairingUrl`），WebUI 会把 HTML 当文本显示。
  这不是 PixivFlow 的缺陷，是「只读展示」的定义。

## 8. 能力声明（`capabilities`）

网关可以通过 PixivFlow 侧配置声明自己的限额，PixivFlow 会据此决定怎么发（截断、拆分、拒绝）。
这是**配置**，不是网关要实现的端点。见 [CONFIG.md](CONFIG.md) 与
[delivery-runtime.md](architecture/delivery-runtime.md)。

两条不可协商的规则：

- 尺寸类限额只能**收紧**（`Math.min`）—— 网关声明「最多 1024 字」比平台实际更严是安全的，
  声明得更宽则会让 PixivFlow 发出必然被拒的消息；
- 节奏类限额只能**放宽/更保守**（`Math.max`）；
- `album` 是**平铺**字段：`{"album": true, "albumMin": 2, "albumMax": 9}`，
  不是嵌套对象。

## 9. 错误码（PixivFlow 侧）

WebUI 暴露的、与网关相关的错误码：

| 错误码 | 何时出现 |
| --- | --- |
| `GATEWAY_LIST_FAILED` | 读取网关列表失败 |
| `GATEWAY_NOT_FOUND` | 路由名不存在或非法 |
| `GATEWAY_PAIRING_UNSUPPORTED` | 该路由没配 `pairingUrl` |
| `GATEWAY_PAIRING_UNAVAILABLE` | 网关对 `/pairing` 回答了非 2xx |
| `PAIRING_READ_FAILED` | 连不上网关，或响应读不下来 |
| `DELIVERY_LIST_FAILED` | 读取投递历史失败 |
| `DELIVERY_NOT_FOUND` | 投递记录不存在 |
| `DELIVERY_STATUS_INVALID` | 查询参数里的 `status` 不是合法值 |

## 10. 版本协商

`schemaVersion` 是**契约的版本号**，不是载荷的版本号。

- 网关**必须**拒绝它不支持的 `schemaVersion`，而不是尽力解析 —— 猜错形状的后果是悄悄发出错误的
  内容，这比失败更糟。
- 推荐用 `400 {"reason":"unsupported schemaVersion: N"}`：不带 `status` 词，因此按 HTTP 码判为
  **永久失败**，直接进死信。这样运维会在死信里看到一条能读懂的消息，而不是一个安静地反复重试
  然后消失的投递。
- 版本号只在**破坏性变更**时递增。新增可选字段不递增版本；网关应当忽略自己不认识的字段。

## 11. 这不是什么

- **不是 Bot 平台。** PixivFlow 不托管任何平台账号，不实现任何聊天协议。
- **不是插件接口。** 网关是独立进程，通过 HTTP 对话；PixivFlow 不加载网关代码。
- **不是 AstrBot 适配层。** AstrBot 是 AGPL-3.0，与 PixivFlow 之间**只**通过这个 HTTP 契约
  交互，不共享代码。
- **不是「每种平台一个 PixivFlow Adapter」。** 平台数量增长发生在网关侧，PixivFlow 侧不发生。

## 相关文档

- [`examples/gateway/`](../examples/gateway/README.md) —— 本文档的零依赖参考实现（`server.mjs`），被测试直接启动验证
- [GATEWAY.md](GATEWAY.md) —— 面向网关作者的实现指南与配置样例
- [delivery-runtime.md](architecture/delivery-runtime.md) —— PixivFlow 侧的投递运行时
- [API.md](API.md) —— 只读投影端点（`/api/gateways`、`/api/deliveries`）
- [CONFIG.md](CONFIG.md) —— `delivery.targets` 全部字段
