# 任务队列（PixivFlow）

> 状态：TODO / IN_PROGRESS / DONE / DEFERRED / BLOCKED。每行带证据。

## 本轮（2026-10-29 Markdown 正式导出）

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-17 | `md` 正式格式：渲染器、图片离线化、`.novel.md` 命名、`markdown-export` variant | DONE | MarkdownExporter.ts / NovelExportService.ts / Artifact.ts；13 个新增测试 |
| P-18 | TelePress sidecar 兼容边界固化（`find` 不受新 variant 影响、不投递） | DONE | TelePressRichNovel 零改动 + novel-markdown-export.test.ts 两例门禁 |
| P-19 | CLI/config/WebUI 同语义（`validateNovelExport` 单一词表）+ 中英文文档 | DONE | validateNovelExport 'txt,md,epub,pdf'；USAGE/CONFIG/DOCKER/architecture |
| P-20 | PR / CI / 发版 / 部署 pin | IN_PROGRESS | 待 PR 合并与用户授权发版 |

## 本轮（2026-10-26 集中式优化与收尾）

## 2026-10-27 投递可靠性修复

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-13 | 重复小说插图身份、历史 intent 兼容、拒绝码诊断 | IN_PROGRESS | novelMarkers.ts / HttpMultipartDelivery.ts / DeliveryAck.ts；bot2 HTTP 400 的旧 payload 含相同 asset id + URL 两次 |
| P-14 | 双仓真实 HTTP 契约门禁 | IN_PROGRESS | scripts/verify-telepost-contract.py + .cjs；真实下载器/outbox/HTTP/审核 SQLite，Telegram staging 与认证为 fixture；ACK 丢失后重启、12 页插画、拒绝路径 |
| P-15 | CI / 正式发行 / 固定版本部署 / 生产验收 | IN_PROGRESS | 生态事实由 deploy current-state.md 承接 |
| P-16 | 保留 ACK 重试权威，避免诊断码反向污染 | IN_PROGRESS | 三例 red→green：408 / 503 invalid_dependency_state / 400 invalid_timeout_setting；真实 HTTP harness 加入 503 故障 |

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-01 | 架构盘点（组件/定时器/状态机/重试/大文件/CLI/三操作语义） | DONE | Explore 审计报告 + DECISIONS.md 沉淀 |
| P-02 | 状态词表 SSOT：删除死代码 `aggregateSlot`；`RecoveryOutcome`/`SlotCoordinator` 改用 `ACTIVE/TERMINAL_CELL_STATES`；`OUTBOX_STATUSES` 收敛 | DONE | SlotStateMachine.ts / RecoveryOutcome.ts / SlotCoordinator.ts / OutboxRepository.ts + 新增不变量测试 |
| P-03 | 诊断 CLI：`pixivflow recovery-status <targetId> <requestId>`（与 HTTP handler 同源 `RecoveryStatusQuery`） | DONE | src/scheduler/RecoveryStatusQuery.ts + RecoveryStatusCommand.ts + 5 例测试 |
| P-04 | 三操作语义（retry delivery / reselect candidate / refetch replace）审计与文档固化 | DONE | 机制已正确分离；边界写入 DECISIONS.md D-05 |
| P-05 | `.agent/` 体系 + release SKILL + AGENTS.md 边界段 | DONE | 本目录 + `.agents/skills/release/SKILL.md` |
| P-06 | 行为疑点核实：双层下载重试、IdleLifecycle drain、SlotAggregate | DONE | 三者均非缺陷/为死代码；结论见 LESSONS L-1/L-2 |
| P-07 | 全量测试 + typecheck + lint + CI + PR + release + 部署验收 | DONE | PR #214 CI 全绿已合并；用户授权发版 → #216（feat 语义）→ release #217 **v3.8.0**（`78ed437`，产物 3 件）→ deploy pin #279 → fly deploy → 生产 `/health`=3.8.0 验证 + smoke 全绿 |
| P-08 | 性能基准体系（Part VII 全量） | DEFERRED | 无可复现测试素材与测量窗口；未发现有证据的 OOM/泄漏类 P2 |
| P-09 | 大文件拆分（runJob 480 行 / SlotCoordinator / JobFacade / NovelTargetHandler） | DEFERRED | 重构风险 > 本轮收益；已记录为后续任务 |
| P-10 | scheduler↔delivery 双向依赖反转；三套错误分类合并 | DEFERRED | 架构级改动，需独立设计轮 |
| P-11 | 测试直测缺口（JobFacade/OutboxWorker/DeliveryService/DoctorCommand 等 16 模块） | DEFERRED | 部分由邻近测试间接覆盖；补直测纳入正常迭代 |
| P-12 | 三操作在 UI/CLI/HTTP 的命名统一 | DEFERRED | 机制正确；改名触碰 WebUI 与跨仓契约，需独立 PR 轮 |
