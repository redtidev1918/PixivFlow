# 🚀 发版指南 / Releasing

本文说明如何把 PixivFlow 发布到 **npm** 与 **GitHub Release**。

## 前置条件（一次性）

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| npm 包名 `pixivflow` | ✅ 已存在（2.0.0 起） | [npmjs.com/package/pixivflow](https://www.npmjs.com/package/pixivflow) |
| npm Trusted Publisher | ⚠️ 需在 npm 网页配置 | 包管理页 → Settings → Trusted Publishers 填入 `redtidev1918 / PixivFlow / release.yml`（详见下方） |
| Pages 部署 | ✅ docs/ → GitHub Pages | push 到 master 且改动 `docs/**` 时自动部署 |

### ⚠️ npm 维护者归属（必须先完成）

仓库已迁移至 [redtidev1918](https://github.com/redtidev1918/PixivFlow)。npm 的
Granular token 权限不能超过创建者自身拥有的包权限，因此 **redtidev1918 必须先
成为 `pixivflow` 的维护者**，其创建的任何 token 才有资格发布。

已有待接受的邀请（勿重复 `npm owner add`）：

1. 登录 **redtidev1918** →
   [pixivflow/access 页](https://www.npmjs.com/package/pixivflow/access)
   → 接受现有 maintainer 邀请；
2. 用旧账号验证（预期看到两行，缺一行则邀请未生效）：
   ```bash
   npm owner ls pixivflow
   # zoidberg-xgd <...>
   # redtidev1918 <...>
   ```

在此之前，无论哪种发布方式（含 Trusted Publishing / Granular token）都会失败。

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

``.github/workflows/release.yml` 会自动（**Trusted Publishing / OIDC，无
长期 token**）：

1. `npm ci` 安装依赖；
2. `npm run build`（TypeScript 编译 + WebUI 打包）;
3. `npm publish --access public` —— 以 OIDC 身份验证，npm 侧校验
   repository 与 workflow filename。

要求：Node ≥ 24（自带支持 OIDC 的 npm 版本），且包管理页已配置好 Trusted
Publisher（见上文前置条件）。

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


## 🔍 常见发布故障

### `E404 Not Found (PUT ...)`

token 无权访问此包的伪装错误。按顺序排查：

1. redtidev1918 是否已**接受** maintainer 邀请（见上文维护者归属）；
2. 用旧账号 `npm owner ls pixivflow` 确认列表里有 redtidev1918；
3. 若用 token 发布：确认该 Granular token 创建时勾选了 pixivflow 范围。

### `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required`

token 身份已被接受，但缺少发布所需的 2FA 免验资格。两种解法：

- **临时（过渡期）**：重新生成 Granular Access Token，创建时勾选
  **Bypass two-factor authentication = ✓**、Packages and scopes 只选
  `pixivflow`、Read and write。⚠️ 该选项只能在创建时设置，已建 token 无法
  补勾；且 npm 计划于 2027 年初取消此类 token 的直接发布能力。
- **推荐（一劳永逸）**：改用本仓库当前的
  [Trusted Publishing 流程](#标准发版流程)（release.yml + OIDC，
  无任何长期 token）。

### 前提检查清单（任一失败先补这个）

- [ ] redtidev1918 出现在 `npm owner ls pixivflow` 中；
- [ ] npm 包页 → Settings → Trusted Publishers 已登记
      `redtidev1918 / PixivFlow / release.yml`；
- [ ] package.json 的 `repository.url` 指向当前真实维护仓库
      （npm trusted publishing 会校验它）。

## 手动触发（备用）

Actions 页面 → **Publish** → Run workflow。适用于 tag 被误删、或需要重新
触发发布流程的场景（对应版本未被占用时才会真正上传）。

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
