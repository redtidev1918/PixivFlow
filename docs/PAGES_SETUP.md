# GitHub Pages 启用指南

本项目已配置好 GitHub Pages 自动部署，按照以下步骤启用即可。

## 🚀 快速启用（推荐）

### 方法 1：使用 GitHub Actions 自动部署（已配置）

1. **推送代码到 GitHub**
   ```bash
   git add docs/index.html docs/.nojekyll .github/workflows/deploy-pages.yml
   git commit -m "feat: add GitHub Pages"
   git push origin master
   ```

2. **在 GitHub 仓库中启用 Pages**
   - 进入仓库：https://github.com/zoidberg-xgd/pixivflow
   - 点击 **Settings** → **Pages**
   - 在 **Source** 部分选择：
     - **Source**: `GitHub Actions`（不是 Branch）
   - 点击 **Save**

3. **等待部署完成**
   - 进入 **Actions** 标签页
   - 查看 `Deploy GitHub Pages` workflow 的运行状态
   - 部署成功后，页面将在几分钟内可用

4. **访问你的页面**
   ```
   https://zoidberg-xgd.github.io/pixivflow/
   ```

### 方法 2：使用 Branch 部署（传统方式）

如果你不想使用 GitHub Actions，也可以使用传统的分支部署：

1. **在 GitHub 仓库中启用 Pages**
   - 进入仓库：https://github.com/zoidberg-xgd/pixivflow
   - 点击 **Settings** → **Pages**
   - 在 **Source** 部分选择：
     - **Branch**: `master`（或你的主分支）
     - **Folder**: `/docs`
   - 点击 **Save**

2. **访问你的页面**
   ```
   https://zoidberg-xgd.github.io/pixivflow/
   ```

## 📝 注意事项

### 使用 GitHub Actions 部署的优势

- ✅ 更灵活：可以自定义部署流程
- ✅ 更现代：使用最新的 GitHub Pages 部署方式
- ✅ 更可控：可以添加构建步骤、测试等
- ✅ 自动触发：每次更新 `docs/` 目录时自动部署

### 使用 Branch 部署的优势

- ✅ 更简单：无需配置 workflow
- ✅ 更传统：GitHub 原生支持
- ✅ 更直接：直接使用分支中的文件

## 🔄 更新页面

### 使用 GitHub Actions（方法 1）

每次更新 `docs/index.html` 并推送到 GitHub 后，GitHub Actions 会自动部署：

```bash
# 修改 docs/index.html 后
git add docs/index.html
git commit -m "docs: update GitHub Pages"
git push origin master
```

### 使用 Branch 部署（方法 2）

直接推送更新到 `docs/` 目录即可，GitHub 会自动更新：

```bash
# 修改 docs/index.html 后
git add docs/index.html
git commit -m "docs: update GitHub Pages"
git push origin master
```

## 🎨 自定义域名（可选）

如果你想使用自定义域名：

1. **创建 CNAME 文件**
   在仓库根目录创建 `CNAME` 文件（注意：不是 `docs/CNAME`）：
   ```
   example.com
   ```

2. **配置 DNS**
   在你的域名 DNS 设置中添加 CNAME 记录：
   ```
   类型: CNAME
   名称: @ (或 www)
   值: zoidberg-xgd.github.io
   ```

3. **在 GitHub 设置中启用**
   - 进入 **Settings** → **Pages**
   - 在 **Custom domain** 中输入你的域名
   - 勾选 **Enforce HTTPS**

## 🐛 故障排除

### 页面显示 404

1. 检查 GitHub Pages 是否已启用（Settings → Pages）
2. 检查 `docs/index.html` 文件是否存在
3. 等待几分钟让 GitHub 完成部署
4. 清除浏览器缓存后重试

### 页面样式丢失

1. 确保 `docs/.nojekyll` 文件存在（已创建）
2. 检查 HTML 中的 CSS 路径是否正确
3. 检查浏览器控制台是否有错误

### GitHub Actions 部署失败

1. 检查 workflow 文件语法是否正确
2. 确保在 Settings → Pages 中选择了 "GitHub Actions" 作为源
3. 查看 Actions 标签页中的错误信息

## 📚 相关资源

- [GitHub Pages 文档](https://docs.github.com/en/pages)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [项目仓库](https://github.com/zoidberg-xgd/pixivflow)

