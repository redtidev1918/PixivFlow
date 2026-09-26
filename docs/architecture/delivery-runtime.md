# Delivery Runtime（内容投递平面）

本文档描述 PixivFlow **当前真实实现**的内容投递架构：一个作品如何从下载完成，
经 Artifact 与投递意图，扇出到一个或多个外部平台，并在某个平台失败时不影响其他
平台与下载本身。

范围：`src/delivery/`、`src/domain/media/`、`deliveries` / `outbox` /
`delivery_events` 三张表、`config.delivery`、以及 `targets[].delivery` 的接线。
不涉及 Pixiv 认证、候选发现、排序与下载管线本身（见 [ARCHITECTURE.md](../ARCHITECTURE.md)）。

> 治理前提：本平面是**既有执行事实的增强表达**，不是平行系统。不得新建第二个数据库、
> 第二套状态机或第二个 scheduler（见 [Principles](./principles.md)）。

---

## 1. 平面分层

```text
Source            下载/获取层：Pixiv 认证、候选发现、排序、去重、下载
  |               （src/download/**，src/scheduler/**）
  v
Artifact          「已被获取并准备投递的内容」及其本地变体
  |               （src/domain/media/{Work,MediaAsset,Artifact}.ts）
  v
Delivery Intent   durable 投递意图：每个 (work, delivery target) 一行
  |               （deliveries 表 + outbox 表，src/delivery/DeliveryService.ts）
  v
Delivery Engine   发件箱消费者：租约、重试、退避、dead letter、终态分类
  |               （src/delivery/OutboxWorker.ts）
  v
Target Adapter    单一平台的投递实现
                  （src/delivery/DeliveryDispatcher.ts + 各 adapter）
  v
Platform          Telegram / Discord / 飞书 / OneBot / 任意 HTTP 端点
```

四层各自的唯一职责：

| 层 | 知道什么 | 不知道什么 |
| --- | --- | --- |
| Source | Pixiv、候选、下载、本地文件 | 平台、token、chat_id |
| Artifact | work 身份、变体、路径、校验和 | 如何发送 |
| Delivery Intent / Engine | 幂等键、状态机、重试策略、租约 | 平台协议细节 |
| Target Adapter | 单一平台的 endpoint 与消息格式 | 下载、候选、其他平台 |

**边界铁律**：Delivery 层永不读取下载器内部数据结构；它只接受 Artifact 与投递上下文。
Adapter 永不参与候选选择、去重或下载决策。

---

## 2. Artifact 模型（已实现）

领域模型在 `src/domain/media/`：

```ts
interface Work        { id; type: 'illustration' | 'novel'; title; ... }
interface MediaAsset  { id; workId; ... }            // 逻辑媒体资源，不是本地文件
interface Artifact    {
  id: string;                 // 确定性：pixiv:<workId>:<variant>:<label>
  workId: string;
  variant: 'original' | 'text' | 'markdown' | 'zip' | 'metadata' | 'delivery';
  path: string;               // 本地文件路径（adapter 只读取它）
  mimeType?: string;
  size?: number;
  checksum?: string;
  sourceAssetId?: string;
}
```

硬不变量：**MediaAsset ≠ 本地文件**。一个 MediaAsset 可以有多个 Artifact 变体（原图、
文本、markdown、zip 等）；删除本地文件不影响 MediaAsset 身份。

投递层实际使用 `src/delivery/types.ts` 的 `DownloadedArtifact`（`pixivId` / `type` /
`title` / `tags` / `artifacts` / `previewFiles` / `cleanupFiles` / …）与
`deliveryFilePaths(artifact)` 决定实际附件：小说发 `text` + `zip`，插画发 `original`；
`metadata` / `markdown` / `preview` 永不作为独立附件发送。

---

## 3. 投递意图、账本与幂等（已实现）

### 3.1 键与去重域

```text
投递幂等键  pixivflow:<deliveryTarget>:<workType>:<pixivId>:<slotId:targetId | 'adhoc'>
发件箱幂等键  outbox:<投递幂等键>
```

- `deliveries.idempotency_key` 是 `UNIQUE`：同一 Artifact 对同一 delivery target 重复执行
  **不会产生第二条投递**（`ON CONFLICT ... DO NOTHING`）。
- 去重域是 `(delivery_target, work_type, pixiv_id)`：**不同平台互不禁忌**，同一作品扇出到
  N 个平台就是 N 条独立意图。
- `outbox(kind, idempotency_key)` 同样唯一，`kind='delivery'` 与 `kind='notification'`
  各自独立成行、独立泵送、互不阻塞。
- 本地账本只解决「PixivFlow 不重复产生意图」；**接收端能否收敛，取决于投稿请求里带没带
  `idempotency_key`**。所以 `httpMultipart` 在 `config.fields` 没有声明该字段时会自动补上
  `idempotency_key: "{{idempotencyKey}}"`（`autoIdempotencyKey: false` 可关闭）：缺字段的旧
  配置在 ACK 丢失后的重投会被接收端当成新投稿。

