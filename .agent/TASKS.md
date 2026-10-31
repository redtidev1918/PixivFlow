# 任务队列（PixivFlow）

> 状态：TODO / IN_PROGRESS / DONE / DEFERRED / BLOCKED。每行带证据。

| P-27 | 下载页生成器停用资产表（showAssetTable），双语页精简为安装指引 | DONE | docsite#15 b82126b0；PR #240 合并 9fc3279；docs-check pin/生成器/flag/preview/重新生成；本地幂等+--check+构建全过 |

## 本轮（2026-10-31 下载入口 npm 优先）

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-25 | 英文下载页补安装指引；zh 发布包标注离线场景；DOCKER.md 死链修复 | DONE | PR #239；docs/en/download-preview.md；download-page.json previewFiles；v3.10.0 双语页重新生成 |
| P-26 | v3.10.0 Release 正文改 npm 安装优先 | DONE | gh release edit v3.10.0；releasegraph-post-release 标记回读一致 |

## 本轮（2026-10-30 通用候选 tag 偏好）

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-23 | 通用 requiredTags + preferredTags 有界加分，共享搜索/待发池/planner | DONE | #232/#233；CandidateTagPolicy / CandidateSelection.test.ts / candidateInventoryRepo.test.ts；D-11 |
| P-24 | 用户文档、PR/CI/发行与生产配置同步 | DONE | CONFIG 中英文 / TAG_RANKING；deploy #287 + 私有配置原子更新、回读、应用配置代次验证；生产事实见 deploy current-state |

## 本轮（2026-10-29 Markdown 正式导出）

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-17 | `md` 正式格式：渲染器、图片离线化、`.novel.md` 命名、`markdown-export` variant | DONE | MarkdownExporter.ts / NovelExportService.ts / Artifact.ts；13 个新增测试 |
| P-18 | TelePress sidecar 兼容边界固化（`find` 不受新 variant 影响、不投递） | DONE | TelePressRichNovel 零改动 + novel-markdown-export.test.ts 两例门禁 |
| P-19 | CLI/config/WebUI 同语义（`validateNovelExport` 单一词表）+ 中英文文档 | DONE | validateNovelExport 'txt,md,epub,pdf'；USAGE/CONFIG/DOCKER/architecture |
| P-20 | Markdown PR / CI / 正式发行 | DONE | #224/#225 已合并；v3.9.0 tag→a5ab9fe；工作流 40868519496 success；三件资产齐全 |
| P-21 | 真实 Pixiv 纯文本 / 含图 / 系列验收 | BLOCKED | 本地占位符配置、无本地 token/DB/真实 NovelDocument 或系列资源；详见 HANDOFF |
| P-22 | Markdown 版本生产升级及运行验收 | DEFERRED | 本次无新部署授权；deploy main 未 pin 本次 Release，历史 403 不视为本次已重测；先获授权再走 deploy PR/CI/部署/运行核验 |

## 本轮（2026-10-26 集中式优化与收尾）

## 2026-10-27 投递可靠性修复

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-13 | 重复小说插图身份、历史 intent 兼容、拒绝码诊断 | DONE | #220~222；novelMarkers.ts / HttpMultipartDelivery.ts / DeliveryAck.ts |
| P-14 | 双仓真实 HTTP 契约门禁 | DONE | #220~222；scripts/verify-telepost-contract.py + .cjs；认证与 Telegram staging 为 fixture，不是本轮真实数据验收 |
| P-15 | CI / 正式发行 / 固定版本部署 / 生产验收 | DONE | deploy current-state.md 2026-10-27 VERIFIED 条目；2026-10-29 重新读取，未重放生产操作 |
| P-16 | 保留 ACK 重试权威，避免诊断码反向污染 | DONE | #220~222；408 / 503 invalid_dependency_state / 400 invalid_timeout_setting 回归及 HTTP harness |

| ID | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| P-01 | 架构盘点（组件/定时器/状态机/重试/大文件/CLI/三操作语义） | DONE | Explore 审计报告 + DECISIONS.md 沉淀 |
| P-02 | 状态词表 SSOT：删除死代码 `aggregateSlot`；`RecoveryOutcome`/`SlotCoordinator` 改用 `ACTIVE/TERMINAL_CELL_STATES`；`OUTBOX_STATUSES` 收敛 | DONE | SlotStateMachine.ts / RecoveryOutcome.ts / SlotCoordinator.ts / OutboxRepository.ts + 新增不变量测试 |
| P-03 | 诊断 CLI：`pixivflow recovery-status <targetId> <requestId>`（与 HTTP handler 同源 `RecoveryStatusQuery`） | DONE | src/scheduler/RecoveryStatusQuery.ts + RecoveryStatusCommand.ts + 5 例测试 |
| P-04 | 三操作语义（retry delivery / reselect candidate / refetch replace）审计与文档固化 | DONE | 机制已正确分离；边界写入 DECISIONS.md D-05 |
| P-05 | `.agent/` 体系 + release SKILL + AGENTS.md 边界段 | DONE | 本目录 + `.agents/skills/release/SKILL.md` |
| P-06 | 行为疑点核实：双层下载重试、IdleLifecycle drain、SlotAggregate | DONE | 三者均非缺陷/为死代码；结论见 LESSONS L-1/L-2 |
| P-07 | 全量测试 + typecheck + lint + CI + PR + release + 部署验收 | DONE | #214/#216/#217；deploy #279/#280 与 current-state.md 2026-10-26 历史闭环，生产版本不在本仓复制 |
| P-08 | 性能基准体系（Part VII 全量） | DEFERRED | 无可复现测试素材与测量窗口；未发现有证据的 OOM/泄漏类 P2 |
| P-09 | 大文件拆分（runJob 480 行 / SlotCoordinator / JobFacade / NovelTargetHandler） | DEFERRED | 重构风险 > 本轮收益；已记录为后续任务 |
| P-10 | scheduler↔delivery 双向依赖反转；三套错误分类合并 | DEFERRED | 架构级改动，需独立设计轮 |
| P-11 | 测试直测缺口（JobFacade/OutboxWorker/DeliveryService/DoctorCommand 等 16 模块） | DEFERRED | 部分由邻近测试间接覆盖；补直测纳入正常迭代 |
| P-12 | 三操作在 UI/CLI/HTTP 的命名统一 | DEFERRED | 机制正确；改名触碰 WebUI 与跨仓契约，需独立 PR 轮 |

