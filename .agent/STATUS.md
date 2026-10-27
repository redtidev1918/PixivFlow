# 工程状态（PixivFlow）

## 2026-10-27 投递可靠性（当前）

- 已确认：小说重复图片 marker 被展开为重复媒体身份，TelePost 拒绝；拒绝错误码
  同时被错误 envelope 解析遗漏。详见 DECISIONS D-08、TASKS P-13~15。
- 已实现：源头唯一资产、旧 intent 传输兼容、安全错误摘要；全量 148 suites /
  1620 tests + kit 6 suites / 67 tests、typecheck、本地真实 HTTP 契约通过。
- 发行/部署尚未完成；生态生产事实查 deploy current-state.md。本仓不维护版本快照。

## 当前核验：2026-10-26 晚（Asia/Shanghai）

- 生产版本：**3.8.0**（`78ed437`，用户授权发版；`/health` 已验证）。
- 本轮集中优化全部落地：PR #214（词表 SSOT/死抽象/诊断 CLI/.agent 体系）+
  #215（收尾）+ #216/#217（feat 语义发版 3.8.0）；deploy 仓 pin #279 +
  smoke 修复 #276。
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