### 3.1.1 扇出（多平台投递，已实现）

一个下载目标可以声明多个交付目标（`targets[].delivery.targets`）。解析入口只有一个、
且不依赖任何其他模块：`src/delivery/targetRoutes.ts` 的 `targetDeliveryNames(target)`
（`storageMode !== 'cache'` 返回 `[]`；数组优先于单值 `target`；去空白、去重、保序）。
`primaryDeliveryName(target)` 是其「第一条路由」投影，供**运维通知**与 scheduler 的
refetch/outcome 端点查找使用（不受 `storageMode` 影响，与历史行为一致）。

扇出点唯一放在 `DeliveryService.enqueue`：它对每条路由各做一次
「ledger 意图 + `outbox:<key>` 行 + `guardCell`」原子写入，返回 `FanoutResult`：

```ts
interface RouteResult  { deliveryTarget: string; deliveryId; idempotencyKey; duplicate; created }
interface FanoutResult { routes: RouteResult[]; deliveryId; idempotencyKey; duplicate; created }
```

硬语义：

- `routes` 每条 = 独立 ledger 行 + 独立 outbox 行 + 独立重试预算；平台之间**结构性隔离**。
- `FanoutResult.duplicate` 是**所有路由的 AND**：只有「每个平台都已确认」才算重复。作品
  投过 Telegram 但还欠飞书时必须继续可投，绝不能被当成 duplicate 跳过。
- `duplicate` / `created` 是**跨路由的聚合**：`created` 是任一路由新建，`duplicate` 是全部
  路由已确认；`deliveryId` / `idempotencyKey` 保留为第一条路由的单值投影，向后兼容。
- 出站上下文带 `context.deliveryTarget`：adapter 永远知道自己服务的是哪条路由。

配套去重查询（`DeliveryRepository`）由「任一 target 已交付」改为「**所有** target 已交付」：
`deliveredIdsForAllTargets` / `submittedIdsForAllTargets` 用一条
`GROUP BY pixiv_id HAVING COUNT(DISTINCT delivery_target) >= N` 查询（N = 路由数），
因此 N 个平台只花一条 SQL，而不是 N 条。候选期去重（`DownloadPlanner`）仍以
`DeliveryTargetScope = string | string[]` 传参：单值 = 历史行为，数组 = 全部路由语义。

`DeliveryLedgerPort.stateFor({ deliveryTargets })` 把 cell 状态聚合到全部路由：

| 聚合结果 | 条件 |
| --- | --- |
| `confirmed` | **每条**路由都 delivered/duplicate |
| `live` | 至少一条路由仍有可执行 outbox 行（其余路由已确认也算 live） |
| `lost` | 无路由确认，且至少一条路由的 outbox 已 dead 或意图未入队 |
| `unknown` | 完全没有该 cell 的投递事实 |

不新增 `partial` state：语义上「部分已投 + 部分仍会重试」自然落入 `live`，「部分已投 +
部分终态失败」落入 `lost`，避免改动既有 switch 与它的测试。

运维通知**只走主路由**（`primaryDeliveryName`）：一个 occurrence 恰好一条 durable 终态
通知，扇出去会让运维收到 N 条。扇出是内容范畴，不是通知范畴。

终态 outbox 行的复活：`OutboxRepository.enqueue` 命中 `(kind, idempotency_key)` 且既有行
已是 `dead` / `cancelled`、而投递意图仍未收敛时，调用 `revive(id)` 把它重开为
`pending` 并重置 attempts——这正是「重试只重发失败平台」能兑现的原因：否则被
dead-letter 的那条路由会在冲突分支里被永久跳过。已经 delivered/duplicate 的意图走
ledger 短路，不会产生第二次副作用。

### 3.2 状态机

| 表 | 字段 | 取值 |
| --- | --- | --- |
| `deliveries` | `status` | `pending` → `delivered` / `duplicate` / `failed` |
| `outbox` | `status` | `pending` → `processing` → `done` / `retry_wait` / `dead` |

- `deliveries.status` 只由 ACK 收敛；`delivered` 与 `duplicate` 都算「已完成」。
- `submittedIds()` 把 `pending` 也算「已提交」，用于候选期避免重复选中同一个 work。
- `business terminal > HTTP success`：HTTP 2xx 但远端记录终态失败时，ledger 记 `failed`，
  **绝不**报 end-to-end success。

### 3.3 重试与失败隔离

`OutboxWorker`（`src/delivery/OutboxWorker.ts`）是唯一的泵：

