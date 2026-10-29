# 工程状态（PixivFlow）

## 2026-10-29 小说 Markdown 正式导出（当前）

- 已实现：`novelExport.formats` 新增 `md`；`<base>.novel.md` 阅读型导出
  （标记转换、图片离线化、系列合订、离线重导出、幂等缓存）。与 TelePress
  sidecar 的边界见 DECISIONS D-10；实现细节见 `docs/architecture/novel-export.md`。
- 已合并 PR #224（`fa1a9a4696079f53087d406fabf80df84acaf7af`）；release PR #225
  已合并，v3.9.0 tag 解引用为 `a5ab9fe6bd7cdf4927a478b512ecea2497e56ca3`。
  2026-10-29 重新核实三件 Release 资产与发布工作流 40868519496 成功。
- 本次本地验证：149 suites / 1638 tests、kit 6 suites / 67 tests、`tsc --noEmit` 全绿。
- 真实 Pixiv 验收：纯文本 / 含图 / 系列均 BLOCKED；本机配置为占位符，未发现
  可用本地凭据或真实保存数据。测试通过不代表真实验收通过，详见 HANDOFF。
- 部署升级尚未完成，本轮未获新部署授权；发布与生产验收分开追踪（P-20~22）。
- 生态生产事实仍以 deploy current-state.md 为准。

## 2026-10-27 投递可靠性

- 已确认：小说重复图片 marker 被展开为重复媒体身份，TelePost 拒绝；拒绝错误码
  同时被错误 envelope 解析遗漏。详见 DECISIONS D-08、TASKS P-13~15。
- 已实现：源头唯一资产、旧 intent 传输兼容、安全错误摘要；全量 148 suites /
  1620 tests + kit 6 suites / 67 tests、typecheck、本地真实 HTTP 契约通过。
- 代码与契约门禁已合并（#220~222）；发行/部署历史闭环已由 deploy current-state.md
  2026-10-27 条目承接，本轮重新读取确认，不再列为进行中。

## 已结束：2026-10-26 集中治理（历史）

- 本轮集中优化已落地：PR #214（词表 SSOT/死抽象/诊断 CLI/.agent 体系）+
  #215（收尾）+ #216/#217（发行）；部署证据由 deploy current-state.md 承接。
- 集中治理**正式结束**；后续从 TASKS.md DEFERRED 项按需立项。
- 与跨仓库文档的边界（唯一事实来源）见下方表格与 DECISIONS D-07。

## 与跨仓库文档的边界（唯一事实来源）

| 事实 | 权威 |
| --- | --- |
| 本仓开发任务/会话状态 | 本目录 `.agent/` |
| 跨服务生产版本/部署/事故状态 | deploy `docs/operations/current-state.md` |
| 跨仓库协议 | deploy `CONTRACT.md` |
| PR / CI / Release | GitHub |
| 业务执行状态 | 生产 SQLite slot/outbox 账本 |

禁止在本目录记录生态生产版本号快照（会与 deploy 漂移）；需要时链接查询。
