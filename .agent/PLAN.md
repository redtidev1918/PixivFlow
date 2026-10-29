# 当前计划（PixivFlow）

## 2026-10-29 小说 Markdown 正式导出

1. ✅ 审计确认：sidecar（`<base>.md`，TelePress 消费）与阅读型导出必须分轨。
2. ✅ 实现：`md` 格式 + `MarkdownExporter`（复用 parseNovel，无第二解析器）；
   `.novel.md` 命名 + `markdown-export` variant 隔离 TelePress 兼容面。
3. ✅ 图片策略：dest `images/` 内原位引用、目录外内容寻址复制、缺失降级为
   原标记 + warning（与 EPUB fail-closed 相反的契约）。
4. ✅ 单篇/系列合订/`novel-export` 离线重导出/CLI+config+WebUI 同一校验。
5. ⬜ PR → CI → （用户授权后）release-please → deploy pin。

## 2026-10-27 小说/插画投递可靠性

1. 已取证 bot2 小说 29478076：旧 outbox 含相同资产身份/URL 两次，接收端拒绝。
2. 源头有序去重 + 历史清单传输兼容 + 安全错误码；不改变审核/归属/重试权威。
3. 双仓 PR 运行真实 HTTP/SQLite 契约；旧 payload、响应丢失重启、多页插画与校验拒绝。
4. 完成全量测试与 CI，正式发行，deploy pin，运行时/只读生产验收及文档同步。

## 2026-10-26 集中式优化与正式收尾（执行中）

目标：以有证据的 P0/P1 修复 + Agent 工程体系收尾本仓集中治理；完成后回归正常迭代。

1. ✅ 现场核查（master=bd188cb 同步；生产 3.7.2）。
2. ✅ 架构盘点（Explore）：组件清单、4 类后台循环、状态词表、重试边界、
   大文件、CLI 缺口、三操作语义、错误分类、耦合、测试缺口。
3. ✅ P1 修复：词表 SSOT 收敛 + 死代码删除 + `recovery-status` CLI 同源化。
4. ✅ 行为疑点核实：双层重试/IdleLifecycle drain/SlotAggregate（两澄清一删除）。
5. ✅ `.agent/` 六件套 + release SKILL + AGENTS.md 边界段。
6. ⬜ 全量测试 + typecheck + lint → PR → CI → release-please → deploy pin →
   fly deploy → 只读验收。
7. ⬜ deploy 仓：recovery-ownership.md 修正 aggregateSlot 表述（L-2）；
   smoke-pixivflow.sh 误报修复交付（fly_app_state.py 已实现待接线）。
8. ⬜ 收尾：TASKS/STATUS/HANDOFF 关闭、deploy current-state 同步、最终报告 A–K。

## 范围冻结（本轮不做）

- 性能基准体系（无可复现素材/测量窗口）——DEFERRED（P-08）。
- 大文件拆分、依赖反转、错误分类合并、三操作改名——DEFERRED（P-09/P-10/P-12）。
- 插件化/事件总线/新框架——永久排除（无真实扩展需求不建接口）。

## 验收条件

全量测试与 CI 绿；发版/部署后生产 `/health` 版本一致；`.agent/` 与
deploy current-state 无事实冲突；DEFERRED 清单明确可追踪。