- 行级租约 `lease_owner` / `lease_until`（默认 `leaseMs=120000`），`claimDue` 抢占。
- 退避 `backoffDelayMs(attempt, base, max)` 指数 + full jitter；默认
  `retryBaseMs=30000`、`retryMaxMs=21600000`、`maxAttempts=12`。
- `errorClass.ts` 分 10 类；**non-retryable 首轮直接 dead-letter**（configuration_error、
  `telegram_send_failed`、409 duplicate、4xx），不消耗重试预算、不拖住 idle shutdown。
- 超过 `maxAttempts` → `outbox.status='dead'` + `deliveries.status='failed'` + `onDead`。
- 失败隔离是结构性保证：每个 target 一行、一次 ACK 收敛一行。Telegram ✓ / Discord ✗ /
  飞书 ✓ 时，只有 Discord 那行留待重试；`pixivflow outbox retry <id>` 或下一次
  `DeliveryService.enqueue`（同一 slot 恢复）重试的也只是那一行，且被 dead-letter 的
  路由会经 `OutboxRepository.revive` 重新变成 `pending`（见 §3.1.1）。

### 3.4 事件审计

`delivery_events` 是 append-only 审计流（`outbox.claimed` / `outbox.delivered` /
`outbox.retry_scheduled` / `outbox.dead` / `delivery.duplicate` / `media.fallback` …），
`detail` 只存短 sanitized JSON，**永不存 secret**。

---

## 4. Target 抽象与 capability

### 4.1 当前实现

```ts
type DeliveryTargetConfig =
  | HttpMultipartDeliveryConfig   // type: 'httpMultipart'
  | TelegramReviewDeliveryConfig  // type: 'telegram'
  | WebhookDeliveryConfig;        // type: 'webhook'
```

`DeliveryDispatcher`（`src/delivery/DeliveryDispatcher.ts`）按 `target.type` 分派到
`HttpMultipartDelivery` / `TelegramReviewDelivery` / `WebhookDelivery`；未知 type 抛
`ConfigError`（non-retryable）。`readinessProbe(name)` 目前只对 `httpMultipart` 有效，
其余 type（含 `webhook`）声明没有 preflight 契约，视为 ready。

`TelegramReviewDelivery` 是**审核链投递**：媒体不离开 Telegram，不过控制面，只上报 id，
由持有凭据的控制面（TelePost）执行 copyMessage 发布。

`WebhookDelivery` 是**通用 Messaging Gateway 客户端**：PixivFlow 只发一份平台无关的
统一消息文档，网关侧是 TelePost / AstrBot / Hermes / OneBot 实现还是自建 HTTP 服务，
PixivFlow 不关心（详见 §5.1）。

### 4.2 capability（已实现，`src/delivery/capabilities.ts`）

投递决策不按平台名分支，而按**能力**分支：

| capability | 含义 | 例 |
| --- | --- | --- |
| `text` | 纯文本消息 | 全部平台 |
| `image` | 单张或多张图片 | Telegram、Discord、OneBot |
| `file` | 任意文件附件 | Telegram、Discord、OneBot（两段式）、飞书 |
| `album` | 一次投递多条媒体 | Telegram media group（≤10）、OneBot 多 image 段 |
| `video` | 视频 | Telegram、Discord、OneBot（≤100MB） |

`DeliveryDispatcher` 与 provider **不按平台名分支**，而是读 `TargetCapabilities`：
布尔能力集合 + 硬上限（`maxTextLength` / `maxCaptionLength` / `maxUploadBytes` /
`maxAttachmentsPerMessage` / `album{min,max}` / `requiresTwoPhaseUpload`）。
平台限额是**数据**（`PLATFORM_CAPABILITIES` 表），新 adapter 只需声明自己的档案。

- `platformCapabilities(type)`：按 `delivery.targets.<name>.type` 取内置档案；**未知 type
  返回保守的 text-only 档案而不是抛错**（配置校验才负责拒绝拼错的 type，resolver 必须
  total）。
- `TargetCapabilities` 现状：`httpMultipart` 声明全 5 项能力且全部限额为 `0`（不约束）——
  通用 HTTP 端点是**不透明契约**，PixivFlow 不能凭空替它设上限；`telegram` 声明
  `text/image/file/album/video`，caption ≤1024、上传 ≤50MB、album `{2,10}`。
- 除布尔能力与尺寸上限外，capability 还声明三个**生命周期**字段（同样是数据）：
  `minSendIntervalMs`（同目标最小发送间隔，0 = 不限）、`truncatePolicy`
  （`split` / `truncate` / `error`，显式选择**切分、截断还是宁失败不静默截断**）、
  `idempotencyMechanism`（`none` / `platform_key` / `upstream_ledger`，说明该平台能不能
  自己幂等，还是必须由 PixivFlow 的账本兜住）。缺省档案给 `error` +
  `upstream_ledger`。
