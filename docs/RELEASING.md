# 发版指南

> **English:** How to cut a PixivFlow release. Versions follow semver and
> live in `package.json`; a CI workflow cross-checks package.json, npm and
> git tags. The standard path is: update CHANGELOG, push a `vX.Y.Z` tag,
> and let the Publish workflow release via npm Trusted Publishing (OIDC).
> A local fallback via `scripts/publish.sh` and post-release verification
> steps are included.

本文档面向有 npm/GitHub 权限的维护者。覆盖:版本号规则、发布前检查、tag 触发自动发布、手动兜底发布与发布后验证。

---

## 版本号规则

- 遵循语义化版本:`patch` 修 bug,`minor` 加功能,`major` 破坏性变更。
- `package.json` 的 `version` 字段是唯一事实源(当前流水线不做任何自动改写)。
- Git 标签固定为 `v<版本号>`(如 `v2.0.42`),tag 指向的提交中 package.json 必须已是该版本。
- `check-version-sync.sh`(`npm run check:version`)本地比对三者;`.github/workflows/version-sync-check.yml` 在 master/main 推送、PR、`v*` tag 推送时以及每天 UTC 00:00 运行同样的检查,并写入 Step Summary。tag 存在但 npm 上查不到(等待约 5 分钟后)或 tag 内版本不一致时,工作流直接失败。

## 发布前检查清单

- [ ] `npm test` 通过,`npm run build` 无 TypeScript 错误。
- [ ] [CHANGELOG](./project/CHANGELOG.md) 新增条目,格式必须是 `## [x.y.z] - YYYY-MM-DD`——`create-release.sh` 按这个模式提取 Release 说明。
- [ ] `npm run check:version` 通过;目标版本未在 npm 上占用(`npm view pixivflow@x.y.z version` 应为空)。
- [ ] 敏感信息检查通过:`./scripts/check-sensitive-info.sh` 与 `./scripts/verify-git-safety.sh`。
- [ ] 工作区干净(publish.sh 会拒绝在未提交更改下继续发版)。
- [ ] 破坏性/行为变更已在 README 与 DOCKER.md 同步。

## 标准流程:打 tag 触发自动发布

`.github/workflows/release.yml`(名称 Publish)监听两种事件:`v*` 标签推送和手动 workflow_dispatch。步骤依次为:

1. checkout 代码(actions/checkout@v7);
2. 安装 Node.js 24(actions/setup-node@v7,registry 指向 npmjs.org);
3. `npm ci`;
4. `npm run build --if-present`;
5. `npm publish --access public`,凭据来自 GitHub OIDC(工作流声明 `id-token: write`),npm 侧校验仓库与工作流文件名,无长期 token;
6. 创建 GitHub Release(softprops/action-gh-release@v2),开启 `generate_release_notes: true` 自动汇总 Release Notes。

操作:

```bash
# 1. 版本号写进 package.json 并生成提交+标签(npm version 建的是轻量标签)
npm version patch   # 或 minor / major

# 2. 显式推送提交与该版本标签(--follow-tags 对轻量标签无效)
git push origin master vX.Y.Z
```

标签到达远端即触发 Publish 工作流,无需其他动作。

### 方式 B:Actions 一键发版(workflow_dispatch)

GitHub 仓库页 → Actions → **Publish** → Run workflow → 选择 `patch` / `minor` / `major` → 运行。工作流自动完成:

1. 升级 `package.json` 版本号并提交(github-actions[bot]);
2. 打 `v*` 标签并推送;
3. 构建、发布 npm;
4. 创建带自动 Release Notes 的 GitHub Release。

全程无需本地命令;适合"改完想立刻发"的场景。

**前置条件(一次性,npm 后台完成)**:

- redtidev1918 是 pixivflow 的 maintainer(`npm owner ls pixivflow` 可验证);
- npm 包管理页 → Settings → Trusted Publishers 登记 Provider 为 GitHub Actions、Owner/User `redtidev1918`、Repository `PixivFlow`、Workflow filename `release.yml`(与 release.yml 头部注释一致)。

注意:Publish 工作流不含"版本已存在则跳过"的守卫,也不会回写版本号——确保你推的正是包含新版本号的那个提交;方式 B(workflow_dispatch)则会自动回写版本号、打标签并创建 Release。

## 兜底路径一:publish.sh 本地全流程

