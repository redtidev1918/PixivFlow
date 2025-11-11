# 版本同步保护机制

本文档说明了项目中实施的版本同步保护机制，确保 package.json、npm 和 GitHub 标签始终保持同步。

## 🛡️ 多层防护体系

### 1. 发布脚本自动验证 (`scripts/publish.sh`)

发布脚本在发布前和发布后都会进行自动验证：

#### 发布前检查：
- ✅ 验证版本号格式（必须符合 `x.y.z` 格式）
- ✅ 验证版本号是否递增（新版本必须大于当前版本）
- ✅ 检查版本是否已在 npm 上发布（防止重复发布）
- ✅ 验证标签与 package.json 版本是否一致

#### 发布后检查：
- ✅ 验证 npm 发布是否成功
- ✅ 验证 GitHub 标签是否推送成功
- ✅ 运行完整的版本同步检查脚本

### 2. Git Hooks 防护

#### `pre-tag` Hook
在创建标签时自动检查：
- ✅ 验证标签版本与当前 package.json 版本是否匹配
- ✅ 检查版本是否已在 npm 上发布（警告）
- ❌ 如果版本不匹配，阻止标签创建

#### `pre-push` Hook
在推送标签到远程时自动检查：
- ✅ 验证标签指向的提交中的 package.json 版本
- ❌ 如果版本不一致，阻止标签推送

### 3. GitHub Actions 持续检查

`.github/workflows/version-sync-check.yml` 工作流会在以下情况自动运行：

- 🔄 推送标签时
- 🔄 推送到 master/main 分支时
- 🔄 创建 Pull Request 时
- 🔄 每天自动运行一次（定时检查）
- 🔄 手动触发

检查内容：
- ✅ package.json 版本
- ✅ npm 发布状态
- ✅ GitHub 标签存在性
- ✅ 标签版本一致性
- ✅ 额外标签检测（存在但未发布到 npm）

### 4. 版本同步检查脚本 (`scripts/check-version-sync.sh`)

可以随时手动运行的检查脚本：

```bash
npm run check:version
# 或
./scripts/check-version-sync.sh
```

检查内容：
- 📦 package.json 版本
- 📦 npm 最新版本
- 📦 npm 当前版本是否存在
- 🏷️  GitHub 标签是否存在
- 🏷️  本地标签是否存在
- 🏷️  最近 5 个版本的额外标签检测
- 🏷️  当前版本和最近 3 个版本的版本一致性检查

## 📋 发布流程

### 标准发布流程

1. **使用发布脚本**（推荐）：
   ```bash
   npm run publish:patch  # 补丁版本 (2.0.10 -> 2.0.11)
   npm run publish:minor  # 次要版本 (2.0.10 -> 2.1.0)
   npm run publish:major  # 主要版本 (2.0.10 -> 3.0.0)
   npm run publish 2.0.11 # 指定版本
   ```

2. **发布脚本会自动**：
   - 运行测试
   - 构建项目
   - 更新版本号
   - 创建提交
   - 创建标签（带验证）
   - 发布到 npm
   - 推送到 GitHub
   - 运行最终验证

### 手动发布（不推荐）

如果必须手动发布，请遵循以下步骤：

1. **更新 package.json 版本**
   ```bash
   npm version patch --no-git-tag-version
   ```

2. **提交更改**
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version to X.Y.Z"
   ```

3. **创建标签**（Git hook 会自动验证）
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   ```

4. **发布到 npm**
   ```bash
   npm publish --access public
   ```

5. **推送代码和标签**（Git hook 会自动验证）
   ```bash
   git push
   git push --tags
   ```

6. **运行验证**
   ```bash
   npm run check:version
   ```

## ⚠️ 常见问题

### Q: 如果标签版本与 package.json 不匹配怎么办？

A: Git hooks 会阻止创建或推送不一致的标签。如果已经创建了不一致的标签：

1. 删除本地标签：`git tag -d vX.Y.Z`
2. 删除远程标签：`git push origin :refs/tags/vX.Y.Z`
3. 使用发布脚本重新创建：`./scripts/publish.sh`

### Q: 如果版本已在 npm 上发布但标签不存在？

A: 运行检查脚本会检测到这个问题。创建标签时，确保标签指向包含正确 package.json 版本的提交。

### Q: 如果标签存在但版本未在 npm 上发布？

A: 这通常表示发布失败。检查脚本会检测到这个问题。可以：
1. 删除标签并重新发布
2. 或者直接发布到 npm（如果 package.json 版本正确）

### Q: 如何绕过 Git hooks？（不推荐）

A: 使用 `--no-verify` 标志可以绕过 hooks，但**强烈不推荐**：
```bash
git tag -a vX.Y.Z -m "vX.Y.Z" --no-verify
git push --tags --no-verify
```

## 🔧 维护

### 更新 Git Hooks

Git hooks 位于 `.git/hooks/` 目录。如果需要更新：

1. 编辑相应的 hook 文件
2. 确保文件有执行权限：`chmod +x .git/hooks/pre-tag .git/hooks/pre-push`

### 更新 GitHub Actions

GitHub Actions 工作流位于 `.github/workflows/version-sync-check.yml`。修改后会自动生效。

### 测试保护机制

1. **测试 pre-tag hook**：
   ```bash
   # 尝试创建版本不一致的标签（应该失败）
   git tag -a v999.999.999 -m "test"
   ```

2. **测试 pre-push hook**：
   ```bash
   # 创建不一致的标签并尝试推送（应该失败）
   git tag -a v999.999.999 -m "test"
   git push origin v999.999.999
   ```

3. **测试检查脚本**：
   ```bash
   npm run check:version
   ```

## 📊 监控

- GitHub Actions 会在每次推送时自动检查版本同步状态
- 检查结果会显示在 Actions 标签页
- 如果检查失败，会显示详细的错误信息和建议

## ✅ 最佳实践

1. **始终使用发布脚本**：`./scripts/publish.sh`
2. **发布前运行检查**：`npm run check:version`
3. **定期检查**：GitHub Actions 每天自动检查
4. **不要手动创建标签**：除非你完全理解版本同步机制
5. **查看 GitHub Actions**：确保所有检查都通过

## 🎯 总结

通过多层防护机制，我们确保了：

- ✅ 标签版本与 package.json 版本始终一致
- ✅ 发布的版本都有对应的标签
- ✅ 标签都有对应的 npm 发布
- ✅ 自动检测和报告不一致问题
- ✅ 防止人为错误导致的版本不同步

这些机制共同工作，确保版本同步问题**永远不会再次出现**。

