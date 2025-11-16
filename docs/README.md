# 📚 PixivFlow 文档中心

智能的 Pixiv 自动化下载工具 | Intelligent Pixiv Automation Downloader

让 Pixiv 作品收集变得优雅而高效 | Make Pixiv artwork collection elegant and efficient

---

## 📑 文档导航

### 🌟 新手必读（按顺序阅读）

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [⚡ 快速开始指南](./QUICKSTART.md) | **3 分钟快速上手** - 最快开始使用 | ⭐⭐⭐⭐⭐ |
| [🔐 登录指南](./LOGIN.md) | **登录流程详解** - 登录问题解决方案 | ⭐⭐⭐⭐ |
| [📖 使用指南](./USAGE.md) | **功能使用说明** - 完整功能介绍 | ⭐⭐⭐⭐ |

### 📘 功能指南

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [📋 配置指南](./CONFIG.md) | **配置文件使用指南** - 所有配置选项详解 | ⭐⭐⭐⭐⭐ |
| [🛠️ 脚本指南](./SCRIPTS.md) | **脚本使用指南** - 所有脚本详细说明 | ⭐⭐⭐⭐⭐ |
| [🏗️ 架构文档](./ARCHITECTURE.md) | **项目架构说明** - 架构设计和 API 说明 | ⭐⭐⭐⭐ |
| [📡 API 文档](./API.md) | **API 接口文档** - 完整的 RESTful API 说明 | ⭐⭐⭐⭐ |

### 🐳 部署与运维

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [🐳 Docker 指南](./DOCKER.md) | **Docker 使用指南** - Docker 部署和使用（包含常见问题解决方案） | ⭐⭐⭐⭐ |
| [📱 Termux 安装指南](./TERMUX_INSTALL.md) | **Termux/Android 安装指南** - Android 设备上的安装和使用 | ⭐⭐⭐ |

### 📄 项目文档

| 文档 | 说明 |
|------|------|
| [📝 更新日志](./project/CHANGELOG.md) | 版本更新记录 |
| [🤝 贡献指南](./project/CONTRIBUTING.md) | 参与项目开发 |

---

## 💡 什么是 PixivFlow？

PixivFlow 是一个**完全独立运行**的 Pixiv 作品批量下载工具，专为自动化设计。

### 核心特点

- 🚀 **完全独立**：无需浏览器扩展，纯命令行工具
- 🤖 **自动化**：支持定时任务，设置一次永久运行
- 🖥️ **服务器友好**：专为服务器设计，支持后台运行
- 🔐 **安全可靠**：OAuth 2.0 PKCE 标准流程
- 📦 **轻量级**：资源占用低，SQLite 数据库
- 📡 **API 服务器**：提供 RESTful API，可与前端集成

### 主要功能

- 📥 批量下载插画和小说
- 🏷️ 标签搜索和筛选
- ⏰ 定时任务（Cron）
- 💾 自动去重
- 🔄 断点续传
- 📡 RESTful API 和 WebSocket
- 🎨 CLI 命令行工具

---

## 🚀 快速开始

### 环境要求

- Node.js 18+ 和 npm 9+
- Pixiv 账号

> 💡 **提示**：项目默认使用 `pixiv-token-getter`（Node.js 库）进行登录，**不需要 Python**。Python gppt 仅作为后备方案（可选）。

### 3 步开始使用

**方式 1：从 npm 安装（推荐 ⭐）**

```bash
# 1. 全局安装
npm install -g pixivflow

# 2. 登录账号
pixivflow login

# 3. 开始下载
pixivflow download
```

**方式 2：从源码安装**

```bash
# 1. 安装依赖
npm install

# 2. 登录账号
npm run login

# 3. 开始下载
npm run download
```

详细说明请查看 [快速开始指南](./QUICKSTART.md)。

---

## 📖 文档结构说明

所有文档都在 `docs/` 目录下，按功能分类组织：

### 📁 目录结构

```
docs/
├── README.md              # 文档索引（本文件）
├── QUICKSTART.md          # 快速开始指南
├── LOGIN.md               # 登录指南
├── USAGE.md               # 使用指南
├── CONFIG.md              # 配置指南
├── SCRIPTS.md             # 脚本指南
├── ARCHITECTURE.md        # 架构文档
├── DOCKER.md              # Docker 指南
├── TERMUX_INSTALL.md      # Termux 安装指南
└── project/               # 项目文档
    ├── CHANGELOG.md       # 更新日志
    └── CONTRIBUTING.md    # 贡献指南
```

### 📚 文档分类

- **快速开始**：适合首次使用的用户，提供快速上手指南
- **使用指南**：详细的功能说明和配置选项，帮助深入使用
- **部署与运维**：Docker 和 Termux 相关，适合部署和运维
- **项目文档**：开发相关文档，适合贡献者和开发者

---

## 🎯 推荐阅读路径

### 路径 1：快速体验（5 分钟）

1. [快速开始指南](./QUICKSTART.md) - 快速上手
2. [使用指南](./USAGE.md) - 了解基本功能

### 路径 2：完整学习（30 分钟）

1. [快速开始指南](./QUICKSTART.md) - 快速上手
2. [登录指南](./LOGIN.md) - 了解登录流程
3. [使用指南](./USAGE.md) - 了解所有功能
4. [配置指南](./CONFIG.md) - 深入配置选项
5. [脚本指南](./SCRIPTS.md) - 使用脚本工具

### 路径 3：部署运维（20 分钟）

1. [Docker 指南](./DOCKER.md) - Docker 部署
2. [架构文档](./ARCHITECTURE.md) - 了解架构和 API
3. [脚本指南](./SCRIPTS.md) - 运维脚本

### 路径 4：参与开发

1. [贡献指南](./project/CONTRIBUTING.md) - 了解如何贡献
2. [更新日志](./project/CHANGELOG.md) - 了解项目历史
3. [架构文档](./ARCHITECTURE.md) - 了解项目架构

---

## 🆘 获取帮助

- 📖 查看 [快速开始指南](./QUICKSTART.md) - 解决常见问题
- 🐛 报告问题：[GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues)
- 💬 社区讨论：[GitHub Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions)

---

## 🔗 相关链接

- [主项目 README](../README.md) - 返回主项目页面
- [GitHub 仓库](https://github.com/zoidberg-xgd/pixivflow) - 查看源代码
- [GitHub Releases](https://github.com/zoidberg-xgd/pixivflow/releases) - 查看版本发布
- [前端项目](https://github.com/zoidberg-xgd/pixivflow-webui) - 前端独立仓库

---

Made with ❤️ by [zoidberg-xgd](https://github.com/zoidberg-xgd)
