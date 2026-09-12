# 发版指南

English: cutting a PixivFlow release. Versions follow semver, live in
`package.json`, and are bumped by release-please through a release PR. The
`CHANGELOG.md` is generated as well; git tags, GitHub Releases, npm and GHCR are
produced by the [releasegraph](https://github.com/redtidev1918/releasegraph)
reusable workflow. Nothing in the normal path is done by hand.

本文档面向有 npm/GitHub 权限的维护者。发版由 release-please 与 releasegraph 全自动完成，人工职责是写对提交信息、合并发版 PR，并在发布后核对产物。

## 版本与事实源

| 事实 | 位置 | 谁负责 |
| --- | --- | --- |
| 版本号 | `package.json` 的 `version` | release-please 通过发版 PR 更新 |
| 发版配置 | `release-please-config.json`、`.release-please-manifest.json` | 手工维护（`release-type: node`、`include-v-in-tag: true`、`skip-github-release: true`） |
| 变更日志 | `CHANGELOG.md` | release-please 生成，不要手写 |
| Git tag、GitHub Release、npm、GHCR | `v<版本号>` 标签与 Releases | releasegraph 的可复用工作流 |

`skip-github-release: true` 表示 release-please 只负责版本号与 CHANGELOG，Release 对象由 releasegraph 在发布成功后创建，避免同一版本被两个执行者创建两次。

## 日常流程

1. **用 Conventional Commits 提交并合并到 `master`。** 提交前缀决定 bump 与 CHANGELOG 段落：`fix:` 进 Bug Fixes、`feat:` 进 Features，两者都会触发发版；`refactor:`/`chore:` 默认既不出现在 CHANGELOG 也不参与 bump。希望变更对用户可见时，选 `fix`/`feat` 而不是 `refactor`。
2. **等待 release-please 打开发版 PR。** `.github/workflows/release.yml`（名称 Release）在 push 到 `master`、每小时 cron（`41 * * * *`）、对 PR（`dry_run`）以及手动 `workflow_dispatch` 时运行，转调 `redtidev1918/releasegraph/.github/workflows/reusable-release.yml`。其中 release-please 作业只在默认分支的 push 上运行，它会打开发版 PR `chore(master): release X.Y.Z`。
3. **合并发版 PR。** 这次 push 触发正式发布，releasegraph 依次执行：

   | 阶段 | 动作 |
   | --- | --- |
   | Provider pre-reconcile | 对齐 registry 与已有 Release 的实际状态 |
   | Policy and release plan | 读 `.release-policy.yml`，判定 `release_health` 与本次版本 |
   | Test / Build | 执行 policy 中的 `npm ci && npm test -- --runInBand --silent` 与 `scripts/build-release` |
   | Asset gate and draft transaction | 校验 `assets.required`（`pixivflow-*.tgz`）并创建草稿 |
   | Required registry publication | `npx --yes npm@11 publish --provenance --access public --ignore-scripts` |
   | Publish GHCR image | 推送 `ghcr.io/redtidev1918/pixivflow`（amd64 + arm64）；policy 中 GHCR 属可选渠道，失败不阻塞发版 |
   | Required registry verification | 回读 npm 与 GHCR 确认版本可查 |
   | Publish, set Latest, audit, then prune Release objects | 创建正式 Release、设为 Latest、按 `retention` 清理旧 Release |

4. **发布后核对。** npm 与 GHCR 都能查到新版本、Release 附件与 `SHA256SUMS` 一致、Version Sync Check 转绿。

`version`、`tag`、`release_health`、`run_release`、`tag_drift` 等输出由 releasegraph 返回，含义见[如何调用发布工作流](https://github.com/redtidev1918/releasegraph/blob/main/docs/callers.md)。

## 手动恢复入口

需要重跑或修复时用 `.github/workflows/release.yml` 的 `workflow_dispatch`：

| 输入 | 用途 |
| --- | --- |
| `version` | 指定已存在的版本；留空则读 manifest |
| `dry_run` | 只计划与构建，不发布任何东西 |
| `force` | 对已健康的版本重跑 |
| `repair` | 修复**同一个**版本的不完整发布 |
| `stage` | 只跑指定阶段 |

`release_health` 取值 `healthy` / `tag-drift` / `repair` / `missing`：不是 `healthy` 就说明实际状态不满足 policy，此时用 `repair` 或 `force`，不要手工 `git tag -f`、`gh release create` 或直接往 npm 推包——那会绕开编排器维持的 exactly-once 不变量。

## 版本一致性校验

- `./scripts/check-version-sync.sh`（`npm run check:version`）本地比对 `package.json`、npm 已发布版本与 Git 标签三者。
- `.github/workflows/version-sync-check.yml` 在 push 到 `master`/`main`、`v*` 标签推送、对这两个分支的 PR 以及每天 UTC 00:00 运行同样的检查；标签存在但 npm 查不到（等待传播窗口后）或标签内版本不一致时工作流失败。

## 本地兜底脚本

仓库仍保留一套不依赖 CI 的手工路径，仅在上游编排不可用或需要本地直发时使用；脚本参数、执行顺序与清理辅助见 [SCRIPTS.md](./SCRIPTS.md)。手工发布同样会产生 `v*` 标签，因此会触发 Release 工作流，请以实际发布结果为准。

## 已知现象与排查

| 现象 | 说明与处理 |
| --- | --- |
| release-please 在分支上的 PR dry-run 长期不稳定 | 这类运行失败（`failure`/`action_required`）是既有现象，不代表发版受阻；**权威路径是 push 到 `master` 触发的正式运行**，以它为准 |
| 发布后几分钟内 `npm view` 报版本不存在 | registry 读取有 5–10 分钟传播/缓存延迟，本地 npm 客户端也会缓存旧 packument 约 5 分钟。**不要以几分钟内的 404 判定发布失败**，核查时用 18:40 之后的时间点或换缓存目录 |
| 发行提交里 `src/version.ts` 没变 | 既有约定：release-please 不更新该文件，`scripts/write-version.js` 在构建时按 `package.json` 重新生成，注册表产物中的版本因此是正确的 |
| releasegraph 运行里 `setup-node` 步骤被跳过 | 该步骤的条件是 `contains(required_publish, 'npm publish')`，而 policy 写的是 `npx --yes npm@11 publish`，子串不匹配。发布本身仍会成功（`npx` 自行获取 npm），但这一步的 registry 认证初始化实际未生效 |
| 流水线在 startup 阶段失败、没有产生任何 job | 调用方权限少于被调用工作流所需权限（当前需要 `contents`/`pull-requests`/`packages`/`id-token`/`issues` 的 `write`） |
| Version Sync Check 红 | 先看 Release 工作流日志：npm 未发布就修复后重走流程；标签指向的版本不一致则删除标签、修正提交后重打 |

## 相关文档

- [CONTRIBUTING](https://github.com/redtidev1918/PixivFlow/blob/master/CONTRIBUTING.md) — 提交流程与规范
- [CHANGELOG](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md) — 各版本变更记录，由 release-please 生成
- [SCRIPTS.md](./SCRIPTS.md) — publish/release 系列脚本的参数速查
- [DOCKER.md](./DOCKER.md) — Docker 场景升级镜像的操作
- [../README.md](https://github.com/redtidev1918/PixivFlow) — 项目总览
