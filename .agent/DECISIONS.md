# 架构决策（PixivFlow，长期有效）

## D-10 阅读型 Markdown 导出与富媒体 sidecar 是两个产品（2026-10-29）

`novelExport.formats` 的 `md` 输出 `<base>.novel.md`（variant
`markdown-export`）：标记转换为真实结构（章节标题/分页锚点/链接/注音降级/
转义），图片相对引用 `images/`，缺图降级为原标记 + warning、正文不丢——
与 EPUB 的 fail-closed `prepareImages` 契约相反，是刻意的。TelePress 消费的
sidecar `<base>.md`（variant `markdown`）保持 raw-marker 语义不变；
`findRichNovelSources` 的 `find(a => a.variant === 'markdown')` 与
`deliveryFilePaths` 的白名单都不会命中新 variant。禁止：让正式导出复用
sidecar 路径或 variant；在 TelePress 兼容验证前改 sidecar 语义。图片文件名
策略：dest `images/` 内原位引用；目录外按内容寻址 `<sha256>.<ext>` 复制一次，
保证重复引用与重复导出的确定性。

## D-09 ACK 重试判定不能被字符串二次分类覆盖（2026-10-27）

`parseDeliveryAck` 的 kind 决定接收端拒绝是否可重试。Outbox 的异常清理路径用
有类型的 `DeliveryAckFailure` 携带 retryable 与 HTTP status，只将通用分类器用于
诊断类别和未收到 ACK 的传输异常；严禁从错误码中的 timeout / invalid 单词反推
业务重试资格。HTTP 408 的诊断类别是 network_timeout。故障注入须覆盖 408、
含 invalid 的 503、含 timeout 的 400，以及同意图重启恢复。

## D-08 媒体引用出现次数与资产身份分离（2026-10-27）

小说正文可以多次引用同一插图；`extractNovelAssets` 按 kind + sourceId 输出
有序资产集合，Markdown/TXT 的正文出现位置全部保留。重复引用不得导致重复
下载、ZIP 条目或重复 `media_assets.asset_id`。插画逐页身份不按 URL 合并。

HTTP adapter 为历史冻结的 outbox 清单折叠完全相同的 wire 事实；同一身份的 URL /
kind / MIME 冲突明确失败，禁止择一覆盖。适配不改持久 intent、幂等键或历史 slot。
接收端唯一身份校验保持严格。拒绝诊断只带受限机器代码，不转发正文、raw body 或密钥。

防复发使用 `scripts/verify-telepost-contract.py <TelePost checkout>`：真实 producer
下载器 → SQLite outbox → HTTP multipart → consumer 路由/校验/审核服务/SQLite。
仅身份认证与外部 Telegram staging 用 fixture；独立的 Telegram adapter 测试继续
验证分组、限流与发布。两仓 PR CI 均运行同一脚本，日志记录被测两端 commit。

## D-01 恢复执行权威（2026-10-25，跨仓审计已固化）

PixivFlow 的 slot/cell 账本是恢复执行的唯一事实源；消费者（TelePost）保存
requestId 身份与结果投影，不运行第二套执行超时状态机。协议面：
`GET /internal/targets/:targetId/recover/:requestId`（3.7.2 起携带
targetId/scheduleId/errorCode）。详见 deploy 仓 recovery-ownership.md。

## D-02 状态词表单一来源（2026-10-26）

Cell FSM（`src/scheduler/SlotStateMachine.ts`）是 cell 状态的唯一权威：
`CellState` 联合类型 + `ALLOWED` 迁移表 + `TERMINAL_CELL_STATES` /
`ACTIVE_CELL_STATES`（互补集合）。任何「非终态/终态」判断必须引用集合导出，
禁止内联重写状态字面量数组（历史三处已收敛）。Outbox 侧同理：
`OUTBOX_STATUSES` 定义在 `OutboxRepository`，CLI/HTTP 校验复用。
`SlotBusinessStatus` 是有意的业务派生词表（面向运营者文案），不是重复 FSM。

## D-03 投递重试与下载重试是两个不同边界（2026-10-26 核实）

- 投递重试 SSOT：`delivery/OutboxWorker.ts`（指数+全抖动退避，attempt 记账在
  OutboxRepository）——重试的是「同一作品的同一投递意图」，幂等键不变。
- 下载重试是策略/执行分离：`ErrorRecovery.decide`（策略）+ `DownloadExecutor`
  while 循环（执行）。`maxAttempts` 单一预算源（executor 传入并读回
  `decision.maxAttempts`），**不会相乘**。不允许在两层各自引入第二个预算。

## D-04 IdleLifecycle 是空闲检测，不是第二 outbox 泵（2026-10-26 核实）

`SchedulerIdleLifecycle` 的 15s 轮询只读 snapshot（"Must not mutate"）。
`drainOutbox` 是组合根暴露给外部时钟宿主的显式 `outboxWorker.drainOnce()`，
用于唤醒窗口内尽快收敛 outbox 后自停——与 10s pump 是同一 worker 的两种驱动，
不是重复实现。删除任一入口前必须证明唤醒窗口内仍有收敛路径。

## D-05 三种操作语义边界（2026-10-26 审计，机制已正确分离）

| 操作 | 语义 | 权威实现 | 入口 |
| --- | --- | --- | --- |
| Retry delivery | 同一作品、同一投递意图重试 | OutboxWorker / `outbox retry` | CLI outbox retry；自动退避 |
| Reselect candidate | 同一 target 重新选候选（durable fallback stage） | SlotCoordinator `advanceFallback` | WebUI/HTTP `POST /internal/targets/:id/recover`（normal/relaxed） |
| Refetch / Replace | 创建新业务代际并使旧代际失效 | ManualJobAdmission + `refetch_request_id` 溯源 | `POST /jobs`（协议）/ legacy refetch shim |

禁止把「重试原作品」默默实现为「更换作品」；候选替换必须可溯源
（原/新 workId、原/新执行身份、原因、当前有效代际）。UI/CLI/HTTP 名词
统一是 DEFERRED 的独立轮次（P-12），在此之前以本表为准。

## D-06 诊断查询的单一实现（2026-10-26）

`src/scheduler/RecoveryStatusQuery.ts` 的 `queryRecoveryStatus` 是
「按 targetId+requestId 查恢复状态」的唯一实现；HTTP handler 与
`pixivflow recovery-status` CLI 都调用它。新增查询面时必须复用，
不得在命令或路由里重写查询逻辑。

## D-07 本仓 `.agent/` 与 deploy 仓的边界（2026-10-26）

本仓 `.agent/` 只管本仓开发状态；生态生产状态、跨仓协议、部署基线的唯一
权威在 deploy 仓（current-state.md / CONTRACT.md / versions.json）与 GitHub。
本目录禁止维护生产版本号快照。
