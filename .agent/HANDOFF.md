# 会话交接（PixivFlow）

## 2026-10-30 通用候选策略交付（优先于下方历史范围）

三仓受控分支/标签历史已匿名化推送，保护与 Actions 已恢复。PR 说明与用户文档仅
用中性例子；具体策略保留在私有运行配置。GitHub 内部旧 PR 引用/缓存与外部副本
仍需独立处理，不能把分支清理描述为互联网副本清除。下载产物验收状态见 deploy current-state。

用户授权通用候选 tag 约束与偏好，并为指定 target 在私有运行配置中启用。
功能 #232 / 发行 #233 / deploy pin #287 均已合并并完成发行与部署，私有运行配置已
备份、预检、原子增量替换、回读并确认应用配置代次更新；不得再次抓取或补投作为验收。
旧有 `config/.current-config`、`src/version.ts` 与额外工作树的本机配置已逐字节保留，
旧克隆已迁移到清理后的历史。第三方文档运行脚本修复 #235 已合并，保留固定库完整性。
下一自然周期观察实际候选；生产事实只更新 deploy current-state，不在本目录复制版本快照。

## 2026-10-29 收尾核验（Asia/Shanghai）

范围：仅事实核验、产品审计与最小文档收尾。禁止据此自动开始修复、发版、部署、
生产取数或 Telegram 投稿；审计建议尚未批准。

### 代码、发行与部署证据

- 本地起点 `master@a5ab9fe6bd7cdf4927a478b512ecea2497e56ca3`；收尾分支
  `codex/markdown-closeout-audit`。原有改动 `config/.current-config`、`src/version.ts`
  原样保留；后者为本机生成的旧 BUILD 值，不能作为发布包/生产版本证据。
- GitHub master 为 `fb2cdde599a9fa8055019581e6d12dd482690fff`，仅领先下载页
  文档 PR #226；本地没有宣称已同步该提交。功能 #224 合并为
  `fa1a9a4696079f53087d406fabf80df84acaf7af`，release #225 合并为本地起点。
