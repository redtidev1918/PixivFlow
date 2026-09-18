# PixivFlow WebUI Control Center RFC

状态：Draft（Phase 5 控制面设计；先 RFC 后实现）
范围：PixivFlow（`pixivflow web` 命令）+ pixivflow-webui（前端承载）
作者评审原则：不推倒现有 `pixivflow web`，不新建状态系统，不创建第二数据库，
只把已存在的执行事实通过只读 API 以浏览器控制中心呈现，并把「查看」之外的运维动作
收敛到已有 Recovery / Scheduler / Slot Ledger 契约。

## Problem

用户现在能 `pixivflow web` 启动一个 WebUI（v2.31+ 已随 npm 包发布，含 auth-disabled
安全提醒与公开绑定 fail-closed 守卫），但页面目前是基础下载 / 配置 / 历史 / 日志 /
文件视图，还不是「PixivFlow 控制中心」：

- 看不到 scheduler 的 slot / 最近 occurrence / 终态原因；
- 看不到 Execution（当前任务、日志、结果）；
- 不能在界面触发已有 Recovery（失败查看 + 重试）；
- 不能浏览 Artifact（txt / zip / 图片 / metadata）；
- 配置仍是文件编辑，缺少只读浏览与校验入口。

另一边，TelePost 已经是业务控制面（审核 / Admin / status）。WebUI 的定位是 **Execution
Plane 的只读控制面 + 运维动作网关**，不是业务管理入口，也不是第二套 scheduler。

## Current State（已核实）

- `pixivflow web` 已随 npm 包发布；前台静态文件 `webui-frontend/dist` 已打包。
- 启动打印 `WebUI authentication is DISABLED`；`0.0.0.0/公网绑定` 无凭据时 refuse
  startup，`WEBUI_ALLOW_PUBLIC_NO_AUTH` 作为逃生舱。
- 已有本地数据库、Outbox、Slot Ledger、Recovery handler、scheduler 状态 API
  （TelePost `/api/botN/v1/schedule/status`、PixivFlow scheduler/slot ledger 内部只读查询）。
- WebUI 前端（pixivflow-webui repo）已有 Dashboard / Config / Download / URL Download /
  History / Logs / Files / Login 页面。

## Architecture Constraints

1. WebUI 不写入新状态。所有「执行事实」（slot、outcome、artifact、日志）来自
   PixivFlow 现有存储/API；WebUI 只读。
2. 运维动作只通过已有入口：
   - Recovery：现有 `recover` handler / HTTP 端点（带 UUID requestId、错误可解释）。
   - 手动执行/重试：Scheduler 已有 re-run / trigger 契约，不是新逻辑。
3. 认证沿用现有 WebUI basic auth（fail-closed），不引入第二套身份系统。
4. Token / Secret 永不进前端 bundle；渲染只允许服务端注入脱敏字段。
5. 大而全页面是债务。每个面板必须有一个真实、可验证的数据源，做完一个再做一个。

## Proposal

目标形态（dsh web 体验）：

```text
pixivflow web
  -> 启动 server（内存按需）
  -> 打开浏览器
  -> 浏览器控制中心
```

### 面板 A — Dashboard

- Bot / worker 状态：TelePost `/status`（纯文本可解析）+ PixivFlow executor 心跳。
- 最近 slot：`schedule_id / terminal_reason_code / status / last_sent_at`。
- 失败计数：按 `stage` 聚合，来源 Operational Result Contract（已上线字段）。

### 面板 B — Scheduler

- 查看 slot 列表（已持久化，无新表）。
- 最近 occurrence：slot / target / status / terminal reason / 时间。
- 手动触发：调用已有 re-run / trigger 端点；仅 POST 一次，返回 requestId。

### 面板 C — Execution

- 当前执行任务（若 executor 有运行中/最近进程记录）。
- 日志按 target 过滤（沿用现有 logging）。
- 结果链接到 slot outcome。

### 面板 D — Recovery

- 读：失败任务列表（terminal reason、stage、retryable、operator_hint）。
- 操作：Retry（normal / relaxed）→ 已有 Recovery 契约；只允许 IN PROGRESS 的
  失败任务；所有操作留审计（复用现有 audit / outbox 惯例）。

### 面板 E — Artifact