- `applyCapabilityOverrides()`：配置里的 `capabilities` 是**可选覆盖**，布尔值直接替换、
  尺寸上限**只能收紧不能放宽**（`fallback === 0` 表示平台默认不约束，此时采用显式值）、
  **节流只能加严**（`minSendIntervalMs` 取 `max`，慢者胜）；`truncatePolicy` 与
  `idempotencyMechanism` 是显式枚举替换。
- 校验：`collectCapabilityOverrideErrors()` 由 **两个**配置校验入口共享
  （`src/config/validation.ts` 与 `src/utils/config-validator-unified.ts`），因此两侧
  规则不可能漂移。

### 4.3 消息模型（已实现，`src/delivery/content.ts`）

核心模型平台无关：

```ts
interface Content { text: string; parts: ContentPart[]; workId: string; workType: string;
                    sourceUrl: string; title: string; spoiler?: boolean }
type ContentPart = ContentTextPart | ContentImagePart | ContentFilePart
                 | ContentVideoPart | ContentAlbumPart;
```

- `buildContent()` 只从**已经解析好的**投递文件列表构造媒体（`previewFiles` 必须与
  `files` 一一对应才采用），canonical facts 只补充 `size` / `mime` / `assetId` /
  `sourceUrl`。因此「metadata / markdown / preview 变体永不作为独立附件」这条规则
  在任何人构造 Content 时都继续成立。
- part 顺序固定为 text → 各独立文件 → 视觉内容；单张图片/视频保持独立 part（一条
  相册只放一张没有意义，也和 Telegram `sendMediaGroup` 最少 2 项一致），同类型多张
  才组成 `album`。**混合类型不混编**：图片组成 album、每个视频独立成 part
  （Telegram 禁止 document/audio 与 media 同组，飞书 `post` 只能带图片）。
- `planDelivery(content, { capabilities })` 是唯一下降点：album 在能力与 `[min,max]`
  都满足时保留，否则展开为单项 part 并记 `downgrades`；目标完全不支持的媒体进
  `unsupported`（adapter 必须上报，**绝不静默丢弃**）。超过 `album.max` 的相册**不算
  capability 缺口**，只展开为单项，分批由 adapter 负责（它才知道自己的消息限制）。
- 模型在 **enqueue 时冻结进 outbox payload**（`payload.content`，durable intent before
  transport）。旧版本写入的 outbox 行没有 `content`，provider 用
  `contentFromRequest()` 从 `files` + `context` 重建，因此**不需要数据迁移**。
- 不使用 `TelegramMessage` / `DiscordMessage` / `QQMessage` 作为核心类型。OneBot 的 message
  segment 数组是成熟设计，adapter 内直接参考其形状而非另造。

---

## 5. 平台实现策略

平台类型 `delivery.targets.<name>.type` 的现状：`httpMultipart`（任意 HTTP 端点，已实现）
与 `telegram`（Telegram 审核链，**已废弃**）。后续平台以**新增 type** 的方式接入，不新增
第二套投递 HTTP API（扩展 `DeliveryDispatcher` 的 switch 与两侧配置校验即可）。

`telegram` 已废弃：它要求 PixivFlow 自己持有 Telegram Bot Token，与「TelePost 是唯一发布
后端」的方向冲突，未来版本会移除。配置仍可解析（首次构造时打一条一次性 warning），但不要
基于它扩展新能力；迁移方向是退化成 `httpMultipart` → TelePost Submission API。

| 平台 | 计划 type | 接入方式 |
| --- | --- | --- |
| 任意 HTTP | `httpMultipart`（已实现） | 通用 multipart POST + ACK 解析 |
| Telegram 审核链 | `telegram`（已实现） | 只上报 id，凭据在 TelePost |
| **通用 Messaging Gateway** | `webhook`（**已实现**，见 §5.1） | 统一消息 JSON POST + 可选 HMAC 签名 |
| OneBot（QQ） | 由网关承担 | PixivFlow → `webhook` → 网关（AstrBot / 自建 adapter）→ OneBot 实现（NapCat 等）→ QQ |
| Discord / 飞书 / 微信 / 其他 | 由网关承担 | PixivFlow → `webhook` → 网关 → 平台 |

**PixivFlow 不做平台集成，只做 Messaging Gateway Client**：PixivFlow 维护 Artifact 格式、
Media 上传、HTTP 调用、投递状态与重试；平台登录、协议、二维码配对、消息渲染由外部网关
负责，**不 embed AstrBot / Hermes / OneBot 实现**。因此下表的 `onebot` / `discord` /
`feishu` 原生 type **不在路线图上**——它们应由网关实现，PixivFlow 只增加 Connector 类型
（`webhook`，以及必要时将来某个新的通用类型）。

