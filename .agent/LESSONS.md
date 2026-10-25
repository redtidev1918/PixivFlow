# 工程教训（PixivFlow，按事件非 Bug 清单）

## L-1 「看起来重复」不等于重复——先读调用方再动手（2026-10-26）

架构盘点曾把三处标记为「疑似重复/缺陷」，逐一到调用点核实后两处是误判：

- `DownloadExecutor` 的 attempt 循环 vs `ErrorRecovery` 的 maxAttempts：
  策略/执行分离，预算单一来源，不会相乘。
- `SchedulerIdleLifecycle` 的 15s 轮询 vs OutboxWorker 的 10s pump：
  前者只读不 mutate，drainOutbox 是同一 worker 的显式 drainOnce。

只有 `aggregateSlot` 是真死代码（生产与测试零引用），已删除。
**教训**：删除「重复实现」前必须证明职责真的重复且无调用方；报告里的
「重复」只是搜索线索，不是证据。防复发不变量：删除任何导出前跑全仓引用
grep（含测试），并在 PR 描述里列出引用核查结果。

## L-2 死抽象会在审计文档里「续命」（2026-10-26）

`aggregateSlot` 曾被跨仓审计文档（deploy recovery-ownership.md）描述为
「投影，非第二 FSM」——文档在为死代码背书。删除代码时必须同步修正引用它的
审计/架构文档，否则下一轮审计会再次把它当真实组件评估。

## L-3 状态字面量数组是词表漂移的温床（2026-10-26）

`['pending','selected','artifact_ready','delivery_pending']` 这类内联集合
在 RecoveryOutcome 与 SlotCoordinator 各出现一次，与 FSM 定义独立漂移。
防复发不变量（D-02）：任何终态/非终态判断引用 `TERMINAL/ACTIVE_CELL_STATES`；
代码评审看到内联状态数组直接要求改为集合引用。TelePost 侧消费者映射
（CellStatus → 恢复投影）在 2.84.9 已做同源核对，两侧改动需同步评估。