- 列表 txt / zip / 图片 / metadata，来自现有 artifact 目录索引；
- 预览图片与 metadata JSON；下载走已认证路由，不经前端 bundle。

### 面板 F — Configuration

- 只读浏览当前生效配置（脱敏：不渲染 token / secret / paths）。
- 校验：服务端 `validateConfig` 结果；不支持在线改配置（Phase 1 不做）。

## Phase Plan

- Phase 1：Dashboard + Scheduler 只读（对已有 slot/状态 API 只读接入）。
- Phase 2：Recovery 查看 + Retry 动作（复用已上线 recovery）。
- Phase 3：Execution 日志与 Artifact 浏览。
- Phase 4：Configuration 只读 + 校验；安全 review（auth / CSRF / secret 脱敏）。

每阶段走：本地测试 → PR → merge → release → npm/deploy → runtime 验证。

## Validation

1. `pixivflow web` 从 npm 包启动，Dashboard 显示与 `verified-production.sh` 一致的
   bot/slot 状态。
2. Recovery 面板对已失败的 terminal slot 显示真实 reason / stage / hint；
   点击 retry 后调用与 Telegram 按钮相同契约，返回 UUID requestId。
3. Artifact 面板只列已存在文件，不渲染 token。
4. 无新数据库、无新 scheduler、回收按钮不对旧 TargetOutcome consumer 生效。
5. 认证关闭时在页面上有明确警示；公网绑定无凭据时启动失败（v2.33 守卫已满足）。

## 未实现（明确不做的 Phase 1）

- 在线编辑 config / secret 管理
- 用户 / 审核 / 发布管理（属于 TelePost 业务面）
- 实时 websocket 推送（先轮询即可；websocket 等用量证明再上）

---

## 实施状态（持续同步）

### Phase 1 — Dashboard + Scheduler 只读

- [x] 后端 `GET /api/scheduler` 已上线（PixivFlow **v2.34.0**，随 npm 发布）：
      只读 Slot Ledger 投影，返回最近 slot + 逐 target cell
      （status / terminal_reason_code / reason），limit ≤ 50。
- [x] 前端 Scheduler 面板已上线（pixivflow-webui `feat/scheduler-control-panel`，
      PixivFlow **v2.35.0**）：页面通过 `/api/scheduler` 展示最近 slot 与展开的
      target cells，含 recovered slot 的 `recoveryMode` 标签。

### Phase 2 — Recovery 查看 + Retry

- [x] 查看：Scheduler 展开行展示每个终态 cell 的 status / terminal_reason_code / reason。
- [x] Retry（PixivFlow **v2.36.0**）：前端对 terminal `failed` / `no_candidate` /
      `duplicate` cell 提供单个「重试此目标」按钮；后端
      `POST /api/scheduler/targets/:targetId/recover`（只读时 `GET .../recover/:requestId`）
      作为服务端代理转发到既有调度器 `POST /internal/targets/:targetId/recover`
      （保留既有 UUID requestId / retryMode / correlationId 校验）。
- [x] 安全约束：浏览器永不接触 `SCHEDULER_TRIGGER_TOKEN`；未配置
      `SCHEDULER_TRIGGER_URL`（或 `PIXIVFLOW_TRIGGER_BASE_URL`）与
      `SCHEDULER_TRIGGER_TOKEN` 时后端返回明确 503，前端提示
      recoveryUnavailable，不做写入。

### Phase 3 — Execution 日志与 Artifact 浏览

- [ ] 未开始（前端已有 Logs / Files 页；待深度整合 slot 与 artifact 关联）。

### Phase 4 — Configuration 只读 + 校验

- [ ] 未开始（服务端 `validateConfig` 已有；页面与脱敏未接）。

### 验证记录

- `pixivflow@2.34.0` 从 registry 安装 → `pixivflow web` 真实启动 →
  `GET /api/scheduler` 返回 `{"data":{"slots":[]}}`（空库）→ 服务端 auth-disabled
  banner / static 均正常。
- `pixivflow@2.35.0`（WebUI Scheduler 控制面板）已发布并部署；线上执行端
  PIXIVFLOW_REF=209644eb，`pixivflow-webui` 构建产物随包发布。
- v2.36.0：Recovery 代理与前端重试按钮本地验证（WebUI handler 单元测试 +
  PixivFlow 全量 Jest）、novel rich-text 类型镜修复；尚未部署。
