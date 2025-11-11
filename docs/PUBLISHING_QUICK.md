# 📦 npm 包发布快速指南

## ❓ npm 包会自动从 GitHub 同步吗？

**不会！** npm 包**不会**自动从 GitHub 同步。每次更新都需要手动发布到 npm registry。

## 🚀 快速发布

### 方式一：使用发布脚本（推荐）

```bash
# 发布补丁版本 (2.0.0 -> 2.0.1)
npm run publish:patch

# 发布次版本 (2.0.0 -> 2.1.0)
npm run publish:minor

# 发布主版本 (2.0.0 -> 3.0.0)
npm run publish:major

# 或直接指定版本
./scripts/publish.sh 2.0.1
```

### 方式二：手动发布

```bash
# 1. 更新版本号
npm version patch  # 或 minor, major

# 2. 发布（会自动构建）
npm publish --access public

# 3. 推送到 GitHub
git push && git push --tags
```

### 方式三：GitHub Actions 自动发布

1. **首次配置**：在 GitHub 仓库设置中添加 `NPM_TOKEN` secret
2. **触发发布**：
   - 创建 GitHub Release（自动触发）
   - 或手动运行 "Publish to npm" 工作流

## 📋 发布前检查

- [ ] 代码已测试通过
- [ ] 版本号已更新
- [ ] CHANGELOG.md 已更新
- [ ] 已登录 npm (`npm login`)

## 🔗 相关文档

- 详细发布指南：`docs/PUBLISHING.md`
- GitHub Actions 配置：`.github/workflows/publish-npm.yml`

