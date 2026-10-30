# 工程状态（PixivFlow）

## 2026-10-30 业务隐私与历史清理

用户授权三仓当前文件与 Git 历史匿名化；源码、夹具、示例与文档只保留虚构主题。
私有运行配置不变。协议夹具哈希同步，语言检测夹具改为中性旅行文字并保持测试意图。
远端推送、保护恢复、发布产物修复与复核进行中；通用候选策略 PR 仍待后续合并上线。

## 2026-10-29 Markdown 导出 + 认证输出安全（当前，已发版并部署）

- **v3.9.0**（PR #224，`fa1a9a4`）：`novelExport.formats` 新增 `md`；
  `<base>.novel.md` 阅读型导出（标记转换、图片离线化、系列合订、离线重导出、
  幂等缓存）。与 TelePress sidecar 的边界见 DECISIONS D-10；细节见
  `docs/architecture/novel-export.md`。Release 资产与工作流 40868519496 已核实。
- **v3.9.1**（PR #228）：认证输出安全——login/login-headless/refresh 不再向
  终端或 --json 输出令牌与原始 OAuth 响应，失败路径 safeAuthError 有界分类
  （产品审计 A1/P0）。AuthOutputSafety canary 测试；150 suites / 1653 tests +
  tsc + CI 全绿。
- 发行/部署 VERIFIED：v3.9.1 = `ac72cdaa88f55f283e20303f52c56bed1a7fad27`；
  deploy pin PR #285 → fly deploy（--ha=false）→ 生产
  `/health` = `3.9.1+ac72cdaa88f5`（代码=Release=Deploy=Runtime）。
  Rollback = 3.8.1 / `eb70cee…`（deploy pin 注释块内）。
- 真实 Pixiv 验收：纯文本 / 含图 / 系列仍 BLOCKED（本机无有效凭据/无已存真实
  数据）；解锁条件与隔离方案见 HANDOFF。测试通过不代表真实验收通过。
- 产品体验审计结论（A1 令牌泄露已随 3.9.1 关闭；B1 结果汇总等）待用户批准立项。
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
