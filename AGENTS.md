# PixivFlow Agent 入口

先确认任务范围、git status、当前分支与远端；修改使用独立 worktree，不覆盖未知改动。

## 隐私与安全
真实运行中的主题、必需/偏好 tag、别名和可推断主题的 target 昵称是私有配置。
不得写入公开源码、示例、测试夹具、文档、PR 或发布说明；使用互不映射真实业务的
中性虚构数据。运行配置留在私有卷或 gitignored `*.private.json`，不导出回公开仓库。
第三方依赖的标准词汇/标识符不代表业务配置，禁止盲目词表替换破坏程序；vendored
运行脚本保留固定来源与校验和，并通过语法检查。私有备份和本机应用检查点不推送。
历史清理后的旧克隆不得直接推送；先从清理后的远端重新克隆或迁移补丁。

这份文件写给任何进入本仓库的智能体或工程师。跨仓库的职责与执行纪律的唯一权威在：

* `pixivflow-telepost-deploy/AGENTS.md`（PixivFlow Ecosystem Agent Operating Contract）
* `pixivflow-telepost-deploy/docs/architecture/ecosystem-platform.md`（长期架构）
* `pixivflow-telepost-deploy/docs/operations/current-state.md`（当前生产状态）
* `pixivflow-telepost-deploy/CONTRACT.md`（PixivFlow ↔ TelePost 跨仓库契约）

本文件只保留本仓边界与特殊约束；与上面权威冲突时以上面为准，并顺手修正。

一次性/阶段文档不进仓库；确需保留的证据放 `docs/archive/` 并带 docsite 生命周期块
（`docsite.py lifecyclecheck` 校验）。

## 默认读取规则

- 普通开发：本文件、涉及目录的 AGENTS.md、相关源码与测试；按下表读取细则中对应标题段落（先 `rg -n '^#' docs/agent-guide.md` 定位，再按行读取）。不得因按需读取而省略适用约束。
- 接续旧任务：先读 `.agent/STATUS.md`（若存在），再检索该任务的 TASKS/HANDOFF/DECISIONS/LESSONS；不默认加载全部历史。
- 跨仓接口或职责变更：读取 Deploy AGENTS.md、CONTRACT.md 与相关架构章节；只扫描涉及仓库。
- 生产变更或事故：另读 Deploy `docs/operations/current-state.md`、相关运维/交付计划；历史按日期、PR、故障检索，不默认读全量记录。
- 领域、安全、发布和 CI 门禁不因文档拆分而放宽。保留标签、数据与审计历史；不打印凭据；不盲重试不确定的外部写入。
- 复用现有领域服务和 ReleaseGraph，不新建平行状态库或发布引擎。非平凡新增能力先调查已有实现。
- 文档与证据冲突时核对运行事实并修正文档。报告分别说明本地验证、CI、提交/PR、发行、部署、运行验收；不把测试通过当作生产通过。

## 按任务加载细则

完整规则保存在 [Agent 细则](docs/agent-guide.md)，以下标题均为检索入口。修改对应领域前必须读取该段及其引用的相关约束。

- 公开仓库的业务隐私
- 工程状态的事实来源（2026-10-26 起生效）
- 一句话
- Schedule 执行不变量
- 通知不变量
- Refetch 不变量
- 交付/去重
- CLI 输出契约
- 改完请自证
- 外部 worker 生命周期（§idle-inflight）
- Manual refetch 是 first-class durable business execution（§manual-resume）
- Resource-scoped execution（§resource-governance）
- Terminal reason（§terminal-reason）
- Recovery policy（§recovery-policy）
- WebUI 控制面约束（§webui-control-plane）
- Release / Deploy 链一致性（§release-chain）
