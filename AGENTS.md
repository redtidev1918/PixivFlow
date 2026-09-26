# AGENTS.md —— 本仓库是「Pixiv 执行平面」

这份文件写给任何进入本仓库的智能体或工程师。跨仓库的职责与执行纪律的唯一权威在：

* `pixivflow-telepost-deploy/AGENTS.md`（PixivFlow Ecosystem Agent Operating Contract）
* `pixivflow-telepost-deploy/docs/architecture/ecosystem-platform.md`（长期架构）
* `pixivflow-telepost-deploy/docs/operations/current-state.md`（当前生产状态）
* `pixivflow-telepost-deploy/CONTRACT.md`（PixivFlow ↔ TelePost 跨仓库契约）

本文件只保留本仓边界与特殊约束；与上面权威冲突时以上面为准，并顺手修正。

一次性/阶段文档不进仓库；动态状态只更新跨仓库 `current-state.md`，确需保留的证据
放 `docs/archive/` 并带 docsite 生命周期块（`docsite.py lifecyclecheck` 校验）。

## 一句话

PixivFlow 负责 Pixiv 认证、候选发现/排序/去重、下载、审核链投递、定时执行、
持久 slot/cell 账本、outbox、远程手动重抓与 schedule 终态。它不持有 Telegram
凭据：所有用户可见通知都通过 durable outbox → TelePost 认证端点 → 审核群。

## Schedule 执行不变量

- **many clocks, one execution authority**：外部时钟只 POST 幂等触发；occurrence
  计算、DB 操作、投递全部由 durable slot 账本收敛。
- **required target 没有在恢复耗尽前永久缺失**：no_candidate/duplicate 先走
  bounded fallback（`download.maxFallbackStages`），每个 stage 用扩大但仍封顶的
  scan bound 重选同一 target（`fallbackScanLimit`，上限 100）。
- **fallback stage 是 durable 的**：`schedule_slot_items.fallback_stage` 持久化，
  crash-resume 从同一 stage 继续；绝不当作新的 primary selection。
- **submitted sibling 绝不重跑**：`pendingTargets` 只返回未收敛 cell；一个
  occurrence 里小说已提交、插画恢复时只能补插画。
- **最终 stage 应用真实终因**：耗尽后 cell 以 no_candidate / duplicate / failed
  终态，而不是通用 “target did not complete”。
- **partial 是降级终态，不是早期逃生门**：发生顺序必须是 primary → infrastructure
  retry → candidate fallback → 恢复耗尽 → partial。
- **每个生产 occurrence 恰好一条 durable 终态通知**（success/partial/failed 都有，
  成功不沉默），幂等键 `notification:<slot>:summary`；`reconcileScheduleSummaries`
  在 outbox 每次 pump 前修复任何“终态但未通知”的空洞。

## 通知不变量

- 用户可见文案只用业务语言（插画/小说、✅/⚠️/❌），绝不展示 slot/lease/outbox/
  stack trace；不生成 mention-capable entity（无 `@username`、无 `tg://user`）。
- manual refetch 的终态只走 `refetchOutcomeUrl`（replaced/no_alternative/failed），
  不另发 schedule summary。

## Refetch 不变量

- **Accepted 不是终态**：每个 admitted attempt 必须收敛到 replaced /
  no_alternative / failed / obsolete；stale timeout 只是 crash fallback。
- **commit-after-success**：先找到 B → 下载 → 投递成功 → CAS/promotion → A
  superseded；绝不在拿到 B 之前先动 A。

## 交付/去重

- business terminal > HTTP success：HTTP 2xx 但 remote 记录终态失败时，ledger
  记 failed，cell 终态 failed，绝不报 end-to-end success。
- 接收端明确拒绝、无效 payload、重复冲突等 non-retryable ACK 必须首轮 dead-letter 并
  收敛 owning cell；不得把确定性失败留在 `retry_wait`，拖住 Slot 与 idle shutdown。
- 候选/去重/排序复用现有 topic resolver / scan / ranking / duplicate history，
  禁止写第二套搜索器；禁止突破 content policy、work type、topic 边界。
- **投稿必带幂等键**：`httpMultipart` 的 `config.fields` 没声明 `idempotency_key` 时自动补
  `{{idempotencyKey}}`（`autoIdempotencyKey: false` 关闭）。本地账本只保证 PixivFlow 不重复产生
  意图；接收端能收敛 ACK 丢失后的重投，靠的就是请求里这个字段。
