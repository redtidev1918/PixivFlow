# 当前计划（PixivFlow）

## 2026-10-29 小说 Markdown 正式导出

1. ✅ 审计确认：sidecar（`<base>.md`，TelePress 消费）与阅读型导出必须分轨。
2. ✅ 实现：`md` 格式 + `MarkdownExporter`（复用 parseNovel，无第二解析器）；
   `.novel.md` 命名 + `markdown-export` variant 隔离 TelePress 兼容面。
3. ✅ 图片策略：dest `images/` 内原位引用、目录外内容寻址复制、缺失降级为
   原标记 + warning（与 EPUB fail-closed 相反的契约）。
4. ✅ 单篇/系列合订/`novel-export` 离线重导出/CLI+config+WebUI 同一校验。
5. ✅ PR #224 → CI → release PR #225 → v3.9.0 三件资产；2026-10-29 已重新核实。
6. BLOCKED：真实小说三场景验收缺本地访问条件/真实保存数据（P-21）。
7. DEFERRED：生产升级需另行授权；不得重复发布 v3.9.0（P-22）。
8. ✅ 本轮只做状态核验和文档收尾；产品审计见 TASKS，建议尚未批准，不自动修复。

## 2026-10-27 小说/插画投递可靠性

1. 已取证 bot2 小说 29478076：旧 outbox 含相同资产身份/URL 两次，接收端拒绝。
2. 源头有序去重 + 历史清单传输兼容 + 安全错误码；不改变审核/归属/重试权威。
3. 双仓 PR 运行真实 HTTP/SQLite 契约；旧 payload、响应丢失重启、多页插画与校验拒绝。
4. 已闭环：本仓 #220~222 已合并；发行/部署与历史运行验收见 deploy current-state.md
   2026-10-27 条目。本次仅复核该证据，不重投历史作品。

## 2026-10-26 集中式优化与正式收尾（历史，已结束）

目标：以有证据的 P0/P1 修复 + Agent 工程体系收尾本仓集中治理；完成后回归正常迭代。

1. ✅ 当时现场核查完成；历史生产状态查 deploy 权威文档。
2. ✅ 架构盘点（Explore）：组件清单、4 类后台循环、状态词表、重试边界、
   大文件、CLI 缺口、三操作语义、错误分类、耦合、测试缺口。
3. ✅ P1 修复：词表 SSOT 收敛 + 死代码删除 + `recovery-status` CLI 同源化。
4. ✅ 行为疑点核实：双层重试/IdleLifecycle drain/SlotAggregate（两澄清一删除）。
5. ✅ `.agent/` 六件套 + release SKILL + AGENTS.md 边界段。
6. ✅ 测试/PR/CI/发行及部署验收已闭环，证据见 P-07 与 deploy 2026-10-26 条目。
7. ✅ deploy 文档与 smoke 误报已交付（#276/#278）。
8. ✅ 历史治理已关闭；2026-10-29 清理遗留未勾选状态。

## 范围冻结（本轮不做）

- 性能基准体系（无可复现素材/测量窗口）——DEFERRED（P-08）。
- 大文件拆分、依赖反转、错误分类合并、三操作改名——DEFERRED（P-09/P-10/P-12）。
- 插件化/事件总线/新框架——永久排除（无真实扩展需求不建接口）。

## 验收条件

全量测试与 CI 绿；发版/部署后生产 `/health` 版本一致；`.agent/` 与
deploy current-state 无事实冲突；DEFERRED 清单明确可追踪。
