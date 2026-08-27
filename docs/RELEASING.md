# 🚀 发版指南 / Releasing

本文说明如何把 PixivFlow 发布到 **npm** 与 **GitHub Release**。

## 前置条件（一次性）

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| npm 包名 `pixivflow` | ✅ 已存在（2.0.0 起） | [npmjs.com/package/pixivflow](https://www.npmjs.com/package/pixivflow) |
| GitHub Secret `NPM_TOKEN` | ✅ 已配置 | 用于 CI 自动发布 |
| Pages 部署 | ✅ docs/ → GitHub Pages | push 到 master 且改动 `docs/**` 时自动部署 |

### ⚠️ npm 维护者迁移（重要）

npm 包的历史维护者是旧账号。仓库已迁移至
[redtidev1918/PixivFlow](https://github.com/redtidev1918/PixivFlow)，建议在
[npm 包管理页](https://www.npmjs.com/package/pixivflow/access) 完成一次迁移：

- 用旧账号登录后执行 `npm owner add redtidev1918 pixivflow`，再
  `npm owner rm <旧用户名> pixivflow`；
- 或直接更新仓库 Secret `NPM_TOKEN` 为新账号的 Access Token（Publish 类型）。

未完成前，CI 的发布步骤仍会用现有 token 以包的当前维护者身份推送（可正常工作）。

## 标准发版流程

### 1. 准备版本内容

- 更新 [docs/project/CHANGELOG.md](project/CHANGELOG.md)，新增对应版本的条目；
- 确保 `flutter`/`node` 相关测试通过：`npm test`；
- 本地构建验证：`npm run build`。

### 2. 升级版本号

```bash
# 按语义化版本选择
npm version patch   # 2.0.41 -> 2.0.42（Bug 修复）
npm version minor   # 2.1.0（新功能）
npm version major   # 3.0.0（破坏性变更）
git push --follow-tags
```

`npm version` 会同步修改 `package.json`、`package-lock.json` 并创建 tag。

### 3. 推送 tag 触发自动发布

```bash
git push origin v<版本号>
```

`.github/workflows/publish-npm.yml` 会自动：

1. Node 18 环境安装依赖并运行测试；
2. `npm run build`（TypeScript 编译 + WebUI 打包）;
3. 校验目标版本是否已发布（已发布则跳过）；
4. `npm publish --access public`；
5. 把 CI 更新的 package.json 版本回写到仓库；
6. 验证 npm registry 上可见，并输出发布摘要。

### 4. GitHub Release（可选）

npm 发布不会自动创建 GitHub Release。如需附带下载与说明页：
[Releases → Draft a new release](https://github.com/redtidev1918/PixivFlow/releases/new)，
正文可直接引用 CHANGELOG 对应章节；创建 Release 也会再次触发 publish 工作流
（其"已发布检测"会自动跳过重复发布）。

## 发布检查清单

- [ ] `npm test` 通过
- [ ] `npm run build` 无 TypeScript 错误
- [ ] CHANGELOG 有本版本条目
- [ ] Docker 用户说明若受影响已同步（docker-compose.yml 的镜像标签）
- [ ] tag 与 package.json 版本一致（工作流会自动对齐并回写）

## 手动发版（备用）

Actions 页面 → **Publish to npm** → Run workflow → 输入目标版本号。
适用于 tag 被误删、或需要重新触发校验流程的场景。

## 用户侧安装

最终用户无需从源码构建：

```bash
# 全局 CLI
npm install -g pixivflow

# 或一次性运行
npx pixivflow --help

# Docker
docker compose up -d   # 见 DOCKER.md
```