- 能力声明的字段名以 `src/delivery/capabilities.ts` 的 `TargetCapabilities` 为唯一来源
  （相册是平铺的 `album` + `albumMin`/`albumMax`，不是 `supportsAlbum`）；写错的键会被忽略并
  warning。`success` 不参与投递判定——判定只看业务 ACK。
- `type: "telegram"`（PixivFlow 直发审核群）**已废弃**：不要在新配置里使用，也不要基于它扩展
  新能力；迁移方向是 `httpMultipart` → TelePost Submission API。

## CLI 输出契约

- 命令把结果放在 `CommandResult.message` / `data` 里返回、自己不打印时，必须在 `metadata`
  里声明 `rendersResult: true`——入口（`src/index.ts` → `formatCommandResult`）才会打印。
  忘记声明就什么都不显示（`delivery`/`gateway`/`outbox`/`runs` 曾经因此完全静默）。
- 自己 `console.log` 的命令**不要**声明 `rendersResult`，否则输出两遍。
- `--json` 打印 `data`（无 `data` 时退回 `message`）；人读输出只打印 `message`。

## 改完请自证

- 全量 `npx jest --silent --runInBand`；单点
  `npx jest src/__tests__/<area>`。
- tsc 本机可能挂起（`pkill -f 'tsc --noEmit'` 后再试）；CI 的
  Test (Node 22/24)、tarball smoke、branch-contract、gitleaks 是权威 gate。
## 外部 worker 生命周期（§idle-inflight）

- **CAN_SHUT_DOWN 的唯一条件**（同时满足）：
  - durable active slots == 0（manual refetch slot 与普通 schedule slot 一样计入：
    `trigger_source='manual'` 的 `schedule_slots` 行在 `countActiveSlots()`/`recoverableSlots()`
    中一视同仁）；
  - processing / pending(retry_wait) outbox == 0；
  - **active in-process executions == 0**（`activeExecutionCount` 是第二道保险：即使某行
    DB 状态比其 await 的 Promise 领先一拍，或任何未来错误提前把行写成 terminal，idle
    detector 也不得在真实执行中途退出）。
- `maxLifetimeMs` 只是兜底：到期时仅 graceful close（不 stop 不 terminalize 未完成业务），
  下次 wake 从同一 durable slot/outbox 行恢复。
- outbox 的 `dead` 行不阻塞停机；`pending/retry_wait` 在有限重试内视为活跃。

## Manual refetch 是 first-class durable business execution（§manual-resume）

- 链路：accepted request → durable manual slot → durable cell → durable work binding →
  durable delivery intent → durable outcome → terminal callback。每个阶段 crash/restart 后
  都能继续。
- **同一 request UUID 幂等**：`<plan>@manual-<uuid>` slot id 派生自 UUID；`prepare` 幂等
  resume 同一 slot，绝不新建第二条 refetch attempt / slot / review chain。
- **已锁定 work_id 只能续用**（crash-resume 不重选候选）；**已存在的 delivery intent 只能
  retry same work**（`settlePendingDelivery` 拒绝重选）。
- 恢复按 durable slot 恢复，不重新解析 cron occurrence；普通 schedule 的 occurrence
  resolver 绝不重复触发 manual refetch。

## Resource-scoped execution（§resource-governance）

```text
Concurrency is scoped by the constrained resource,
not by bot, schedule or target.

All work consuming the same constrained resource participates
in the same bounded-capacity admission mechanism.

Queue waiting is unfinished work, not an execution failure.

Manual refetch and manual recovery must not bypass normal resource admission.

Different independent resource identities may execute concurrently.

Waiting resource work must prevent premature idle shutdown.

Generalization follows stable domain concepts and must not introduce
speculative infrastructure.
```

- 资源身份 = `pixiv-account:<pixiv.accountId>`（稳定内部 profile id；**禁止**用
  bot1/bot2、schedule/target 名、token/cookie 当 key，也绝不把凭据写日志）。
- 容量来自 `schedulerRuntime.resourceGovernance.pixivAccounts[<accountId>].maxConcurrency`
  （默认 1 即当前生产建议）；不要为 bot/schedule/target 写并发特判。