平台生态里成熟方案众多（OneBot 生态的 NapCat/Lagrange 等，AstrBot，Hermes Messaging
Gateway，Apprise 等），它们才是平台适配的归属地；重复实现社区已解决的问题不符合本项目
「小项目、低维护成本」的定位。

### 5.1 通用网关 webhook（已实现，`src/delivery/WebhookDelivery.ts`）

> 对外规范见 **[Gateway Contract v1](../GATEWAY_CONTRACT.md)**；契约的词汇表定义在
> `src/delivery/gatewayContract.ts`，并有两个测试钉住它：`gateway-contract.test.ts`（文档 ↔ 代码 ↔
> 参考实现三方一致）与 `gateway-contract-doc.test.ts`（文档里的请求样例与 fixture 逐字一致）。
> 参考实现：`examples/gateway/`。


一次投递 = 一次 HTTP POST，body 是**统一消息文档**（`GatewayMessagePayload`）：
`schemaVersion` / `idempotencyKey` / `deliveryTarget` / `work{id,type,title,sourceUrl,spoiler,tags}`
/ `message{text,mediaTransport,parts[],media[],dropped[]}` / `delivery{idempotencyKey,slotId,targetId,executionId,triggerSource}`。

- **媒体两种传输方式**：`reference`（默认）发 PixivFlow 主机上的**绝对路径**，要求网关与
  PixivFlow 同机；`base64` 把字节内联进请求，供不同机的网关使用，并可用
  `maxInlineBytes` 在超限时**直接拒绝发送**（宁失败不静默截断）。
- **可选 HMAC 签名**：声明 `signingSecret` 后每个请求带 `X-Webhook-Timestamp` 与
  `X-Webhook-Signature: sha256=HMAC-SHA256(secret, "<timestamp>.<rawBody>")`；声明 `token`
  后带 `Authorization: Bearer …`。凭据支持 `${ENV_VAR}`，缺失时**抛错**而不是发空头。
- **ACK 语义独立**：`parseWebhookAck()` 是纯函数，**刻意不复用** `parseDeliveryAck` 的
  TelePost 信封语义（避免影响存量 multipart 行为）。规则：`pending/queued/submitted/
  processing` 等「已记录但未发布」→ `retryable_failure`（同一幂等键继续重试）；
  `failed/rejected/invalid/expired/blocked` 或 HTTP 409 的 duplicate 语义 → 终态；
  **2xx 但 status 词不认识 → `retryable_failure`，绝不猜成功**；429/5xx → 可重试；
  其余 4xx → `permanent_failure`（确定性拒绝，首轮 dead-letter，不烧重试预算）。
- **传输失败必须 throw**，交给既有 `OutboxWorker` 分类、退避、dead-letter；webhook 自身
  不做即时重试（`DeliveryProvider` 只做一次尝试）。
- **无 preflight 契约**：`readinessProbe()` 恒为 ready；不做探测就不假装探测过。

---

## 6. 配置

顶层 `delivery.targets` 声明外部平台；`targets[].delivery` 把一个下载目标接到一个或多个
交付目标：

```jsonc
{
  "delivery": {
    "targets": {
      "telepost":  { "type": "httpMultipart", "url": "https://…/submissions", "notificationUrl": "https://…/notify" },
      "tg-review": { "type": "telegram", "botId": "review-bot", "chatId": "-100…",
                     "controlPlaneUrl": "https://…", "controlPlaneToken": "${CONTROL_PLANE_TOKEN}" },
      "qq-main":   { "type": "webhook", "url": "${GATEWAY_URL}/hook",
                     "token": "${GATEWAY_TOKEN}", "signingSecret": "${GATEWAY_SIGNING_SECRET}",
                     "mediaTransport": "reference",
                     "capabilities": { "album": true, "maxAttachmentsPerMessage": 9,
                                       "minSendIntervalMs": 1500, "truncatePolicy": "split" } }
    }
  },
  "targets": [
    { "id": "daily", "tag": "…", "storageMode": "cache",
      "delivery": { "targets": ["telepost", "qq-main"] } }
  ]
}
```

- `delivery.target`（单值字符串）与 `delivery.targets`（数组）**并存**，数组优先；
  两者都缺省时该下载目标**不投递**，行为与历史版本完全一致。
- `storageMode: "cache"` 时至少要有一条路由：数组非空，或 `target` 指向
  `delivery.targets` 的既有键；每一项都必须在 `delivery.targets` 中存在，否则配置校验
  报错（`CONFIG_VALIDATION_DELIVERY_TARGETS_INVALID` /
  `CONFIG_VALIDATION_DELIVERY_TARGET_UNKNOWN`）。校验在两个入口同时生效：
  `src/config/validation.ts` 与 `src/utils/config-validator-unified.ts`。
- `noMatchPolicy.notify` 的通知端点由**第一条路由**提供（`httpMultipart` +
  `notificationUrl`），与历史单值行为一致。
