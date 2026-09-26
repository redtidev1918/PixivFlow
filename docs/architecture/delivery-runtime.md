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
  | TelegramReviewDeliveryConfig; // type: 'telegram'
```

`DeliveryDispatcher`（`src/delivery/DeliveryDispatcher.ts`）按 `target.type` 分派到
`HttpMultipartDelivery` / `TelegramReviewDelivery`；未知 type 抛 `ConfigError`（non-retryable）。
`readinessProbe(name)` 目前只对 `httpMultipart` 有效，其余 type 视为 ready。

`TelegramReviewDelivery` 是**审核链投递**：媒体不离开 Telegram，不过控制面，只上报 id，
由持有凭据的控制面（TelePost）执行 copyMessage 发布。

### 4.2 capability（计划中，尚未实现）

> 状态：**未实现**。当前代码里 adapter 的 type 只有 `httpMultipart` 与 `telegram`，
> 不存在 capability 声明字段。本节描述的是 Phase 3/4 的目标形状，不应当被当作现有行为。

投递决策不按平台名分支，而按**能力**分支：

| capability | 含义 | 例 |
| --- | --- | --- |
| `text` | 纯文本消息 | 全部平台 |
| `image` | 单张或多张图片 | Telegram、Discord、OneBot |
| `file` | 任意文件附件 | Telegram、Discord、OneBot（两段式）、飞书 |
| `album` | 一次投递多条媒体 | Telegram media group（≤10）、OneBot 多 image 段 |
| `video` | 视频 | Telegram、Discord、OneBot（≤100MB） |

Delivery Engine 依据 capability 决定投递形态；目标平台不支持某能力时按声明的降级策略
处理（例：只支持 `text` 的 webhook 收到图集时退化为「文本 + 链接」），**不假设所有平台
支持所有能力**。

能力描述是 adapter 的静态声明（`capabilities`），`validate()` 在配置校验期检查
「该 target 被要求发送它不具备的形态」，`healthCheck()` 供 `target test` 使用。

### 4.3 消息模型（计划中，尚未实现）

> 状态：**未实现**。现有实现直接把 `DownloadedArtifact` 的字段映射到各 provider 的
> 表单/消息体（`DeliveryContext` + `fields` 模板），尚无平台无关的 Content/Media 类型。

核心模型平台无关：`Text` / `Image` / `File` / `Video` / `Album` 的组合，由 adapter 转成
各平台 wire format。**不用** `TelegramMessage` / `DiscordMessage` / `QQMessage` 作为核心
类型。OneBot 的 message segment 数组是成熟设计，adapter 内直接参考其形状而非另造。

---

## 5. 平台实现策略

平台类型 `delivery.targets.<name>.type` 的现状：`httpMultipart`（任意 HTTP 端点，已实现）
与 `telegram`（Telegram 审核链，已实现）。后续平台以**新增 type** 的方式接入，不新增
第二套投递 HTTP API（扩展 `DeliveryDispatcher` 的 switch 与两侧配置校验即可）。

| 平台 | 计划 type | 接入方式 |
| --- | --- | --- |
| 任意 HTTP | `httpMultipart`（已实现） | 通用 multipart POST + ACK 解析 |
| Telegram 审核链 | `telegram`（已实现） | 只上报 id，凭据在 TelePost |
| OneBot（QQ） | `onebot` | PixivFlow → HTTP → 成熟 OneBot 实现（NapCat 等）→ QQ |
| Discord | `discord` | webhook 或 bot token |
| 飞书 | `feishu` | 自建应用 tenant_access_token + 先上传后发送 |
| 微信 | 外接 Bridge | 不做协议，只走成熟 Bridge / 官方 API / Webhook |

**不自己实现 QQ/微信协议**。OneBot 只实现 v11：v12 在 QQ 生态基本未落地（NapCat /
Lagrange.Core / LuckyLilliaBot / go-cqhttp 全部只讲 v11）。OneBot 调用信封
`{"action","params","echo"}`，HTTP 下**路径即 action**，响应 `{"status","retcode","data"}`
且 HTTP 状态码几乎永远是 200——成败只看 `status` / `retcode`，不复用 `parseDeliveryAck`
的 TelePost 语义。文件附件在 OneBot **不是标准消息段**，必须走
`upload_group_file` / `upload_private_file`（与发消息组合成一个逻辑投递）。

---

## 6. 配置

顶层 `delivery.targets` 声明外部平台；`targets[].delivery` 把一个下载目标接到一个或多个
交付目标：

```jsonc
{
  "delivery": {
    "targets": {
      "telepost":     { "type": "httpMultipart", "url": "https://…/submissions", "notificationUrl": "https://…/notify" },
      "tg-review":    { "type": "telegram", "botId": "review-bot", "chatId": "-100…",
                        "controlPlaneUrl": "https://…", "controlPlaneToken": "${CONTROL_PLANE_TOKEN}" }
    }
  },
  "targets": [
    { "id": "daily", "tag": "…", "storageMode": "cache",
      "delivery": { "targets": ["telepost", "tg-review"] } }
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
- 凭据只能写 `"${ENV_VAR}"` 引用（沿用既有 `${VAR}` 插值），绝不硬编码、绝不进日志、
  绝不进 WebUI bundle。
- 未配置任何 `delivery.targets` 时，PixivFlow 的行为与现在**逐字节一致**：投递是
  optional capability。

---

## 7. CLI 与 WebUI

- CLI：`pixivflow outbox list|inspect|retry|cancel`（**已实现**）覆盖「投递状态 / 失败原因 /
  重试」。`pixivflow target list` / `pixivflow target test <name>`（计划 P5）将呈报各
  target 的配置与 health 状态。
- WebUI：`GET /api/delivery/targets`、`GET /api/delivery/history`（计划 P5）是**只读投影**，
  复用 WebUI basic auth；只输出 target 名、状态、时间、错误类别，**绝不输出 token /
  chat_id / webhook URL / 文件路径 / SQL / stack**。

WebUI 不得成为第二系统：不新建 DB、不新建状态机、不启动第二个 scheduler。

---

## 8. 明确不做

- 不把 PixivFlow 变成 Bot Framework：不做 PixivFlow → AstrBot → 平台，不 embed AstrBot /
  OneBot 实现。
- 不新增第二套 HTTP 服务器或第二套投递 API（扩展 `delivery.targets` 的 type 即可）。
- 不实现复杂 Workflow Engine（保留 download → process → filter → deliver 的扩展边界）。
- 不引入 Redis / Kafka / RabbitMQ / Kubernetes / 常驻大型 Bot Framework。
- 不自己实现 QQ / 微信协议。
- 不改 `deliveries` / `outbox` 既有列的含义，不改幂等键格式，不删库重建。
- 不用平台上消息类型（TelegramMessage / DiscordMessage / QQMessage）当核心模型。

---

## 9. 当前状态与后续阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 代码审计 + 社区调研 + 跨仓库契约 | 已完成（[platform-contract.md](../platform-contract.md)） |
| P1 | 多 target 扇出 + 全 target 去重 + Delivery Ledger/幂等/retry 的多 target 契约 | **已实现**（§3.1.1，`src/delivery/targetRoutes.ts`、`multiTargetFanout.test.ts`） |
| P2 | 平台无关 Content/Media 模型 + adapter capability 声明 | 计划 |
| P3 | OneBot v11 HTTP adapter + 通用 webhook adapter | 计划 |
| P4 | Discord / 飞书 adapter（+ Telegram Bot API 路径与 TelePost 的边界确认） | 计划 |
| P5 | CLI `target list/test` + WebUI Delivery Targets/History 只读投影 | 计划 |
| P6 | 文档与示例补齐（含 `config/examples/` 多平台样例） | 计划 |

补充：P1 未新增任何数据库表或列 —— 扇出完全落在既有的
`(delivery_target, work_type, pixiv_id)` 去重域与 `outbox.delivery_target` 上。

---

## 10. 相关文档

- [Principles（不变量与治理准则）](./principles.md)
- [Operational Result Contract（终态原因/恢复语义）](./operational-result-contract.md)
- [Platform Contract（跨仓库契约）](../platform-contract.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [CONFIG.md](../CONFIG.md)
- [API.md](../API.md)
- [OBSERVABILITY.md](../OBSERVABILITY.md)