- 唯一 admission 机制是 `src/scheduler/ResourceAdmission.ts`（FIFO、per-key capacity）；
  schedule、fallback、manual refetch、manual normal/relaxed recovery 全部经它准入。
  `schedulerRuntime.queueLimit` 只限制全局等待队列长度，不代表资源容量。
- **waiting work = unfinished work**：`SchedulerIdleLifecycle` 的 idle 判定包含
  `waitingForResource`，排队中的运行绝不允许触发 autosleep/退出；也不得把
  `waiting_for_resource` 记成执行失败。
- 生产拓扑 = 单进程单机器（split-worker），in-process semaphore 足够；只有同一资源真的
  会被多进程消费时才允许引入 durable/distributed lease。

## Terminal reason（§terminal-reason）

- 每个 terminal cell 持久化 `terminal_reason_code` + `terminal_reason_message`
  （`schedule_slot_items` 两列），并经 schedule-outcome payload 原样传给下游；
  管理员消息直接看到一级原因。
- **Recovery exhaustion 不是根因**：候选全部重复 → `duplicate_exhausted`；空池 →
  `no_candidate`；候选存在但全被过滤 → `filter_exhausted`。绝不显示 raw error /
  stack trace / 路径 / SQL / token。
- 其余必要类型见 `TargetOutcome.terminalReasonFor`（下载超时/失败、429、auth、5xx、
  delivery/telegram、network、执行超时、配置、internal）。不造巨大 taxonomy。

## Recovery policy（§recovery-policy）

- Acquisition 读取 effective policy：`normal`（identity）与 `relaxed`（服务端预定义
  preset，只放宽 soft 项：lookbackDays / candidateScanLimit / languageCandidateLimit，
  有上限）；hard 约束（excludeAI、work type、topic、delivery、数据完整性等）绝不放宽。
- 手动恢复使用 `POST /internal/targets/:id/recover`（同一 refetch token），body 只接受
  `retryMode: normal|relaxed`，**绝不接受客户端原始参数**；override 只作用于当前
  occurrence（slot 上持久化 `recovery_mode`），**绝不写全局 config、绝不影响未来 schedule**。
- 手动恢复只重跑失败 target（`onlyTarget`）；成功 target 与自动执行历史不改写；outcome
  走 schedule-outcome 通道并以 recovery 标记渲染「已恢复」。


## WebUI 控制面约束（§webui-control-plane）

- `pixivflow web` 是 **PixivFlow（执行平面）的浏览器控制入口**，不是第二系统：
  只读呈现 Slot Ledger / 状态 / 结果，运维动作只经已有 Recovery / Scheduler /
  Trigger 契约；**禁止**在 WebUI 层建新 DB、新状态机、第二个 scheduler。
- 控制中心 Phase 1 前端已随 `webui-frontend/dist` 内置：**调度中心**页只读展示最近
  slot（`/api/scheduler`），含逐 target 状态 / terminal reason；不产生写操作，
  运维动作仍走已有 Recovery / Trigger 契约。
- 已上线只读 API：`GET /api/scheduler`（v2.34.0）返回最近 slot + 逐 target cell
  （slot_id / status / terminal_reason_code / reason），上限 50 条；只读、不输出
  token / secret / path / SQL / stack。
- 认证沿用 WebUI basic auth，fail-closed：`0.0.0.0/公网绑定` 无凭据时 refuse
  startup（`WEBUI_ALLOW_PUBLIC_NO_AUTH` 是显式逃生舱，不是默认）。
- 前端静态包 `webui-frontend/dist` 随 npm 发布；所有敏感字段必须服务端注入脱敏，
  禁止把凭据放进浏览器 bundle。

## Release / Deploy 链一致性（§release-chain）

- 生产部署 pin = **release 提交**（scheduler 容器用 40 位 commit，不用 tag /
  branch）；回到 `pixivflow-telepost-deploy` 改 pin → deploy → 用运行日志里的
  `PIXIVFLOW_REVISION=2.34.0+<sha>` 复核代码=Release=Deploy=Runtime。
- 每一个 WebUI / Scheduler 行为改动都要走 测试 → PR → merge → release → npm 发布 →
  Deploy pin → runtime 验证，再宣称完成。
