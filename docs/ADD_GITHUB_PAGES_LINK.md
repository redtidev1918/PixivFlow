# 如何在 GitHub 仓库中添加 GitHub Pages 链接

本文档说明如何在 GitHub 仓库的多个位置添加 GitHub Pages 链接，让用户更容易找到文档。

## 📍 可以添加链接的位置

### 1. 仓库的 About 部分（推荐 ⭐）

这是最显眼的位置，会在仓库主页右侧显示：

1. 进入仓库主页：https://github.com/zoidberg-xgd/PixivFlow
2. 在右侧找到 **About** 部分
3. 点击右侧的 **⚙️ 设置图标**（齿轮图标）
4. 在 **Website** 字段中输入：
   ```
   https://zoidberg-xgd.github.io/PixivFlow/
   ```
5. 点击 **Save changes**

完成后，仓库主页右侧会显示一个网站链接图标，点击即可访问文档。

### 2. README.md 文件（已完成 ✅）

链接已添加到：
- 中文 README.md 顶部导航栏
- 中文 README.md 项目介绍部分
- 英文 README_EN.md 顶部导航栏

### 3. package.json（已完成 ✅）

`homepage` 字段已更新为 GitHub Pages 地址。

### 4. 仓库描述（可选）

在仓库设置中可以添加描述，但描述长度有限，建议在描述中提及"查看文档"。

## 🎯 推荐操作

**立即执行**：在仓库的 About 部分添加 Website 链接（方法 1）

这是最有效的方式，因为：
- ✅ 链接会显示在仓库主页右侧，非常显眼
- ✅ 所有访问仓库的用户都能看到
- ✅ 符合 GitHub 的最佳实践

## 📝 其他建议

### 在 Issues 模板中添加

如果使用 GitHub Issues，可以在 Issue 模板中添加文档链接提示。

### 在 Release Notes 中添加

发布新版本时，可以在 Release Notes 中添加文档链接。

## ✅ 当前状态

- [x] README.md 已添加链接
- [x] README_EN.md 已添加链接
- [x] package.json homepage 已更新
- [ ] 仓库 About 部分（需要手动在 GitHub 网页上设置）

## 🔗 链接地址

GitHub Pages 地址：
```
https://zoidberg-xgd.github.io/PixivFlow/
```

