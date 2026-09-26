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
          "mime": "image/jpeg"
        }
      }
    ],
    "media": [
      {
        "kind": "image",
        "path": "/data/artifacts/12345678_p0.jpg",
        "mime": "image/jpeg"
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
| `delivery.slotId` / `targetId` / `triggerSource` | 该次投递的**来源身份**（哪个 slot、一次手动还是定时触发）。用于网关侧归因与排障；它们不参与去重（去重只看 `idempotencyKey`）。 |
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
| `2xx` + 无状态词 | `accepted`（成功） | 记录远端 id（若 body 里有 `id` 或 `message_id`），清理文件 |
| `2xx` + `published` / `ok` / `success` / `accepted` 等 | `accepted` | 同上（`status` 词本身已识别，未知词见下一行） |
| `2xx` + 未知状态词 | **可重试** | 按退避重试；不要用「200 + 奇怪字段」表示失败 |
| `2xx` + `failed` / `rejected` / `invalid` / `expired` / `blocked` | `remote_failed`（**终态**） | 记账为失败，**不重试**（幂等键已钉死这条记录） |
| `2xx` + `pending` / `queued` / `processing` 等 | **可重试** | 网关异步处理时用这个，PixivFlow 会再来问 |
| `409` 或状态词含 `duplicate` | `duplicate_existing`（成功） | 认为之前已投递，清理文件 |
| `429` 或 `5xx` | **可重试** | 指数退避 + full jitter（上限 6 小时），超过 `max_attempts` 进 dead letter |
| 其它 `4xx` | `permanent_failure` | **首轮即 dead**，不浪费重试预算 |
| 连接失败 / 超时 | **可重试** | 传输层失败必须由网关主动 `throw`（PixivFlow 侧即视为可重试） |

推荐响应体：

```json
{ "status": "accepted", "id": "gw-9f2c1a", "message": "sent to QQ group 123456" }
```

或异步时：

```json
{ "status": "pending", "message": "queued for the next QQ rate-limit window" }
```

**远端 id 的字段名**：只有 `id` 和 `message_id` 会被记为 `remoteId`（用于审计与对账），其它名字一律忽略。

```json
```

失败时把**原因**放在 `reason` / `error` / `message` 任一字段里（会被记进 `last_error`，见
`pixivflow delivery status`）。

## 4. 你的能力声明（`capabilities`）决定 PixivFlow 怎么发

PixivFlow 会读你声明的 capability 来组装消息，**只收紧、不放宽**：
覆盖值比内置档案更严格时生效，更宽松时会被忽略（节流只能加严）。

| 字段 | 作用 |
| --- | --- |
| `maxTextLength` / `maxCaptionLength` | 文本与图文说明的长度上限；超限按 `truncatePolicy` 处理 |
| `maxAttachmentsPerMessage` | 单条消息附件上限 ⇒ 超过就自动拆成多条 |
| `maxUploadBytes` | 单文件字节上限 ⇒ 超过的媒体进 `dropped[]`（或走文件消息） |
| `album` / `albumMin` / `albumMax` | 是否支持相册（一次多图）；`albumMin` 不足/`albumMax` 超出都会降级为逐条 |
| `minSendIntervalMs` | 最小发送间隔（慢者胜）；例：OneBot 侧建议 ≥500ms，防封号 |
| `truncatePolicy` | `split`（拆条）/ `truncate`（截断）/ `error`（宁可失败不截断） |
| `idempotencyMechanism` | `none` / `platform_key` / `upstream_ledger`；只是**声明**，实际去重仍由 PixivFlow 的账本承担 |

字段名的唯一来源是 PixivFlow 的 `src/delivery/capabilities.ts`（`TargetCapabilities`）：写错的键**不是能力**，会被忽略并在两个配置校验入口给出 warning（例如 `supportsAlbum` 会提示 `Did you mean "album"?`）。照抄下面例子里的键名，不要自己造同义词。

不确定就**不要声明**：内置档案是保守的文字优先，宁可发得朴素，也不要让 PixivFlow 以为你支持相册而丢图。

## 5. 具体例子：QQ / OneBot v11（网关侧）

PixivFlow 不做 OneBot 协议，**也没有内置 OneBot 连接器**；下面这套是你网关里的**对接形状**
（协议细节以 [OneBot v11 规范](https://github.com/botuniverse/onebot-11) 与你的实现文档为准）。
5.1–5.5 把最容易误解的一环 —— 扫码登录到底发生在哪里 —— 拆开讲清楚。

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
{ "capabilities": { "maxTextLength": 4000, "album": true, "albumMin": 2, "albumMax": 9, "minSendIntervalMs": 500 } }
```

**不要让 PixivFlow 直接对 QQ 说话**：token、风控、限速、掉线重连、协议版本漂移都属于网关。

### 5.1 一个必须说清的事实：投递与扫码是两个不同的接口

用 NapCat 时，QQ 的**登录态**由 NapCat 持有（它在自己的 WebUI 里出二维码，你扫码，
会话留在 NapCat 进程内）。而 PixivFlow 只会对**一个** URL 说话：配置里的
`delivery.targets.<name>.url`，且它 POST 的是本文档 §1 的统一消息 JSON —— 不是 OneBot 的
`{group_id, message:[...]}`。

所以两件事不要混为一谈：

| 你想要的 | 谁负责 | PixivFlow 做到哪一步 |
| --- | --- | --- |
| 扫码登录 QQ | NapCat 自己的 WebUI（人类操作） | 不参与；凭据与 session 都不进 PixivFlow |
| 把作品发到 QQ | 一个说 webhook 契约的网关进程 | POST 统一消息 JSON、记账、重试、幂等 |

**今天 PixivFlow 里没有内置 OneBot 连接器**（这是刻意的产品边界：PixivFlow 是 Messaging
Gateway Client，不嵌平台协议，见 [投递运行时架构 §5](architecture/delivery-runtime.md)）。
`type: "webhook"` 的路由会原样把统一消息 JSON POST 到 `url`，OneBot 的实现端不认这个
body。因此「让 PixivFlow 直接发到 NapCat」这条路目前是**不通的**，需要一个很薄的转换进程
（下面 5.3）站在中间。

### 5.2 扫码在哪扫、`pairingUrl` 指向谁

- **扫码**：在 NapCat 自己的面板/控制台里完成 —— 账号的登录、上下线都在那边，具体入口与
  端口以你装的版本的官方文档为准（NapCat 文档：<https://napneko.github.io/>）。这一步与
  PixivFlow 完全无关，也不需要 PixivFlow 配置任何东西。
- **`pairingUrl`**：这是 PixivFlow **只读展示**用的地址。WebUI 的投递面板（`/deliveries`）点
  「配对」时，PixivFlow `GET` 这个 URL 并把答案原样渲染（不生成二维码、不跑登录协议、
  不存 session、不落库，见 [API 文档](../API.md#配对透传-get-apigatewaysnamepairing)）。它可以是：
  - 你那个薄转换进程自己暴露的一个状态端点（推荐 —— 它能同时回答「NapCat 在线吗、账号登录了吗」）；
  - 任何返回登录/配对状态的网关端点。

  没配 `pairingUrl` 的行不会有「配对」按钮；配了但 URL 返回非 2xx，面板会显示
  `pairable: false` 并**保留网关原文**，不会假装成功。

  ⚠️ 不要把 NapCat 的面板地址直接当 `pairingUrl` 用：那是一个给人看的 HTML 页面，
  不是配对状态接口；它返回的 HTML 会被当作原文展示，不会变成二维码图片。

### 5.3 最小转换进程的形状（QQ 场景）

三个路由就够，全部是幂等友好的（重复调用不会重复发）：

```
POST /deliver      PixivFlow → 你（验签、按 idempotencyKey 去重、立刻回 accepted/pending）
                   → 你 → NapCat: POST /send_group_msg   (text 段 + 多个 image 段)
GET  /pairing      你 → NapCat: POST /get_login_info 等，转成一小段 JSON 给面板
GET  /health       你 → NapCat: POST /get_status（判 data.online !== false && data.good === true）
```

要点：

- **鉴权**：PixivFlow → 你走 `Authorization: Bearer ${ENV}`（见 §2「请求头」）；你 → NapCat 走
  NapCat 自己配置的 token。两段凭据不要复用同一个值。
- **判成败**：OneBot 的 HTTP 状态码几乎永远是 200，成败在 `status`/`retcode`
  （`retcode 0` → `accepted`；`status:"async"` 或 `retcode 1` → `pending`，别报成功）。
- **文件附件**：不是消息段，走 `upload_group_file {group_id, file, name}`（两段式），再发一条提示消息。
- **幂等**：`retcode 0` 之后的重试**不要重发** —— 用 `idempotencyKey` 在你自己这侧短路返回
  `duplicate_existing`。

### 5.4 PixivFlow 侧配置样例

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
          "maxTextLength": 4000,
          "maxAttachmentsPerMessage": 9,
          "album": true,
          "albumMin": 2,
          "albumMax": 9,
          "minSendIntervalMs": 500
        }
      }
    }
  }
}
```

覆盖字段名即 `TargetCapabilities` 的平铺字段（`album` 是布尔，上下界分别是 `albumMin`/`albumMax`，
不是嵌套对象）。尺寸类限制只能**收紧**（`Math.min`）、节奏类只能**放宽**（`Math.max`），所以写错方向
的值会被忽略而不是放大上限。

凭据只以 `${ENV_VAR}` 形式进配置文件（`QQ_GATEWAY_URL`、`QQ_GATEWAY_TOKEN`）；PixivFlow 的
日志、API 响应与 WebUI 都会脱敏，但**网关侧的错误体可能被 relay**，不要在错误信息里回显 token。

### 5.5 怎么验证（每一层都要单独证明）

| 层 | 命令/动作 | 证明的是什么 |
| --- | --- | --- |
| QQ 登录态 | NapCat 自己的面板 | 账号在线；**不证明** PixivFlow 能投递 |
| 网关可达 | `pixivflow gateway test qq-main` | 端点应答；**仍不证明**投递成功 |
| 投递落地 | 跑一次下载并看 `pixivflow delivery status`、面板「投递历史」 | 账本上的 `delivered` / `failed` 与 `last_error` |
| 幂等 | 再跑一次同一作品 | 该路由出现 `duplicate`，群里**不再多一条** |

`gateway test` 只证明网络与鉴权，**绝不等于投递成功** —— 这是刻意的语义区分，别把它当成
「QQ 已经通了」的证据。

## 6. 安全与部署

- **网络**：网关 URL 若指向内网地址，请确认 PixivFlow 所在主机可达；不要把 token 放进 URL query（会进日志/代理访问日志）。
- **凭据**：只用 `${ENV}`；PixivFlow 的响应与日志都会脱敏，但**网关侧的错误体可能被 relay** —— 别在错误信息里回显你自己的凭据。
- **重定向**：默认**不跟随**重定向（避免凭据被转发到第三方）；确有需要时用 `pairingAllowRedirects`/网关侧显式配置。
- **配对/扫码**：由网关承担（QQ 场景见 §5.2）。若它暴露一个配对端点，可用 `pairingUrl` 让 WebUI 只读渲染
  （`GET /api/gateways/:name/pairing`，透传，不落库）——见 [API 文档](../API.md#配对透传-get-apigatewaysnamepairing)。
- **不要把 WebUI 暴露到公网**：见 [部署文档](../DOCKER.md) 的鉴权说明。

### 容器 / Fly.io 里的网关地址

PixivFlow 常跑在容器里，而网关往往在宿主机或另一个服务上，`url` 必须用**容器视角**可达的地址：

| 部署形态 | 网关地址怎么写 |
| --- | --- |
| Docker Compose，网关在宿主机 | `http://host.docker.internal:<port>/...`（compose 已加 `extra_hosts: host.docker.internal:host-gateway`，Linux 同样可用）；Linux 也可用 `http://172.17.0.1:<port>/...` |
| Docker Compose，网关是同一网络里的另一个服务 | 用服务名，如 `http://gateway:8080/...` |
| 网关只监听 `127.0.0.1` | **容器不可达** —— 让它监听 `0.0.0.0` 或对应网桥地址 |
| Fly.io | 同机进程用 `http://127.0.0.1:<port>`；网关是**另一个 Fly app** 时用 `http://<app>.internal:<port>`（同组织的 6PN 内网）。本仓库不带 `fly.toml`，部署拓扑以 `pixivflow-telepost-deploy` 的 deployment manifest 为准 |

另见 [DOCKER.md](../DOCKER.md) 的代理与网络约定（同文件里 `HTTP_PROXY`/`ALL_PROXY` 的规则同样适用于投递请求）。

### `reference` 传输的文件可见性（最容易踩的坑）

`mediaTransport: "reference"` 发的是**绝对路径**，只有在网关与 PixivFlow **看到同一份文件系统**时才有意义：

- 同一容器 / 同一主机 / 同一挂载卷：直接可用（注意 `PIXIV_DOWNLOAD_DIR` 在两侧的挂载点要一致）。
- 网关在另一台主机或另一个容器且**没有共享卷**：改用 `mediaTransport: "base64"`，并设置 `maxInlineBytes` 兜住大文件（超限会直接拒绝，不会发半个包）。
- 网关和 PixivFlow 能共享卷、但路径不同（例如宿主机 `/srv/downloads` 挂到容器 `/app/downloads`）：让网关按**容器内路径**读，或改成 base64 —— 路径不会自动翻译。

## 7. 运维与排障

```bash
pixivflow gateway list                     # 有哪些路由、是否启用、连接状态
pixivflow gateway test my-gateway          # 端点是否应答（不等于投递成功）
pixivflow delivery status                  # 按路由的 pending/delivered/failed 计数
pixivflow delivery status --target my-gateway --limit 20
pixivflow delivery status <deliveryId>     # 单条意图：ledger + outbox 状态
pixivflow delivery retry                   # 默认只预览
pixivflow delivery retry <deliveryId> --yes  # 只重开这一条
pixivflow delivery retry --yes             # 只重开仍欠投递的路由（不会重发已确认的）
pixivflow outbox list --status dead        # 需要人工介入的行
```

WebUI 的只读投影：`GET /api/gateways`、`GET /api/gateways/:name/pairing`、
`GET /api/deliveries`（每条意图带 `outboxStatus`，说明**是否还会有人去重试**）、
`GET /api/deliveries/:id`（意图 + 事件轨迹）。**WebUI 里没有重试按钮** ——
人工重试是经过审计的 CLI 动作（记 `actor=cli` 事件）。

## 8. 契约本身与参考实现

- **[Gateway Contract v1](GATEWAY_CONTRACT.md)** —— 规范：端点、消息 schema、响应词汇表、
  配对 schema、错误码。本文档是「怎么写」，那份是「长什么样」。**两者冲突时以那份为准**，
  因为它由 `src/delivery/gatewayContract.ts` 和测试逐行钉住。
- **[`examples/gateway/`](../examples/gateway/README.md)** —— 零依赖参考网关，实现全部三个端点
  并把收到的消息打印出来。它是「协议本身通不通」的最小验证物，**不是** QQ 适配器；
  写真正的适配器之前先把契约跑通。

```bash
node examples/gateway/server.mjs --selftest   # 契约自检
node examples/gateway/server.mjs              # 起服务，默认 127.0.0.1:8790
```

## 相关文档

- [投递运行时架构](architecture/delivery-runtime.md) —— 平面分层、账本与幂等、扇出、capability
- [配置说明](../CONFIG.md) —— `delivery.*` 全部字段与校验规则
- [API 文档](../API.md) —— `/api/gateways*`、`/api/deliveries*` 的请求/响应与错误码
- [OneBot v11 规范](https://github.com/botuniverse/onebot-11) —— 网关侧要实现的那一侧协议
- [NapCat 文档](https://napneko.github.io/) —— 最活跃的 QQ 协议实现；扫码登录在它自己的面板里完成
