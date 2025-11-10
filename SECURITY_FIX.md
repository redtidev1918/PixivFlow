# 安全修复说明

## 问题
在 `config/standalone.config.novel-chinese.json` 文件中发现了泄露的 `refreshToken`，该文件已被提交到 Git 历史中。

## 已完成的修复

1. ✅ **从 Git 历史中移除敏感信息**
   - 使用 `git filter-repo` 从整个 Git 历史中移除了真实的 `refreshToken`
   - 所有历史提交中的敏感信息已被替换为占位符 `YOUR_REFRESH_TOKEN_HERE`

2. ✅ **更新 .gitignore**
   - 已确保 `config/standalone.config.json` 被排除
   - 已添加 `config/presets/` 目录到排除列表

3. ✅ **修复当前文件**
   - 当前工作目录中的文件已更新为占位符

## ⚠️ 重要：必须立即执行的操作

### 1. 立即更换你的 Pixiv refreshToken

**你的 refreshToken 已经泄露，必须立即更换！**

泄露的 Token: `REDACTED_TOKEN`

**更换步骤：**
1. 访问 Pixiv 设置页面
2. 撤销当前的访问令牌
3. 重新登录并获取新的 refreshToken
4. 更新你的本地配置文件 `config/standalone.config.json`（如果存在）

### 2. 强制推送到 GitHub（重写远程历史）

⚠️ **警告：这会重写 GitHub 上的历史记录**

```bash
# 强制推送以更新远程仓库
git push origin --force --all

# 如果还有其他标签，也需要强制推送标签
git push origin --force --tags
```

**重要提示：**
- 这会重写 GitHub 上的所有历史
- 如果有其他人在使用这个仓库，他们需要重新克隆
- 建议先通知协作者（如果有的话）

### 3. 验证修复

推送后，请验证 GitHub 上的文件不再包含敏感信息：

```bash
# 检查远程仓库中的文件
git show origin/master:config/standalone.config.novel-chinese.json | grep refreshToken
```

应该显示：`"refreshToken": "YOUR_REFRESH_TOKEN_HERE"`

## 预防措施

1. **永远不要提交包含真实 Token 的配置文件**
2. **使用示例文件**：提交时只提交 `.example.json` 文件
3. **检查 .gitignore**：确保所有敏感文件都被排除
4. **使用环境变量**：考虑使用环境变量存储敏感信息
5. **定期检查**：使用 `git log -p` 检查历史提交中是否包含敏感信息

## 备份

在强制推送之前，已创建备份分支：`backup-before-cleanup`

如果需要恢复，可以使用：
```bash
git checkout backup-before-cleanup
```

---

**修复完成时间：** 2025年11月10日 13:40
**修复工具：** git-filter-repo