- 每个 `delivery.targets.<name>` 可选声明 `capabilities`（见 §4.2）：布尔能力覆盖 +
  `maxTextLength` / `maxCaptionLength` / `maxUploadBytes` / `maxAttachmentsPerMessage` /
  `albumMin` / `albumMax` / `requiresTwoPhaseUpload` / `minSendIntervalMs` /
  `truncatePolicy` / `idempotencyMechanism`。缺省用平台类型内置档案；尺寸只收紧不放宽、
  节流只加严。非法声明由两个校验入口同时拒绝
  （`CONFIG_VALIDATION_DELIVERY_CAPABILITY_INVALID`）；**字段名不在上表里的键不是能力**，
  会被忽略并由两个入口给出 warning（`CONFIG_VALIDATION_DELIVERY_CAPABILITY_UNKNOWN`，
  例如 `supportsAlbum` 提示 `Did you mean "album"?`）——「看起来生效、实际被忽略」比报错更难查。
- `type: "webhook"` 的必填项只有 `url`（http/https，或 `${ENV}` 引用）；可选 `token` /
  `signingSecret` / `headers` / `timeoutMs` / `mediaTransport` / `maxInlineBytes` /
  `capabilities`。错误码
  `CONFIG_VALIDATION_DELIVERY_WEBHOOK_URL_INVALID` /
  `CONFIG_VALIDATION_DELIVERY_WEBHOOK_INLINE_LIMIT_INVALID` /
  `CONFIG_VALIDATION_DELIVERY_WEBHOOK_TIMEOUT_INVALID`。该类型没有 `maxAttempts` /
  `retryDelayMs`：**durable outbox 是它唯一的重试层**。
- 凭据只能写 `"${ENV_VAR}"` 引用（沿用既有 `${VAR}` 插值），绝不硬编码、绝不进日志、
  绝不进 WebUI bundle。
- 未配置任何 `delivery.targets` 时，PixivFlow 的行为与现在**逐字节一致**：投递是
  optional capability。

---

## 7. CLI 与 WebUI

- CLI（**已实现**）：
  - `pixivflow gateway list [--json]` —— 列出 `delivery.targets` 里的每条路由：type、
    **脱敏后的** endpoint、`enabled`（是否仍有启用的下载 target 扇出到它）、最近一次观测到的
    连接状态、该路由的投递计数。列表是**配置真值**：某条路由即使已没有任何启用的下载 target
    指向它，也照样列出来（它的 ledger 行还在，运维需要看到并删除它）。
  - `pixivflow gateway status <name> [--limit N] [--json]` —— 单条路由：capability、
    连接状态、按状态分组的投递计数，以及最近投递意图 + **对应的 outbox 行**（`outboxStatus`
    / `outboxAttempts` / `nextAttemptAt`），因此「是否还会有人去重试」一眼可见。
  - `pixivflow gateway test <name> [--json]` —— 探测并持久化一次观测。判定故意很弱：
    `httpMultipart` 按其声明的 `readinessUrl` 走（2xx = connected，否则 unreachable）；
    `webhook` 只证明**端点在应答**（任何 HTTP 状态码，包括 404/405/401，都算
    connected，并在 note 里写明「通用网关没有健康契约」），连接层失败（DNS/TLS/超时）
    算 unreachable；`telegram` 明确返回 `unknown`（媒体从不离开 Telegram，PixivFlow
    探测不到）。**永远不会**把「端点应答」说成一次投递成功。写入 `gateway_connections`
    的 endpoint 已经过 `redactUrl`，凭据不落库、不打印。
  - `pixivflow delivery status [--target <name>] [--status failed] [--limit N] [--json]`、
    `pixivflow delivery status --id <deliveryId>` —— 投递账本视图；不带过滤时按路由输出
    `delivered/failed/pending/duplicate` 计数。
  - `pixivflow delivery retry [--target <name>] [--status failed] [--id <id>] [--all]
    [--limit N] [--dry-run] [--yes]` —— **默认只预览**，必须显式 `--yes` 才落地。它只
    重新武装**仍欠投递**的路由：已 delivered/duplicate 的行永不被重发；某行虽然 ledger 记为
    failed，但其 outbox 行仍处于可执行状态（worker 还会去重试）时会被**拒绝**并归入
    `skipped`，避免人工重试造成重复投递。落地时调用 `revive`/`requeue` 并用
    `outbox.replay_requested` + `actor=cli` + `countsAsAttempt=0` 记录审计事件，网关侧
    看到的仍是同一个幂等键。
  - `pixivflow outbox list|inspect|retry|cancel`（**已实现**）仍是 outbox 层面的原始工具。
- CLI 不做的事：**不配对任何平台**（二维码/登录都在外部网关进程里完成），**不打印任何
  凭据**（endpoint 一律脱敏），**不新建第二套状态**（读写的都是既有 `deliveries` /
  `outbox` / `gateway_connections`）。
