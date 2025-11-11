# 快速开始指南

让 Pixiv 作品收集变得优雅而高效 | Make Pixiv artwork collection elegant and efficient

3 分钟快速上手 PixivFlow。

---

## 📋 环境要求

- **Node.js** 18+ 和 **npm** 9+
- **Pixiv 账号**

> 💡 **提示**：项目默认使用 `pixiv-token-getter`（Node.js 库）进行登录，**不需要 Python**。Python gppt 仅作为后备方案（可选）。

快速检查：
```bash
node --version   # 应显示 v18.0.0 或更高
npm --version    # 应显示 9.0.0 或更高
```

---

## 🚀 快速开始（3 步完成）

### 方式 1：从 npm 安装（推荐 ⭐）

```bash
# 1. 全局安装
npm install -g pixivflow

# 2. 登录账号
pixivflow login

# 3. 开始下载
pixivflow download
```

### 方式 2：从源码安装

#### 步骤 1：安装依赖

```bash
npm install
```

#### 步骤 2：登录账号

```bash
npm run login
```

程序会自动：
1. 优先使用 `pixiv-token-getter`（Node.js 库）进行登录
2. 如果不可用，自动回退到 Puppeteer（Node.js 原生）
3. 最后才使用 Python gppt（后备方案）
4. 获取 refresh token 并保存到配置文件

**登录方式**：
- 在终端输入 Pixiv 用户名和密码
- 程序自动完成登录流程

#### 步骤 3：开始下载

```bash
npm run download
```

> 💡 **提示**：推荐使用 npm 安装方式，更简单快捷。npm 包地址：https://www.npmjs.com/package/pixivflow

---

## ⚙️ 配置下载目标

首次使用需要配置下载目标。编辑 `config/standalone.config.json`：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

**配置说明**：
- `type`: `"illustration"`（插画）或 `"novel"`（小说）
- `tag`: 搜索标签（支持多个标签，用空格分隔）
- `limit`: 下载数量限制

更多配置选项请查看 [配置指南](./CONFIG.md)。

---

## 🎯 常用命令

### 全局安装方式（npm 安装）

```bash
# 登录账号
pixivflow login

# 执行一次下载
pixivflow download

# 随机下载一个作品（快速体验）
pixivflow random

# 启动定时任务
pixivflow scheduler
```

### 源码安装方式

```bash
# 登录账号
npm run login

# 执行一次下载
npm run download

# 随机下载一个作品（快速体验）
npm run random

# 启动定时任务
npm run scheduler
```

---

## 📚 下一步

- 📖 查看 [配置指南](./CONFIG.md) 了解所有配置选项
- 🔐 查看 [登录指南](./LOGIN.md) 了解登录流程
- 📘 查看 [使用指南](./USAGE.md) 了解所有功能

---

## ❓ 遇到问题？

- 查看 [使用指南](./USAGE.md) 中的常见问题
- 查看 [登录指南](./LOGIN.md) 解决登录问题
- 报告问题：[GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues)