## 产品体验审计（2026-10-29；建议均 DEFERRED，未经批准，不实施修复）

证据基线为 `a5ab9fe` 功能代码；动态演示只用隔离进程中的合成输入，不属于真实 Pixiv 验收。

| ID | 核验结果 / 优先级 | 证据 | 用户影响、现有入口与建议 |
| --- | --- | --- | --- |
| A1 | 确认 / P0 | `src/commands/LoginCommand.ts:15-25,97,131` 默认输出两个 token，JSON 输出完整响应 | 登录后截图/录屏/日志可泄露长期凭据；帮助中的警告不是保护。建议默认隐藏，敏感导出显式选择；本次未登录或输出真实 token |
| A2 | 部分确认 / P1 | `LoginCommand.ts:103-106` 自打印失败，metadata 无 printsOwnErrors；`src/index.ts:64-72` 再记录/打印；合成 login rejection 实际输出 Login failed 并返回 success=false | 登录失败会重复提示，主因不突出；已有 DownloadCommand printsOwnErrors 可参考。建议单一人读摘要+诊断日志；“多份内部堆栈”未复现，不保留该泛化结论 |
| A3 | 确认 / P2 | `config/fly-two-bots.example.json` storage；`src/config/path-resolution.ts:15-20,127-154`；实际 applyDefaults 输出 `cache/cache/illustrations` 与 `cache/cache/novels` | 按此示例的用户难找文件；dirs/启动目录输出可定位。建议示例子目录相对 downloadDirectory，并校验配置路径语义 |
| B1 | 确认，限定 download 命令 / P1 | `DownloadManager.ts:302-330`；`DownloadCommand.ts:129-137`；合成一成功一失败实际输出“所有目标处理完成”+warning，Promise 正常返回 | 部分失败后命令仍 success，自动化/普通用户会误认完整成功；日志已有失败计数，其他 batch/scheduler 不一概判缺失。建议复用 outcome 给出成功/跳过/失败/部分成功汇总 |
| B2 | 确认，限定即时 download 汇总 / P2 | `DownloadPipeline.ts:125-143,248-260` 已有 scan/skip/filteredOut；DownloadCommand 不返回该报告；`docs/DOCKER.md:342` 仍指导查过滤日志 | 下载少于预期需读日志；scheduler 已有 candidateReport，并非全系统无解释。建议在现有 CLI 结果中呈现原因计数 |
| C1 | 确认文档入口缺口 / P1 | `docs/DOCKER.md:335-354` 是容器/日志排查；`docs/USAGE.md:234-235` 命令列表没有串起 slot→原因→候选→outbox→恢复顺序 | 普通运维者难选下一步；现有 runs/doctor/outbox/recovery-status/diagnose 与 WebUI 可用。建议一条有顺序的故障指引，不新增诊断系统 |
| C2 | 原候选不成立；文档漂移 / P2 | `src/webui/routes/handlers/scheduler-handlers.ts:354-399` 已有恢复代理；内置 `index-D8CiCEG4.js` 含 retryMode/submitRecover，`index-DVXG5BJ9.js` 含恢复 API；`docs/WEBUI.md:31` 与 AGENTS Phase 1 说法过时 | 读文档的用户误以为不能恢复；配置 SCHEDULER_TRIGGER_URL/TOKEN 后可走已有入口，缺配置返回明确 503。建议同步说明；本次未访问或触发生产恢复 |
| D1 | 确认 / P1 | `docs/MIGRATION.md:66-90` 只有路径迁移与 config restore；`BackupCommand.ts:48-79` 收集 config/DB/固定 data/config 目录，未自动收集任意 downloadDirectory | 自定义作品目录可能不在备份范围，备份成功不能证明可恢复；已有 config backup/restore 和 migrate-config，但无完整迁移恢复验收。建议明确备份范围并演练 DB/正文/图片/离线导出恢复，禁止以备份命令成功代替演练 |
| D2 | 确认入口缺口 / P2 | `HealthCommand.ts:160-209` 检查 DB/统计/限流，无逐作品磁盘核对；`ReconcileCommand.ts:2` 是下游重复对账；MaintainCommand 是清理维护 | 文件被移动/删除后不能据下载统计判断收藏完整；现有文件浏览只能人工核对。建议只读核对记录与文件并区分有意缓存清理，不自动修复/删除 |

审计未改功能、未创建修复 PR；C2 的 AGENTS/WEBUI 旧说明已做事实纠正，无恢复代码变更。
A1 的 P0 来自实际默认泄露行为；B1 有失败 warning，
限定为 P1，不据历史报告升级成 P0。C2 不再列“缺少恢复能力”的开发任务。
