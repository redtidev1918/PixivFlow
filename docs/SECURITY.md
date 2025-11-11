# 安全指南 - 防止敏感信息泄漏

## ⚠️ 重要警告

**永远不要将真实的 refreshToken 提交到 Git 仓库！**

## 已实施的保护措施

### 1. Pre-commit Hook
项目已配置 pre-commit hook，会在每次提交前自动检查：
- 检测可能的敏感信息（token、API key 等）
- 阻止包含真实 token 的提交
- 允许使用 placeholder（如 `YOUR_REFRESH_TOKEN`）

### 2. .gitignore 配置
以下文件/目录已被忽略，不会被提交：
- `config/standalone.config.json` - 用户配置文件
- `config/standalone.config.simple.json` - 用户简化配置
- `.pixiv-refresh-token` - Token 存储文件
- `*SECURITY*.md` - 安全报告文件
- `data/` - 数据库目录
- `downloads/` - 下载目录

### 3. 敏感信息检测脚本
运行以下命令检查仓库中是否包含敏感信息：
```bash
./scripts/check-sensitive-info.sh
```

## 正确的配置方式

### ✅ 正确做法

1. **使用示例配置文件**
   ```bash
   cp config/standalone.config.example.json config/standalone.config.json
   ```

2. **使用 placeholder**
   ```json
   {
     "pixiv": {
       "refreshToken": "YOUR_REFRESH_TOKEN"
     }
   }
   ```

3. **真实 token 存储在独立文件**
   - Token 会自动保存到 `.pixiv-refresh-token`（在数据库目录）
   - 这个文件在 `.gitignore` 中，不会被提交

### ❌ 错误做法

1. ❌ 在配置文件中使用真实 token 并提交
2. ❌ 在代码中硬编码 token
3. ❌ 在提交消息中包含 token
4. ❌ 将包含 token 的文件添加到 Git

## 如果已经泄漏了 token

如果发现 token 已经被提交到 Git：

1. **立即撤销 token**
   - 登录 Pixiv 账户
   - 撤销/重新生成 refreshToken

2. **清理 Git 历史**
   ```bash
   # 使用 git-filter-repo 清除历史中的 token
   git filter-repo --replace-text <(echo "YOUR_TOKEN==>REDACTED_TOKEN") --force
   
   # 强制推送到远程（警告：这会重写历史）
   git push origin --force --all
   ```

3. **通知协作者**
   - 如果仓库有协作者，通知他们重新克隆仓库
   - 因为 Git 历史已被重写

## 检查清单

在提交代码前，请确认：

- [ ] 配置文件中使用 `YOUR_REFRESH_TOKEN` 而不是真实 token
- [ ] 没有在代码中硬编码 token
- [ ] 没有在提交消息中包含敏感信息
- [ ] 运行了 `./scripts/check-sensitive-info.sh` 且通过检查
- [ ] Pre-commit hook 正常工作（会自动运行）

## 自动化保护

项目已配置以下自动化保护：

1. **Pre-commit Hook** - 自动检查每次提交
2. **.gitignore** - 自动忽略敏感文件
3. **Token Manager** - 自动将 token 存储到安全位置

## 需要帮助？

如果遇到问题或不确定是否安全：
1. 运行检测脚本：`./scripts/check-sensitive-info.sh`
2. 检查 `.gitignore` 确保文件被忽略
3. 查看示例配置文件了解正确格式

---

**记住：安全第一！永远不要提交真实的 token！**
