# 📦 npm 包发布指南

## 📋 概述

**重要提示**：npm 包**不会**自动从 GitHub 同步。每次更新都需要手动发布到 npm registry。

## 🔄 发布流程

### 方式一：手动发布（当前方式）

#### 1. 更新版本号

使用 npm version 命令更新版本号（会自动创建 git tag）：

```bash
# 补丁版本 (2.0.0 -> 2.0.1)
npm version patch

# 次版本 (2.0.0 -> 2.1.0)
npm version minor

# 主版本 (2.0.0 -> 3.0.0)
npm version major
```

或者手动编辑 `package.json` 中的 `version` 字段。

#### 2. 构建项目

```bash
npm run build
```

> **注意**：`prepublishOnly` 脚本会在发布前自动运行构建，但建议先手动构建并测试。

#### 3. 测试构建结果

```bash
# 测试本地安装
npm link
pixivflow --help

# 或者直接运行
node dist/index.js --help
```

#### 4. 发布到 npm

```bash
# 确保已登录 npm
npm login

# 发布（会自动运行 prepublishOnly 构建）
npm publish --access public
```

#### 5. 推送到 GitHub

```bash
# 推送代码和标签
git push
git push --tags
```

### 方式二：使用 GitHub Actions 自动发布（推荐）

已配置 GitHub Actions 工作流，支持两种触发方式：

#### 方式 A：通过 GitHub Release 触发

1. 在 GitHub 上创建新的 Release
2. 填写版本号（如 `v2.0.1`）
3. Actions 会自动：
   - 构建项目
   - 运行测试
   - 更新 package.json 版本
   - 发布到 npm
   - 创建 git tag

#### 方式 B：手动触发工作流

1. 前往 GitHub Actions 页面
2. 选择 "Publish to npm" 工作流
3. 点击 "Run workflow"
4. 输入版本号（如 `2.0.1`）
5. 点击 "Run"

### 配置 npm Token（首次使用自动发布）

1. 获取 npm access token：
   - 访问 https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - 创建新的 "Automation" token
   - 复制 token

2. 在 GitHub 仓库中添加 Secret：
   - 前往 Settings → Secrets and variables → Actions
   - 点击 "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: 粘贴你的 npm token
   - 点击 "Add secret"

## 📝 发布检查清单

发布前请确认：

- [ ] 代码已通过测试：`npm test`
- [ ] 版本号已更新
- [ ] CHANGELOG.md 已更新
- [ ] README.md 中的版本信息已更新（如有）
- [ ] 所有更改已提交到 git
- [ ] 构建成功：`npm run build`
- [ ] 本地测试通过：`npm link && pixivflow --help`

## 🔍 验证发布

发布后验证：

```bash
# 查看 npm 上的版本
npm view pixivflow versions

# 查看最新版本信息
npm view pixivflow

# 测试安装
npm install -g pixivflow@latest
pixivflow --help
```

## 🚨 常见问题

### Q: 发布失败，提示 "You cannot publish over the previously published versions"

**A**: 该版本已存在，需要更新版本号。

### Q: 发布失败，提示 "You must be logged in to publish packages"

**A**: 需要先登录 npm：
```bash
npm login
```

### Q: 如何撤销已发布的版本？

**A**: npm 不允许删除已发布的版本（24小时内可以撤销），但可以发布新版本修复问题。

### Q: 如何发布 beta/alpha 版本？

**A**: 使用预发布版本号：
```bash
npm version 2.0.1-beta.1
npm publish --tag beta
```

用户安装时需要使用：
```bash
npm install -g pixivflow@beta
```

### Q: GitHub Actions 发布失败怎么办？

**A**: 
1. 检查 Actions 日志
2. 确认 `NPM_TOKEN` secret 已正确配置
3. 确认 npm 账户有发布权限
4. 可以回退到手动发布方式

## 📚 相关资源

- [npm 发布文档](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [语义化版本](https://semver.org/lang/zh-CN/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)