- WebUI：`GET /api/gateways`（**已实现**）列出已配置的 gateway 及其只读投影：
  `name` / `type` / 脱敏后的 `endpoint`（`redactUrl`）/ `connectionStatus`（
  `unknown|unreachable|waiting|connected`，是网关侧配对真值的**缓存投影，允许 stale**）/
  `capabilities`（`resolveTargetCapabilities`）/ `deliveryCounts`。
  `GET /api/gateways/:name`（**已实现**）额外返回最近投递 `history[]`
  （状态、attempts、`lastError`、时间）。
- WebUI 投递历史投影（**已实现**）：`GET /api/deliveries` 跨**所有**路由列出最近的投递意图
  （`limit` / `status` / `target` / `workType` 过滤）+ 全局计数 + 按路由计数 + 配置里的
  全部路由（含 `enabled:false` 的已停用路由，其历史仍需可见）；`GET /api/deliveries/:id`
  返回单条意图 + 其 outbox 行 + 事件轨迹（`outboxStatus` 说明是否**还会有人去重试**）。
  这两个端点**构造上只读**：没有 retry/cancel 写路径——人工重试是审计过的 CLI 动作
  （`pixivflow delivery retry --yes`）。
- 配对**透传**（**已实现**）：`GET /api/gateways/:name/pairing` 读取**网关自己**的配对端点
  （`delivery.targets.<name>.pairingUrl`，可选），把网关报文原样放在 `payload` 下返回，
  外面只加溯源（`fetchedAt` / `pairable` / `contentType` / `truncated`）。PixivFlow 仍然
  **不生成二维码、不说平台登录协议、不持有会话、不落库**；未配 `pairingUrl` ⇒ 404
  `GATEWAY_PAIRING_UNSUPPORTED`（面板不显示对话框），网关非 2xx ⇒ `pairable:false` +
  `GATEWAY_PAIRING_UNAVAILABLE`（绝不当成配对成功），默认 `redirect: manual`，要跟随重定向
  必须显式 `pairingAllowRedirects: true`（配对报文是不可信输入），进程内 2 秒缓存不跨进程。
- **配对（二维码）由外部网关承担，WebUI 只透传渲染**：投影按路由返回
  `pairingSupported`（该路由是否配了 `pairingUrl`）。二维码由网关自己生成，PixivFlow
  不生成、不解析、不保存任何平台登录凭据（`gateway_connections` 行只是**指针**：
  name / type / endpoint / status / metadata）。配对对话框的**两端都已就位**：后端
  `GET /api/gateways/:name/pairing` 透传 + `pairingSupported` 标记，前端在
  `pixivflow-webui` 仓库的投递面板（`/deliveries`，组件 `PairingDialog.tsx`）渲染，
  只识别安全的图像形状（`data:image/` 或网关显式给出的二维码字段），其余原样当文本展示。
- WebUI 只读：不新建 DB、不新建状态机、不启动第二个 scheduler；不输出 token /
  chat_id / 凭据 / 文件路径 / SQL / stack（endpoint 一律经 `redactUrl`）。

---

## 8. 明确不做

- 不把 PixivFlow 变成 Bot Framework：不做 PixivFlow → AstrBot → 平台，不 embed AstrBot /
  OneBot 实现。
- **不实现任何平台协议**：不做 QQ / 微信 / 飞书 / Discord 原生 adapter，不实现扫码登录，
  不生成二维码，不保存平台登录信息。平台生态交给社区网关（见 §5.1）。
- 不新增第二套 HTTP 服务器或第二套投递 API（扩展 `delivery.targets` 的 type 即可）。
- 不实现复杂 Workflow Engine（保留 download → process → filter → deliver 的扩展边界）。
- 不引入 Redis / Kafka / RabbitMQ / Kubernetes / 常驻大型 Bot Framework。
- 不改 `deliveries` / `outbox` 既有列的含义，不改幂等键格式，不删库重建。
- 不用平台上消息类型（TelegramMessage / DiscordMessage / QQMessage）当核心模型。

---

