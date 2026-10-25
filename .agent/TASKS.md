# 任务队列（PixivFlow）

> 状态：TODO / IN_PROGRESS / DONE / DEFERRED / BLOCKED。每行带证据。

## 本轮（2026-10-26 集中式优化与收尾）

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-01 | 架构盘点（组件/定时器/状态机/重试/大文件/CLI/三操作语义） | DONE | Explore 审计报告 + DECISIONS.md 沉淀 |
| P-02 | 状态词表 SSOT：删除死代码 `aggregateSlot`；`RecoveryOutcome`/`SlotCoordinator` 改用 `ACTIVE/TERMINAL_CELL_STATES`；`OUTBOX_STATUSES` 收敛 | DONE | SlotStateMachine.ts / RecoveryOutcome.ts / SlotCoordinator.ts / OutboxRepository.ts + 新增不变量测试 |
| P-03 | 诊断 CLI：`pixivflow recovery-status <targetId> <requestId>`（与 HTTP handler 同源 `RecoveryStatusQuery`） | DONE | src/scheduler/RecoveryStatusQuery.ts + RecoveryStatusCommand.ts + 5 例测试 |
| P-04 | 三操作语义（retry delivery / reselect candidate / refetch replace）审计与文档固化 | DONE | 机制已正确分离；边界写入 DECISIONS.md D-05 |
| P-05 | `.agent/` 体系 + release SKILL + AGENTS.md 边界段 | DONE | 本目录 + `.agents/skills/release/SKILL.md` |
| P-06 | 行为疑点核实：双层下载重试、IdleLifecycle drain、SlotAggregate | DONE | 三者均非缺陷/为死代码；结论见 LESSONS L-1/L-2 |
| P-07 | 全量测试 + typecheck + lint + CI + PR + release + 部署验收 | DONE | PR #214 CI 全绿已合并；`refactor:` 不触发 release-please——零行为/协议变化，**不强行发版**，生产保持 3.7.2，deploy pin 无需更新；新 CLI 随下次功能发版进入镜像 |
| P-08 | 性能基准体系（Part VII 全量） | DEFERRED | 无可复现测试素材与测量窗口；未发现有证据的 OOM/泄漏类 P2 |
| P-09 | 大文件拆分（runJob 480 行 / SlotCoordinator / JobFacade / NovelTargetHandler） | DEFERRED | 重构风险 > 本轮收益；已记录为后续任务 |
| P-10 | scheduler↔delivery 双向依赖反转；三套错误分类合并 | DEFERRED | 架构级改动，需独立设计轮 |
| P-11 | 测试直测缺口（JobFacade/OutboxWorker/DeliveryService/DoctorCommand 等 16 模块） | DEFERRED | 部分由邻近测试间接覆盖；补直测纳入正常迭代 |
| P-12 | 三操作在 UI/CLI/HTTP 的命名统一 | DEFERRED | 机制正确；改名触碰 WebUI 与跨仓契约，需独立 PR 轮 |