- [v3.9.0](https://github.com/redtidev1918/PixivFlow/releases/tag/v3.9.0)
  非 draft / 非 prerelease；annotated tag `a016783f…` 解引用到 `a5ab9fe…`。
  `pixivflow-3.9.0.tgz`、`RELEASE-METADATA.json`、`SHA256SUMS` 均 uploaded。
  tgz 的 GitHub digest 为 `980318f30dcc478c59de304b0790d0c5829ba404154630e8ac6160c38bd390e4`。
  本轮核对资产元数据，未重新下载校验包内容；不据此声明 npm registry 已核验。
- [发布工作流 40868519496](https://github.com/redtidev1918/PixivFlow/actions/runs/40868519496)
  completed/success，head=`a5ab9fe…`。#224/#225 head 的测试、tarball smoke、
  镜像、契约、branch-contract、gitleaks 均 success；仅不适用的 release job skipped。
- 部署证据固定到 deploy main `ad4ea61d6fcde2d7859c319072c41a5ae172c161`：
  [pin](https://github.com/redtidev1918/pixivflow-telepost-deploy/blob/ad4ea61d6fcde2d7859c319072c41a5ae172c161/fly/deploy.pixivflow.toml)
  未升级到本次 Release；[生产记录](https://github.com/redtidev1918/pixivflow-telepost-deploy/blob/ad4ea61d6fcde2d7859c319072c41a5ae172c161/docs/operations/current-state.md)
  2026-10-27 条目承接 P-13~16 闭环。近期 PR #282/#283 为此前 pin/验收，未见本次升级 PR。
- 本次只读 `flyctl machine list`：机器 `83d1650bd23948` stopped，release version 79；
  `flyctl logs --no-tail` 仅提取 revision，匹配上述 pin。未请求 `/health`（会自动唤醒），
  未进入机器/读取秘密/重启/部署；因此不是一次新运行的功能验收。
  历史 403 创建分支失败本轮没有重试，不能声称写权限仍为 403。

### 本地验证与真实数据验收

- Node 24.19.0 / npm 11.17.0；依赖和 dist 已存在，dist 构建时间早于发布提交，
  未覆盖原有 version.ts 来重建。`npx --no-install tsc --noEmit` exit 0。
- `npx --no-install jest --silent --runInBand`：149 suites / 1638 tests PASS，53.88s；
  `npm run test:kit`：6 suites / 67 tests PASS。不是历史测试数字复述。
- 当前配置指向 `config/fly-two-bots.example.json`，token 为占位符；
  `PIXIV_REFRESH_TOKEN` / `PIXIV_DOWNLOADER_CONFIG` 未设置，用户默认 token 文件不存在。
  仓库含隐藏文件搜索未发现 token/backup、DB/SQLite、真实 `.novel.json`、
  `.series.json`、TXT/旧元数据或 `.novel.md`。检查范围为本仓、配置解析后的存储目录
  与默认用户 token 位置，没有扫描无关私有目录，也没有读取生产秘密。
- 已创建隔离空目录 `%TEMP%/pixivflow-closeout-4Fc9IR`；没有真实下载产物。
- 安全调用链：`DownloadCommand.ts:53` URL 生成目标 → `DownloadManager.ts:278`
  仅执行目标、不 pump outbox → `NovelTargetHandler.ts:985` 无 delivery names 即
  stored，提前返回，不进入 preview/enqueue。隔离验收必须全局/目标均无 delivery、
  无 richNovelPreview、独立 DB/目录，不能复用当前带投递配置的示例来执行。
  离线入口 `NovelExportCommand.ts:25` 直接调用 exportSavedNovel；本轮未执行真实导出。

| 场景 | 结果 | 实际证据及未验证项 |
| --- | --- | --- |
| 纯文本小说 | BLOCKED | 无可认证本地配置、无真实 NovelDocument；无作品 ID/正文可核对 |
| 含插图小说 | BLOCKED | 同上，且无真实图片资源；相对引用、迁移阅读、缺图降级未真实验证 |
| 小说系列（逐章/合订） | BLOCKED | 无真实系列清单及章节；顺序、完整性与两种阅读形态未真实验证 |

三场景的下载、标题/作者/来源、正文、图片、复制后离线阅读、幂等重导出、TXT/sidecar
兼容、缺图警告均未执行，不得标 PASS。无任何真实 Telegram 或其他外部投递。
解除阻塞的最少输入：用户在本机安全配置可用 Pixiv 访问条件并提供三类作品链接，
或提供真实保存的 NovelDocument/系列清单及图片路径；不要把令牌贴到聊天或日志。

### 下一位 Agent 的入口

P-17~20 已完成；不要再次发版。P-21 等待上述本地输入；P-22 等待另行部署授权，
届时确认 deploy 写权限（可开分支/PR）、CI 门禁与 Fly 部署权限，再按 release 技能
更新 pin → PR/CI → 合并 → 部署 → revision/业务验收。生产版本只在 deploy 权威维护。
产品审计见 TASKS 下表，非已批准开发计划。DECISIONS D-10 保持不变。

本次仅修改 `.agent/{STATUS,PLAN,TASKS,HANDOFF}.md`、`AGENTS.md`、`docs/WEBUI.md`；
后两处只纠正已存在的 WebUI 恢复能力说明。`git diff --check` 通过，原有两文件
SHA-256 前后相同。文档保存在本地收尾分支，不推送/开 PR/合并，不触发发行链。

## 2026-10-27 投递可靠性任务（已闭环）

P-13~16 的历史发行/部署/验收已由 deploy 2026-10-27 VERIFIED 条目确认；
本次只重新读取证据，没有重投、审核或改写任何历史业务。

## 2026-10-26 集中式优化轮交接（已闭环）

- PR #214 初次合并时未发版；后续 #216/#217 与 deploy #279/#280 已完成发行闭环。
  此处历史说明不能再用于判断当前生产是否升级，统一查询 deploy current-state。
- 已完成：架构盘点、词表 SSOT 收敛、死抽象删除、`recovery-status` CLI 同源化、
  `.agent/` 体系、三操作语义审计、deploy 仓 smoke 三处误报修复（PR #276）。
- 任务明细与 DEFERRED 清单见 TASKS.md；决策见 DECISIONS.md（D-01~D-07）。
- 历史用户侧事项（本轮未核验，不能当作当前待办）：TelePost 审核 #212（恢复链头，作品 151271923，4 图）待
  用户在审核群批准发布；#112（bot2，25 天前空载荷 failed）从未被恢复。
- 本轮集中治理**正式结束**，回归正常功能迭代；后续任务从 TASKS.md 的
  DEFERRED 项按需立项。