## 9. 当前状态与后续阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 代码审计 + 社区调研 + 跨仓库契约 | 已完成（[platform-contract.md](../platform-contract.md)） |
| P1 | 多 target 扇出 + 全 target 去重 + Delivery Ledger/幂等/retry 的多 target 契约 | **已实现**（§3.1.1，`src/delivery/targetRoutes.ts`、`multiTargetFanout.test.ts`） |
| P2 | 平台无关 Content/Media 模型 + adapter capability 声明 | **已实现**（§4.2/§4.3，`src/delivery/capabilities.ts`、`src/delivery/content.ts`、`deliveryCapabilities.test.ts`） |
| P3a | capability 生命周期字段（节流/截断/幂等）+ `gateway_connections` 表 + 只读 `/api/gateways*` | **已实现**（§4.2/§7，`GatewayConnectionRepository.ts`、`src/webui/routes/gateways.ts`、`gatewayConnections.test.ts`） |
| P3b | 通用 Messaging Gateway `webhook` connector（统一消息 JSON + 可选 HMAC 签名） | **已实现**（§5.1，`src/delivery/WebhookDelivery.ts`、`webhookDelivery.test.ts`） |
| P4 | CLI `gateway list/status/test` + `delivery status/retry`（**已实现**，§7）+ WebUI 只读投递历史 `GET /api/deliveries[/:id]`（**已实现**，§7）+ 配对对话框两端（后端 `GET /api/gateways/:name/pairing` 透传 + `pairingSupported`；前端在 `pixivflow-webui` 的 `/deliveries` 面板渲染） | **已实现** |
| P5 | 文档与示例补齐（`config/examples/` 网关样例、[GATEWAY.md](../GATEWAY.md) 对接手册含 QQ/OneBot 网关侧模式与扫码边界） | 已完成 |
| P6 | **网关契约固化**：[GATEWAY_CONTRACT.md](../GATEWAY_CONTRACT.md)（规范）+ `src/delivery/gatewayContract.ts`（可执行形式）+ 零依赖参考实现 `examples/gateway/`，三者由 `gateway-contract.test.ts` 逐行钉住 | 已完成 |
| P3c | 原生 OneBot v11 Connector | **明确不实现**（与「平台生态交给网关」冲突，见下方决定） |
| P7 | 一致性与可靠性收口：投稿必带 `idempotency_key`（缺省自动补齐）+ 能力字段名以 `TargetCapabilities` 为唯一来源（未知键 warning）+ `success` 明确不参与判定（判定只看 ACK）+ `type: "telegram"` 标记废弃 | **已实现**（`src/delivery/HttpMultipartDelivery.ts`、`src/delivery/capabilities.ts`、`idempotency-key-field.test.ts`） |

补充：P1 / P2 / P3a / P3b 都**未新增 deliveries/outbox 的任何表或列**。扇出完全落在既有的
`(delivery_target, work_type, pixiv_id)` 去重域与 `outbox.delivery_target` 上；Content 模型
冻结进既有的 `outbox.payload_json`（`payload.content`），旧行缺字段时由 provider 重建。
P3a 只**原位增补**了一张新表 `gateway_connections`（`CREATE TABLE IF NOT EXISTS`，无
schemaVersion、无迁移账本、不删库重建）。

**平台 adapter 的定位变更（重要）**：早期路线图曾计划原生 `onebot` / `discord` / `feishu`
type，现已**取消**。PixivFlow 的定位是 **Messaging Gateway Client**（内容生产端），
不是聊天平台集成层：只维护 Artifact 格式、Media 上传、HTTP 调用、投递状态与重试，
平台生态交给社区（OneBot 实现、AstrBot、Hermes、自建服务）。见 §5.1 与 §8。

**关于原计划的 (P3c) 原生 OneBot v11 Connector（明确决定）**：**不实现**。它与本仓库
「平台生态交给网关」的边界直接冲突：一旦 Connector 进仓库，OneBot 的 token、风控、限速、
掉线重连、`retcode` 方言与 `message_id`/`file_id` 的 LRU 失效就会变成 PixivFlow 的运维负担
（协议细节见 [GATEWAY.md §5](../GATEWAY.md)）。QQ 的接入路径是
`PixivFlow --webhook--> 你的网关 --OneBot v11--> NapCat/Lagrange --> QQ`：
网关侧要做的三件事（按 `idempotencyKey` 去重、把 `message.parts` 翻成消息段、
把 `retcode` 映射成 ACK 状态词）已写成可直接照做的对接手册。若将来确有需求，
正确做法仍是把它做成**仓库外**的独立网关，而不是在 PixivFlow 里加协议实现。

---

## 10. 相关文档

- [外部网关投递指南](../GATEWAY.md) —— 面向网关实现者的对接手册（统一消息 JSON、HMAC 验签、ACK 契约、capability、QQ/OneBot 网关侧模式、排障命令）
- [Gateway Contract v1](../GATEWAY_CONTRACT.md) —— 对外契约规范（端点、schema、响应词汇表、配对、错误码）
- [`examples/gateway/`](../../examples/gateway/README.md) —— 契约的零依赖参考实现

- [Principles（不变量与治理准则）](./principles.md)
- [Operational Result Contract（终态原因/恢复语义）](./operational-result-contract.md)
- [Platform Contract（跨仓库契约）](../platform-contract.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [CONFIG.md](../CONFIG.md)
- [API.md](../API.md)
- [OBSERVABILITY.md](../OBSERVABILITY.md)
