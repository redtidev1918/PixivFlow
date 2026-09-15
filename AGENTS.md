# AGENTS.md —— 本仓库是「Pixiv 执行平面」

这份文件写给任何进入本仓库的智能体或工程师。职责契约的唯一权威描述在
`pixivflow-telepost-deploy/docs/reference/deployment-contract.md`；本文件只回答
「什么该做、什么绝对不该做」。

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
- 候选/去重/排序复用现有 topic resolver / scan / ranking / duplicate history，
  禁止写第二套搜索器；禁止突破 content policy、work type、topic 边界。

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