OIDC 未配置或需要本地直发时使用:

```bash
./scripts/publish.sh patch        # 也接受 minor/major 或具体 x.y.z
```
脚本按序执行:确认版本计划 → 校验新版本号严格递增且未被 npm 占用 → 检查 npm 登录 → 跑测试(失败仅警告继续)→ 构建 → `npm version --no-git-tag-version` 升级版本号并提交 chore 提交 → 创建 `v<new>` 附注标签(已有同名但指向不同版本的标签时会要求删除重建)→ `npm publish --access public --ignore-scripts` 本地发布(已构建过,故跳过 prepublishOnly)→ `npm view` 验证 → 推送分支与当前版本标签 → 重跑 check-version-sync.sh → 询问是否调用 create-release.sh 建 GitHub Release。

两点须知:

- 推送标签同样会触发 Publish 工作流;若该版本已由本地发布成功,npm 对重复版本号的发布会报错,以本地结果为准即可。
- 脚本结尾打印的 GitHub 链接仍是旧账号 zoidberg-xgd/PixivFlow,已过期,以 redtidev1918/PixivFlow 为准。

不需要 CI 的最小手工等价路径:

```bash
npm test && npm run build
npm version patch --no-git-tag-version
git add -A && git commit -m "chore: bump version to x.y.z"
git tag -a vx.y.z -m "vx.y.z"
git push origin master vx.y.z
npm publish --access public
```

## 兜底路径二:GitHub Release

`create-release.sh`:检查 gh CLI 与登录状态 → 要求远程已存在对应标签(可现场推送)→ 从 docs/project/CHANGELOG.md 提取 `## [<version>]` 块作为说明 → 交互确认后创建或更新 Release。批量补历史标签用 `create-releases-for-tags.sh`。

已知问题:脚本内 REPO 变量硬编码为 `zoidberg-xgd/PixivFlow`,仓库迁移到 redtidev1918 后该脚本会把 Release 建到错误仓库(若无权限则直接失败)。在修复前,手动执行:


或直接在 Releases 页面 Draft a new release,正文粘贴 CHANGELOG 对应章节(推荐,免转义)。

版本清理辅助:`cleanup-github-tags.sh`(--dry-run 先预览)只保留当前版本标签;`manage-versions.sh` 批量 deprecate/unpublish npm 旧版;两者组合为 `publish-and-cleanup.sh`。

## 发布后验证

```bash
# npm 已收录(可能要等几分钟索引)
npm view pixivflow version            # latest 指向新版本
npm view pixivflow@x.y.z version      # 精确查询
# 冒烟安装
npx pixivflow@x.y.z version           # 输出应包含 x.y.z
npm install -g pixivflow && pixivflow help
# 站内一致性
npm run check:version                 # 三方比对应为绿
```

- 观察 Actions 页两处:Publish 工作流应为绿色;Version Sync Check 待 npm 索引完成后转绿(tag 存在但 npm 未查到会先重试约 5 分钟再判红)。
- GitHub Pages 文档由 pages.yml 单独驱动,push 到 master 且改动 docs/** 时部署,与 npm 发布相互独立。

## 常见故障

| 现象 | 原因与处理 |
| --- | --- |
| Publish 工作流 OIDC 报权限/未授权 | Trusted Publisher 三项信息或 maintainer 归属没配好,见前置条件 |
| `npm publish` 报版本已存在 | tag/版本已被占用:换下一版本号;或确认本地 publish.sh 是否已发过同一版本 |
| Version Sync Check 红:npm 未发布 | 标签推了但发布失败——看 Publish 工作流日志定位,修复后删除该标签重新走流程 |
| Version Sync Check 红:标签不一致 | v 标签指向的 package.json 版本不符,删除标签修正提交后重打 |
| create-release.sh 发布到错误仓库 | 上文已知问题,手动指定 --repo redtidev1918/PixivFlow |


---

## 相关文档

- [CONTRIBUTING](./project/CONTRIBUTING.md) — 提交流程与规范
- [CHANGELOG](./project/CHANGELOG.md) — 各版本变更记录,Release 正文的唯一来源
- [SCRIPTS.md](./SCRIPTS.md) — publish/release 系列脚本的参数速查
- [DOCKER.md](./DOCKER.md) — Docker 场景升级镜像的操作
- [../README.md](../README.md) — 项目总览
