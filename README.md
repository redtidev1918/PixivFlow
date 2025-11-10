# 🎨 PixivFlow

<div align="center">

**智能的 Pixiv 自动化下载工具 | Intelligent Pixiv Automation Downloader**

让 Pixiv 作品收集变得优雅而高效 | Make Pixiv artwork collection elegant and efficient

[![GitHub stars](https://img.shields.io/github/stars/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/network/members)
[![GitHub issues](https://img.shields.io/github/issues/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/issues)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow)
[![Maintenance](https://img.shields.io/badge/Maintained-yes-green.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow/graphs/commit-activity)

[快速开始](#-快速开始) • [功能特性](#-功能特性) • [文档](#-文档导航) • [脚本工具](#-脚本工具) • [使用场景](#-使用场景)

[English](README_EN.md) | [中文](#)

</div>

---

## 📑 目录

<details>
<summary><b>点击展开完整目录</b></summary>

<br>

**入门指南**
- [💡 什么是 PixivFlow？](#-什么是-pixivflow)
  - [🌟 为什么选择 PixivFlow？](#-为什么选择-pixivflow)
  - [🎯 核心理念](#-核心理念)
- [✨ 功能特性](#-功能特性)
  - [🚀 核心功能](#-核心功能)
  - [🎁 额外优势](#-额外优势)
- [🚀 快速开始](#-快速开始)
  - [📋 环境要求](#-环境要求)
  - [🎬 快速开始（推荐）](#-快速开始推荐)
  - [🎯 手动配置方式](#-手动配置方式)
  - [🌐 使用 WebUI（可选）](#-使用-webui可选)

**工具与文档**
- [🛠️ 脚本工具](#️-脚本工具)
  - [🎯 主控制脚本（最常用）](#-主控制脚本最常用)
  - [🔐 登录管理](#-登录管理)
  - [⚙️ 配置管理](#️-配置管理)
  - [📊 监控与维护](#-监控与维护)
  - [🚀 部署与备份](#-部署与备份)
  - [🐳 Docker 管理](#-docker-管理)
  - [🎨 高级 CLI 工具](#-高级-cli-工具)
- [📚 文档导航](#-文档导航)
  - [🌟 新手必读](#-新手必读)
  - [📘 进阶文档](#-进阶文档)
  - [📄 项目文档](#-项目文档)

**使用与配置**
- [🎯 使用场景](#-使用场景)
  - [场景一：每日自动收集灵感素材](#场景一每日自动收集灵感素材)
  - [场景二：服务器定时收集特定标签](#场景二服务器定时收集特定标签)
  - [场景三：快速体验](#场景三快速体验---随机下载)
  - [场景四：一次性批量下载](#场景四一次性批量下载)
- [📁 项目结构](#-项目结构)
- [⚙️ 核心配置](#️-核心配置)
  - [认证配置](#认证配置)
  - [下载目标](#下载目标)
  - [定时任务](#定时任务)
  - [存储配置](#存储配置)

**故障排除与进阶**
- [🐛 常见问题](#-常见问题)
  - [❓ 配置向导登录失败？](#-配置向导登录失败)
  - [❓ 认证失败或 Token 过期？](#-认证失败或-token-过期)
  - [❓ 找不到匹配的作品？](#-找不到匹配的作品)
  - [❓ 定时任务没有运行？](#-定时任务没有运行)
  - [❓ 下载速度慢或频繁失败？](#-下载速度慢或频繁失败)
  - [❓ 遇到已删除或私有的作品？](#-遇到已删除或私有的作品)
- [🔒 安全提示](#-安全提示)
- [📊 下载记录管理](#-下载记录管理)
- [🚀 进阶使用](#-进阶使用)
  - [部署到服务器](#部署到服务器)
  - [配置多个下载任务](#配置多个下载任务)
  - [使用代理](#使用代理)

**项目信息**
- [📄 开源许可](#-开源许可)
- [🙏 致谢](#-致谢)
- [📮 获取帮助](#-获取帮助)
- [📈 项目统计](#-项目统计)
- [🤝 贡献](#-贡献)
- [📝 更新日志](#-更新日志)
- [支持项目](#支持项目)

</details>

---

## 💡 什么是 PixivFlow？

**PixivFlow** 是一个**完全独立运行**的 Pixiv 作品批量下载工具，专为自动化设计。无需浏览器扩展，可在命令行或服务器上自动化运行，支持定时任务、智能去重、断点续传等功能。

### 🌟 为什么选择 PixivFlow？

与其他 Pixiv 下载工具相比，PixivFlow 专注于**自动化**和**服务器部署**场景：

| 优势 | 说明 |
|------|------|
| 🚀 **完全独立运行** | 无需浏览器扩展，纯命令行工具，可在任何环境运行（服务器、Docker、CI/CD） |
| 🤖 **真正的自动化** | 设置一次，永久运行。支持 Cron 定时任务，无需人工干预 |
| 🖥️ **服务器友好** | 专为服务器设计，支持后台运行、进程管理、日志轮转 |
| 🔐 **安全可靠** | 采用 OAuth 2.0 PKCE 标准流程，保障账号安全，避免密码泄露风险 |
| 📦 **轻量级部署** | 资源占用低，无需额外服务（如数据库、Redis），SQLite 即可 |
| 🛠️ **开箱即用** | 丰富的脚本工具和配置向导，3 步即可开始使用 |

### 🎯 核心理念

- **自动化优先**：设置一次，自动运行，无需人工干预
- **智能化管理**：自动去重、断点续传、错误重试
- **简单易用**：3 步开始使用，配置向导引导完成
- **开箱即用**：丰富的脚本工具，无需记忆复杂命令

---

## ✨ 功能特性

### 🚀 核心功能

| 功能 | 说明 |
|------|------|
| **📥 批量下载** | 支持插画和小说批量下载，可配置下载数量、筛选条件 |
| **🏷️ 标签搜索** | 按标签搜索作品，支持精确匹配、部分匹配等多种模式 |
| **🎲 随机下载** | 一键下载随机热门标签作品，快速体验工具功能 |
| **⏰ 定时任务** | Cron 表达式配置，支持每天、每周、每月定时自动下载 |
| **🔍 智能筛选** | 按收藏数、日期范围、作品类型等多维度筛选 |
| **🌐 语言检测** | 自动检测小说语言，支持按语言过滤（仅中文/仅非中文） |
| **💾 自动去重** | SQLite 数据库记录历史，自动跳过已下载作品 |
| **🔄 断点续传** | 下载中断后自动恢复，无需重新开始 |
| **🛡️ 错误处理** | 自动重试、错误恢复、智能跳过已删除/私有作品 |
| **🌐 WebUI 管理** | 现代化的 Web 管理界面，支持文件预览、实时日志、任务管理 |
| **📊 统计报告** | 详细的运行日志和下载统计报告 |

### 🎁 额外优势

- ✅ **完全独立**：无需浏览器，纯命令行工具
- ✅ **WebUI 支持**：提供现代化的 Web 管理界面，支持图形化操作
- ✅ **跨平台支持**：Windows / macOS / Linux 桌面应用（Electron），支持 Web 浏览器访问
- ✅ **轻量级**：资源占用低，适合服务器长期运行
- ✅ **开源免费**：GPL-3.0 许可证，可自由定制和分发
- ✅ **类型安全**：TypeScript 编写，类型提示完善
- ✅ **文档完善**：详细的中文文档和教程

---

## 🚀 快速开始

### 📋 环境要求

**必需环境**：
- Node.js 18+ 和 npm 9+
- 一个 Pixiv 账号

**登录功能**（首次登录需要）：
- Python 3.9+ 和 `gppt` 包（`pip install gppt`）
  - 用于登录获取 refresh token
  - 如果已有 refresh token 且未过期，则不需要重新登录

**Windows 用户**：
- ⚠️ **推荐使用 WSL**：本项目使用 bash 脚本，在 Windows 上推荐使用 WSL
  - 安装：在 PowerShell 中运行 `wsl --install`
  - 或使用 Git Bash：如果已安装 Git for Windows，可以使用 Git Bash 运行脚本

> 📖 **详细说明**：查看 [快速开始指南](docs/getting-started/QUICKSTART.md) 或 [新手完整指南](docs/getting-started/START_HERE.md)

### 🎬 快速开始（3 步完成）

```bash
# 1. 安装依赖
npm install

# 2. 登录账号
npm run login

# 3. 开始下载
npm run download
```

**或使用一键脚本**：

```bash
# 自动完成所有设置（登录、配置、测试）
./scripts/quick-start.sh
```

---

### 🌍 全局安装方式（推荐 ⭐）

如果你想在任何目录下都能使用 `pixivflow` 命令，可以全局安装：

#### 方法一：从本地目录全局安装

```bash
# 1. 克隆或下载项目
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 全局安装
npm install -g .
```

#### 方法二：从 GitHub 仓库直接安装

```bash
# 从 GitHub 仓库全局安装
npm install -g git+https://github.com/zoidberg-xgd/pixivflow.git

# 注意：安装后需要先构建
# 找到全局安装目录（通常在 npm root -g 的父目录/bin）
# 或重新安装并指定构建脚本
```

#### 验证全局安装

安装完成后，可以在任何目录使用 `pixivflow` 命令：

```bash
# 查看帮助
pixivflow --help

# 查看安装位置
which pixivflow

# 登录账号
pixivflow login

# 执行下载
pixivflow download

# 启动定时任务
pixivflow scheduler
```

#### 全局安装后的配置

全局安装后，配置文件位置：
- 配置文件：`~/.pixivflow/config/standalone.config.json`（如果使用默认路径）
- 或使用 `--config` 参数指定配置文件路径

```bash
# 使用自定义配置文件
pixivflow download --config /path/to/config.json

# 登录（会自动创建配置文件）
pixivflow login
```

#### 更新全局安装

如果需要更新全局安装的版本：

```bash
# 方法一：重新安装（从本地目录）
cd /path/to/pixivflow
npm run build
npm install -g .

# 方法二：从 GitHub 更新
npm install -g git+https://github.com/zoidberg-xgd/pixivflow.git
```

> **💡 提示**：
> - 全局安装后，可以在任何目录直接使用 `pixivflow` 命令
> - 首次使用需要运行 `pixivflow login` 进行登录
> - 配置文件会自动创建在用户主目录或项目目录

---

### 📖 详细步骤

如需详细的手动配置步骤，请查看：
- [⚡ 快速开始指南](docs/getting-started/QUICKSTART.md) - 3 分钟快速上手
- [📖 新手完整指南](docs/getting-started/START_HERE.md) - 从零开始的详细教程
- [🔐 登录指南](docs/guides/LOGIN_GUIDE.md) - 登录流程详解

---

### 🌐 使用 WebUI（可选）

PixivFlow 还提供了现代化的 Web 管理界面，支持图形化操作：

**开发模式（前后端分离）：**
```bash
# 1. 启动 WebUI 后端
npm run webui

# 2. 在另一个终端启动前端开发服务器
npm run webui:frontend
```

然后访问 http://localhost:5173 即可使用 WebUI（前端开发服务器）。

**生产模式（单服务器）：**
```bash
# 1. 构建前端
npm run webui:build

# 2. 启动 WebUI（自动提供前端静态文件）
STATIC_PATH=webui-frontend/dist npm run webui
```

然后访问 http://localhost:3000 即可使用 WebUI（后端服务器）。

**桌面应用（Electron）：**
```bash
# 1. 构建前端
cd webui-frontend
npm run build

# 2. 开发模式运行
npm run electron:dev

# 3. 构建桌面应用
npm run electron:build        # 构建所有平台
npm run electron:build:win    # 仅 Windows
npm run electron:build:mac    # 仅 macOS
npm run electron:build:linux  # 仅 Linux
```

构建完成后，安装包会在 `webui-frontend/release/` 目录下。

> **注意**：
> - 开发模式使用 Vite 开发服务器（端口 5173），生产模式使用 Express 服务器（端口 3000）
> - Docker 部署使用生产模式，前端静态文件已内置在镜像中，访问端口为 3000
> - Electron 桌面应用会自动启动后端服务器，无需手动启动
> - **平台支持**：当前仅支持 Windows / macOS / Linux 桌面应用，不支持移动端（iOS/Android）
> - 详细说明请查看 [WebUI 使用指南](docs/webui/WEBUI_README.md) 和 [Electron 桌面应用指南](docs/webui/ELECTRON_GUIDE.md)

**WebUI API 端点**：
- 根路径 `GET /` - 返回 API 信息（当未配置静态文件时）
- 健康检查 `GET /api/health` - 服务器健康状态
- 认证相关 `GET /api/auth/*` - 登录、登出、状态查询
- 配置管理 `GET /api/config` - 获取和更新配置
- 下载任务 `POST /api/download/*` - 启动、停止、查询下载任务
- 统计信息 `GET /api/stats/*` - 下载统计、标签统计、作者统计
- 日志查看 `GET /api/logs` - 获取日志，WebSocket 实时日志流
- 文件浏览 `GET /api/files/*` - 文件列表、预览、删除

**WebUI 功能**：
- 📊 下载统计和概览
- 📁 文件浏览和预览（支持日文、中文等特殊字符文件名）
- 📝 实时日志查看
- ⚙️ 配置管理
- 🎯 任务管理（启动/停止下载）
- 📈 下载历史查看

详细说明请查看 [WebUI 使用指南](docs/webui/WEBUI_README.md)。

---

### 🐳 使用 Docker（推荐）

PixivFlow 支持 Docker 部署，无需安装 Node.js 环境：

#### 快速开始

```bash
# 1. 准备配置文件
cp config/standalone.config.example.json config/standalone.config.json

# 2. 登录 Pixiv 账号（在主机上）
npm run login

# 3. 启动定时任务服务
docker-compose up -d pixivflow

# 或启动 WebUI 服务
docker-compose up -d pixivflow-webui

# 或同时启动两个服务
docker-compose up -d
```

#### 使用脚本工具

```bash
# 1. 初始化 Docker 环境
./scripts/pixiv.sh docker setup

# 2. 登录 Pixiv 账号
./scripts/pixiv.sh docker login

# 3. 构建并部署
./scripts/pixiv.sh docker deploy

# 4. 查看状态
./scripts/pixiv.sh docker status

# 5. 查看日志
./scripts/pixiv.sh docker logs -f
```

#### Docker 服务说明

`docker-compose.yml` 提供了两个服务：

1. **pixivflow** - 定时任务服务（默认）
   - 自动执行定时下载任务
   - 后台持续运行

2. **pixivflow-webui** - WebUI 管理界面（可选）
   - 提供现代化的 Web 管理界面
   - 访问地址：http://localhost:3000
   - 支持文件浏览、统计查看、任务管理等

#### Docker 常用命令

```bash
# 启动定时任务服务
docker-compose up -d pixivflow

# 启动 WebUI 服务
docker-compose up -d pixivflow-webui

# 同时启动两个服务
docker-compose up -d

# 查看日志
docker-compose logs -f pixivflow
docker-compose logs -f pixivflow-webui

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 重新构建镜像
docker-compose build
```

#### Docker 脚本命令

- `docker setup` - 初始化 Docker 环境
- `docker build` - 构建 Docker 镜像
- `docker deploy` - 部署服务（构建 + 启动）
- `docker up` - 启动服务
- `docker down` - 停止服务
- `docker status` - 查看服务状态
- `docker logs` - 查看日志
- `docker login` - 在容器中登录账号
- `docker random` - 随机下载作品（测试用）

详细说明请查看 [Docker 使用指南](docs/docker/DOCKER.md)。

**相关文档**：
- [Docker 使用指南](docs/docker/DOCKER.md) - 完整的 Docker 部署和使用说明

---

## 🛠️ 脚本工具

PixivFlow 提供了丰富的脚本工具，让你无需记忆复杂的 npm 命令。所有脚本都直接调用内置 CLI 功能，性能更好、响应更快。

> ⚠️ **重要说明：后端和脚本的完全独立性**
> 
> - **后端核心**：`src/index.ts` 是完全独立的 CLI 工具，可在任何环境运行（服务器、Docker、CI/CD）
> - **脚本工具**：所有脚本（`scripts/*.sh`）直接调用后端 CLI，完全独立于前端 WebUI
> - **WebUI 可选**：前端界面只是可选的辅助工具，所有核心功能都可以通过命令行完美运行
> - **无需前端**：即使不使用前端界面，所有功能（下载、登录、调度等）都可以通过命令行或脚本使用

### 🎯 主控脚本（最常用）

```bash
./scripts/pixiv.sh <command>
```

| 命令 | 说明 |
|------|------|
| `setup` | 交互式配置向导（首次必须运行） |
| `login` | 登录 Pixiv 账号（交互式，直接调用内置CLI） |
| `test` | 测试下载（下载少量作品验证配置） |
| `once` | 执行一次下载 |
| `random` | 随机下载一个热门标签作品（支持 `--novel` 下载小说） |
| `run` | 启动定时任务（后台持续运行） |
| `stop` | 停止运行的定时任务 |
| `status` | 查看当前运行状态 |
| `check` | 环境检查（支持 `--fix` 自动修复） ⭐ 新功能 |
| `update` | 一键更新和修复（更新代码、依赖、修复错误） ⭐ 新功能 |
| `health` | 健康检查（检查配置、网络等） |
| `logs` | 查看运行日志 |

**💡 提示**：
- 所有命令都直接调用内置 CLI，无需通过 npm scripts，响应更快
- 所有功能都可以在无前端环境下完美运行
- 后端是项目的核心，前端只是可选的辅助工具
- **新功能**：`check --fix` 和 `update` 命令支持自动修复常见问题

### 🔐 登录管理

```bash
# 方式1：使用主控脚本（推荐）
./scripts/pixiv.sh login

# 方式2：使用登录脚本（支持更多选项）
./scripts/login.sh

# 方式3：使用 npm 命令
npm run login
```

### ⚙️ 配置管理

```bash
# 交互式配置向导
./scripts/easy-setup.sh

# 配置文件管理
./scripts/config-manager.sh backup    # 备份配置
./scripts/config-manager.sh restore   # 恢复配置
./scripts/config-manager.sh validate  # 验证配置
./scripts/config-manager.sh edit      # 编辑配置

# 配置路径迁移（自动修复绝对路径，适用于项目迁移）
pixivflow migrate-config              # 执行迁移
pixivflow migrate-config --dry-run     # 预览更改
pixivflow migrate-config --json        # JSON 格式输出
# 或使用 npm 命令
npm run start migrate-config          # 执行迁移
npm run start migrate-config --dry-run # 预览更改
```

### 🔧 环境检查和自动修复 ⭐ 新功能

```bash
# 基础环境检查
./scripts/pixiv.sh check

# 自动修复环境问题（推荐 ⭐）
./scripts/pixiv.sh check --fix

# 一键更新和修复（更新代码、依赖、修复错误）
./scripts/pixiv.sh update

# 或使用别名
./scripts/pixiv.sh fix
```

**新功能说明**：
- ✅ `check --fix`：自动安装缺失依赖、创建配置、编译代码
- ✅ `update`：一键更新代码、依赖，并修复常见错误
- ✅ 智能检测：自动检测编译产物是否过时
- ✅ 统一错误处理：提供清晰的错误提示和修复建议

### 📊 监控和维护

```bash
# 自动监控（持续监控运行状态）
./scripts/auto-monitor.sh

# 自动维护（清理日志、优化数据库）
./scripts/auto-maintain.sh

# 详细健康检查
./scripts/health-check.sh
```

### 🚀 部署和备份

```bash
# 自动部署到服务器（原生模式）
./scripts/auto-deploy.sh

# Docker 模式部署（推荐）
./scripts/auto-deploy.sh production docker

# 自动备份配置和数据
./scripts/auto-backup.sh
```

### 🐳 Docker 管理

```bash
# 使用主控制脚本
./scripts/pixiv.sh docker <command>

# 或直接使用 Docker 脚本
./scripts/docker.sh <command>
```

**常用命令**：
- `docker setup` - 初始化 Docker 环境
- `docker build` - 构建镜像
- `docker deploy` - 部署服务
- `docker up` - 启动服务
- `docker down` - 停止服务
- `docker status` - 查看状态
- `docker logs` - 查看日志
- `docker login` - 登录账号
- `docker test` - 测试下载

详细说明请查看 [Docker 使用指南](docs/docker/DOCKER.md)。

**相关文档**：
- [Docker 使用指南](docs/docker/DOCKER.md) - 完整的 Docker 部署和使用说明（包含网络问题和随机下载问题的解决方案）

### 🎨 内置 CLI 命令

如果已全局安装或使用 `npm run build` 构建后，可以直接使用 `pixivflow` 命令：

```bash
# 查看所有可用命令
pixivflow --help

# 常用命令：
pixivflow login                    # 交互式登录（终端输入用户名密码）
pixivflow download                 # 执行一次下载
pixivflow random                   # 随机下载一个作品
pixivflow random --novel           # 随机下载一篇小说
pixivflow scheduler                # 启动定时任务
pixivflow normalize                # 整理和重组已下载的文件
pixivflow normalize --dry-run      # 预览整理操作（不实际执行）
pixivflow migrate-config           # 迁移配置路径（绝对路径转相对路径）
pixivflow migrate-config --dry-run # 预览迁移更改
```

**💡 提示**：
- 所有命令都支持 `--help` 查看详细用法
- 使用 `pixivflow` 命令比通过 npm scripts 更快（直接调用编译后的代码）
- 推荐使用 `./scripts/pixiv.sh` 作为主要入口（封装了常用操作）

详细说明：[脚本使用指南](docs/scripts/SCRIPTS_GUIDE.md)

---

## 📚 文档导航

### 🌟 新手必读（按顺序阅读）

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [⚡ QUICKSTART](docs/getting-started/QUICKSTART.md) | **3 分钟快速上手** - 最快开始使用 | ⭐⭐⭐⭐⭐ |
| [📖 START_HERE](docs/getting-started/START_HERE.md) | **新手完整指南** - 从零开始的详细教程 | ⭐⭐⭐⭐⭐ |
| [📚 TUTORIAL](docs/getting-started/TUTORIAL.md) | **完整教程** - 深入了解所有功能 | ⭐⭐⭐⭐ |
| [🔐 LOGIN_GUIDE](docs/guides/LOGIN_GUIDE.md) | **登录流程详解** - 登录问题解决方案 | ⭐⭐⭐⭐ |
| [🧪 TEST_GUIDE](docs/guides/TEST_GUIDE.md) | **测试和故障排除** - 验证安装和配置 | ⭐⭐⭐⭐ |

### 📘 功能指南

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [📋 CONFIG_GUIDE](docs/guides/CONFIG_GUIDE.md) | **配置文件使用指南** - 所有配置选项详解 | ⭐⭐⭐⭐⭐ |
| [⚙️ STANDALONE-SETUP-GUIDE](docs/guides/STANDALONE-SETUP-GUIDE.md) | **完整配置选项说明** - 高级配置参考 | ⭐⭐⭐⭐ |
| [📊 RANKING_DOWNLOAD_GUIDE](docs/guides/RANKING_DOWNLOAD_GUIDE.md) | **排行榜下载指南** - 下载排行榜作品 | ⭐⭐⭐⭐ |
| [🔄 CONFIG-PATH-MIGRATION](docs/guides/CONFIG-PATH-MIGRATION.md) | **配置路径迁移** - 项目迁移指南 | ⭐⭐⭐ |

### 🛠️ 工具和脚本

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [🛠️ SCRIPTS_GUIDE](docs/scripts/SCRIPTS_GUIDE.md) | **脚本使用指南** - 所有脚本详细说明 | ⭐⭐⭐⭐⭐ |

### 🌐 WebUI 和 Docker

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [🌐 WEBUI_README](docs/webui/WEBUI_README.md) | **WebUI 使用指南** - Web 管理界面和部署配置 | ⭐⭐⭐⭐ |
| [🖥️ ELECTRON_GUIDE](docs/webui/ELECTRON_GUIDE.md) | **Electron 桌面应用指南** - 桌面应用打包和使用 | ⭐⭐⭐⭐ |
| [🐳 DOCKER](docs/docker/DOCKER.md) | **Docker 使用指南** - Docker 部署和使用（包含常见问题解决方案） | ⭐⭐⭐⭐ |

### 📄 项目文档

| 文档 | 说明 |
|------|------|
| [📝 CHANGELOG](docs/project/CHANGELOG.md) | 版本更新日志 |
| [📝 CHANGELOG (EN)](docs/project/CHANGELOG_EN.md) | Version Changelog |
| [🤝 CONTRIBUTING](docs/project/CONTRIBUTING.md) | 贡献指南 |
| [🤝 CONTRIBUTING (EN)](docs/project/CONTRIBUTING_EN.md) | Contributing Guide |

---

## 🎯 使用场景

### 场景 1：每日自动收集灵感素材

**需求**：每天自动下载风景、插画类高质量作品作为设计素材

**配置示例**：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 50,
      "minBookmarks": 1000
    },
    {
      "type": "illustration",
      "tag": "イラスト",
      "limit": 30,
      "minBookmarks": 5000
    }
  ],
  "scheduler": {
    "enabled": true,
    "cron": "0 2 * * *"
  }
}
```

**运行方式**：

```bash
./scripts/pixiv.sh run
```

---

### 场景 2：服务器定时收集特定标签

**需求**：在服务器上每周收集特定标签的热门作品

**配置示例**：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 100,
      "searchTarget": "partial_match_for_tags"
    }
  ],
  "scheduler": {
    "enabled": true,
    "cron": "0 0 * * 0",
    "timezone": "Asia/Shanghai"
  }
}
```

**部署方式**：

```bash
# 使用自动部署脚本
./scripts/auto-deploy.sh

# 或使用 PM2 管理进程
pm2 start "npm run scheduler" --name pixivflow
```

---

### 场景 3：快速体验 - 随机下载

**需求**：快速体验工具，下载一个随机作品

**运行方式**：

```bash
# 随机下载插画（默认）
npm run random

# 随机下载小说
npm run random -- --novel
# 或
npm run random -- -n

# 明确指定下载插画
npm run random -- --illustration
# 或
npm run random -- -i

# 或使用主程序（如果全局安装了 pixivflow）
pixivflow random
pixivflow random --novel
```

**功能说明**：
- 🎲 **随机选择标签**：从热门标签中随机选择一个（插画：風景、イラスト、オリジナル等；小说：小説、オリジナル、ホラー等）
- 🔍 **随机选择作品**：从搜索结果中随机选择一个作品
- 🔐 **自动登录**：如果未登录，会自动引导登录
- 📥 **快速体验**：下载 1 个随机作品，快速了解工具功能
- 📚 **支持类型**：支持随机下载插画和小说两种类型

---

### 场景 4：一次性批量下载

**需求**：一次性下载指定标签的作品

**配置示例**：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "art",
      "limit": 500
    }
  ]
}
```

**运行方式**：

```bash
# 使用便捷脚本（推荐）
./scripts/pixiv.sh once

# 或使用 npm 命令
npm run download

# 或使用主程序（如果全局安装了 pixivflow）
pixivflow download
```

> **💡 提示**：所有下载任务都通过配置文件实现，无需修改源代码。详细说明请查看 [配置文件使用指南](docs/guides/CONFIG_GUIDE.md)。

---

## 📁 项目结构

```
pixivflow/
├── 📄 配置文件
│   ├── config/
│   │   ├── standalone.config.json           # 主配置（需自行创建）
│   │   └── standalone.config.example.json   # 配置模板
│
├── 💻 源代码
│   ├── src/
│   │   ├── index.ts                 # 主程序入口
│   │   ├── setup-wizard.ts          # 配置向导
│   │   ├── config.ts                # 配置管理
│   │   ├── logger.ts                # 日志系统
│   │   ├── pixiv/                   # Pixiv API
│   │   │   ├── AuthClient.ts        # 认证客户端
│   │   │   └── PixivClient.ts       # API 客户端
│   │   ├── download/                # 下载模块
│   │   │   ├── DownloadManager.ts   # 下载管理器
│   │   │   └── FileService.ts       # 文件服务
│   │   ├── storage/                 # 数据持久化
│   │   │   └── Database.ts          # SQLite 数据库
│   │   └── scheduler/               # 定时任务
│   │       └── Scheduler.ts         # 任务调度器
│
├── 🛠️ 脚本工具
│   ├── scripts/
│   │   ├── pixiv.sh                 # 主控制脚本（推荐）
│   │   ├── easy-setup.sh            # 配置向导（推荐）
│   │   ├── config-manager.sh        # 配置管理
│   │   ├── health-check.sh          # 健康检查
│   │   ├── auto-monitor.sh          # 自动监控
│   │   ├── auto-maintain.sh         # 自动维护
│   │   ├── auto-backup.sh           # 自动备份
│   │   └── auto-deploy.sh           # 自动部署
│
├── 📦 输出目录（自动创建）
│   ├── dist/                        # 编译输出
│   ├── downloads/                   # 下载目录
│   │   ├── illustrations/           # 插画
│   │   └── novels/                  # 小说
│   └── data/                        # 数据目录
│       ├── pixiv-downloader.db      # SQLite 数据库
│       ├── pixiv-downloader.log     # 运行日志
│       └── metadata/                # 元数据目录（自动创建）
│           └── *.json               # 作品元数据 JSON 文件
│
└── 📚 文档
    ├── README.md                    # 项目主文档
    └── docs/                        # 文档目录
        ├── getting-started/         # 入门指南
        │   ├── START_HERE.md        # 新手指南
        │   ├── QUICKSTART.md        # 快速开始
        │   └── TUTORIAL.md          # 完整教程
        ├── guides/                  # 使用指南
        │   ├── LOGIN_GUIDE.md       # 登录指南
        │   ├── CONFIG_GUIDE.md      # 配置指南
        │   ├── STANDALONE-SETUP-GUIDE.md  # 独立设置指南
        │   ├── RANKING_DOWNLOAD_GUIDE.md  # 排行榜下载指南
        │   └── TEST_GUIDE.md        # 测试指南
        ├── webui/                   # WebUI 文档
        ├── docker/                  # Docker 文档
        ├── scripts/                 # 脚本文档
        │   └── SCRIPTS_GUIDE.md     # 脚本指南
        └── project/               # 项目文档
            ├── CHANGELOG.md         # 更新日志
            └── CONTRIBUTING.md      # 贡献指南
```

---

## ⚙️ 核心配置

配置文件位于 `config/standalone.config.json`。以下是关键配置项说明：

### 认证配置

```json
{
  "pixiv": {
    "refreshToken": "your_refresh_token_here",
    "clientId": "MOBrBDS8blbauoSck0ZfDbtuzpyT",
    "clientSecret": "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj",
    "userAgent": "PixivAndroidApp/5.0.234 (Android 11; Pixel 6)"
  }
}
```

> ⚠️ `refreshToken` 通过配置向导自动获取，无需手动填写

### 下载目标

#### 基础配置

```json
{
  "targets": [
    {
      "type": "illustration",              // 类型: illustration 或 novel
      "tag": "風景",                       // 搜索标签（支持多个标签，用空格分隔）
      "limit": 20,                      // 下载数量限制
      "mode": "search"                     // 下载模式: search（搜索）或 ranking（排行榜）
    }
  ]
}
```

#### 常用配置选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `type` | 内容类型 | `"illustration"` 或 `"novel"` |
| `tag` | 搜索标签（支持多标签，空格分隔） | `"原神"` 或 `"明日方舟 アークナイツ"` |
| `limit` | 下载数量限制 | `20` |
| `mode` | 下载模式 | `"search"`（搜索）或 `"ranking"`（排行榜） |
| `searchTarget` | 搜索范围 | `"partial_match_for_tags"`（部分匹配）<br>`"exact_match_for_tags"`（精确匹配） |
| `sort` | 排序方式 | `"date_desc"`（最新）<br>`"popular_desc"`（最受欢迎）<br>`"date_asc"`（最旧） |
| `minBookmarks` | 最低收藏数 | `500` |
| `startDate` / `endDate` | 日期范围 | `"2024-01-01"`<br>**注意**：使用 `date_desc` 排序时，遇到晚于 `endDate` 的作品会跳过但继续搜索，遇到早于 `startDate` 的作品会停止搜索 |
| `random` | 随机选择 | `true` |
| `seriesId` | 小说系列ID | `14690617`（仅 `type="novel"`） |
| `novelId` | 单篇小说ID | `26132156`（仅 `type="novel"`） |
| `languageFilter` | 语言过滤 | `"chinese"`（仅中文）<br>`"non-chinese"`（仅非中文）<br>不设置则下载所有语言（仅 `type="novel"`） |
| `detectLanguage` | 启用语言检测 | `true`（默认）或 `false`（仅 `type="novel"`） |

#### 配置示例

**示例 1：多标签搜索**
```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "明日方舟 アークナイツ アーミヤ",
      "limit": 30,
      "mode": "search",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

**示例 2：按收藏数筛选**
```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 50,
      "mode": "search",
      "minBookmarks": 1000,
      "sort": "popular_desc"
    }
  ]
}
```

**示例 3：排行榜下载**
```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "ranking",
      "limit": 10,
      "mode": "ranking",
      "rankingMode": "day",
      "rankingDate": "YESTERDAY"
    }
  ]
}
```

**示例 4：小说系列下载**
```json
{
  "targets": [
    {
      "type": "novel",
      "seriesId": 14690617,
      "limit": 50
    }
  ]
}
```

**示例 5：语言过滤（仅下载中文小说）**
```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "原神",
      "limit": 20,
      "languageFilter": "chinese",
      "detectLanguage": true
    }
  ]
}
```

**示例 6：语言过滤（仅下载非中文小说）**
```json
{
  "targets": [
    {
      "type": "novel",
      "tag": "アークナイツ",
      "limit": 20,
      "languageFilter": "non-chinese",
      "detectLanguage": true
    }
  ]
}
```

**💡 语言检测功能说明**：
- `languageFilter`：设置语言过滤规则
  - `"chinese"`：仅下载中文小说（支持简体、繁体、粤语、吴语等中文变体）
  - `"non-chinese"`：仅下载非中文小说（如日文、英文等）
  - 不设置：下载所有语言的小说
- `detectLanguage`：是否启用语言检测（默认：`true`）
  - `true`：检测并记录语言信息，保存到元数据文件
  - `false`：不进行语言检测
- **注意**：语言检测需要至少 50 个字符的文本内容。文本太短的小说无法可靠检测，默认会被下载（避免误判）
- 检测到的语言信息会保存到 JSON 元数据文件中，并在下载的文本文件头部显示

**💡 多标签搜索**：
- 在 `tag` 字段中用**空格分隔多个标签**，表示作品必须**同时包含**所有这些标签（AND关系）
- 例如：`"tag": "明日方舟 アークナイツ 角色名"` 会搜索同时包含这三个标签的作品
- 支持中文、日文、英文标签混合使用

**📚 完整配置指南**：查看 [配置文件使用指南](docs/guides/CONFIG_GUIDE.md) 了解所有配置选项和详细示例

### 定时任务

```json
{
  "scheduler": {
    "enabled": true,                      // 是否启用
    "cron": "0 3 * * *",                 // Cron 表达式
    "timezone": "Asia/Shanghai"           // 时区
  }
}
```

#### Cron 表达式速查

| 表达式 | 说明 |
|--------|------|
| `0 * * * *` | 每小时执行 |
| `0 */6 * * *` | 每 6 小时执行 |
| `0 2 * * *` | 每天 2:00 执行 |
| `0 0 * * 0` | 每周日 0:00 执行 |
| `0 0 1 * *` | 每月 1 号 0:00 执行 |

### 存储配置

```json
{
  "storage": {
    "databasePath": "./data/pixiv-downloader.db",
    "downloadDirectory": "./downloads",
    "illustrationDirectory": "./downloads/illustrations",
    "novelDirectory": "./downloads/novels",
    "illustrationOrganization": "byAuthorAndTag",
    "novelOrganization": "byDateAndAuthor"
  }
}
```

> **💡 路径迁移提示**：
> - 配置文件中的路径支持**自动修复**：项目启动时会自动检测并修复路径问题
> - **绝对路径转相对路径**：如果配置中的绝对路径位于项目根目录内，会自动转换为相对路径
> - **路径不存在修复**：如果配置的路径不存在，会尝试使用默认路径
> - **手动迁移**：使用 `npm run start migrate-config` 可以手动迁移配置路径
> - 详细说明请查看 [配置路径迁移指南](docs/guides/CONFIG-PATH-MIGRATION.md)

#### 目录组织方式

| 模式 | 说明 | 目录结构示例 |
|------|------|-------------|
| `flat` | 扁平结构（默认） | `illustrations/123456_标题_1.jpg` |
| `byAuthor` | 按作者组织 | `illustrations/作者名/123456_标题_1.jpg` |
| `byTag` | 按标签组织 | `illustrations/标签名/123456_标题_1.jpg` |
| `byDate` | 按日期组织（YYYY-MM） | `illustrations/2024-12/illustrations/123456_标题_1.jpg` |
| `byDay` | 按日组织（YYYY-MM-DD） | `illustrations/2024-12-25/illustrations/123456_标题_1.jpg` |
| `byAuthorAndTag` | 按作者和标签 | `illustrations/作者名/标签名/123456_标题_1.jpg` |
| `byDateAndAuthor` | 按日期和作者 | `illustrations/2024-12/作者名/123456_标题_1.jpg` |
| `byDayAndAuthor` | 按日和作者 | `illustrations/2024-12-25/作者名/123456_标题_1.jpg` |

> 💡 **提示**：
> - 使用组织模式可以让下载的文件更有条理，便于管理和查找
> - 使用 `byDate` 或 `byDay` 模式时，会在日期文件夹下自动创建 `novels` 和 `illustrations` 子文件夹，分别存放小说和图片
> - 例如：`{baseDir}/2024-12-25/novels/` 和 `{baseDir}/2024-12-25/illustrations/`

**完整配置说明**：查看 [配置指南](docs/guides/STANDALONE-SETUP-GUIDE.md) 和 [配置文件使用指南](docs/guides/CONFIG_GUIDE.md)

---

## 🐛 常见问题

### ❓ 配置向导登录失败？

**症状**：运行 `npm run setup` 后登录失败

**解决方法**：
1. 确认在终端正确输入了 Pixiv 用户名和密码
2. 检查网络连接和代理设置
3. 重新运行配置向导：`npm run setup`

---

### ❓ 认证失败或 Token 过期？

**症状**：下载时提示 "认证失败" 或 "401 Unauthorized"

**解决方法**：

```bash
# 方法 1：使用登录脚本（推荐，最简单）
npm run login

# 方法 2：重新运行配置向导
./scripts/easy-setup.sh
# 或
npm run setup
```

---

### ❓ 找不到匹配的作品？

**症状**：搜索结果为空或下载数量为 0

**可能原因**：
- 标签拼写错误或不存在
- 筛选条件过于严格
- 网络连接问题

**解决方法**：
1. 尝试常见标签：`イラスト`、`風景`、`art`
2. 降低 `minBookmarks` 值
3. 检查网络连接和防火墙设置
4. 在 Pixiv 网站上搜索确认标签存在

---

### ❓ 定时任务没有运行？

**症状**：设置了定时任务但没有自动下载

**解决方法**：

```bash
# 1. 检查配置
./scripts/config-manager.sh validate

# 2. 查看运行状态
./scripts/pixiv.sh status

# 3. 检查日志
./scripts/pixiv.sh logs

# 4. 确保程序持续运行
# 使用 PM2 管理进程
pm2 start "npm run scheduler" --name pixivflow
pm2 save
pm2 startup
```

---

### ❓ 下载速度慢或经常失败？

**可能原因**：网络连接不稳定或 Pixiv 服务器限流

**解决方法**：
1. 检查网络连接
2. 在配置文件中调整下载设置：
   - 减少 `download.concurrency`（例如设置为 1-2）
   - 增加 `download.requestDelay`（例如 1000-2000ms）
   - 保持 `download.dynamicConcurrency: true`（默认启用），系统会自动检测速率限制并调整并发数
3. 增加重试次数和超时时间
4. 使用代理服务器（如果需要）

**提示**：PixivFlow 内置了智能的动态并发控制功能。当检测到速率限制（429 错误）时，系统会自动降低并发数，并在成功请求后逐步恢复。这大大减少了手动调整的需要。

---

### ❓ 遇到已删除或私有的作品？

**症状**：下载过程中提示某些作品无法下载

**说明**：
PixivFlow 内置了完善的错误处理机制，会自动处理以下情况：

- ✅ **自动跳过已删除作品**：如果作品已被作者删除，会自动跳过并继续下载其他作品
- ✅ **自动跳过私有作品**：如果作品设置为私有或需要特殊权限，会自动跳过
- ✅ **自动跳过无法访问的作品**：如果作品因其他原因无法访问（如 404 错误），会自动跳过
- ✅ **记录跳过数量**：在下载完成后会显示跳过的作品数量
- ✅ **不会中断流程**：单个作品下载失败不会影响整个下载任务

**日志示例**：

```
[INFO] Skipped 3 novel(s) (deleted, private, or inaccessible)
[INFO] Illustration tag 風景 completed, { downloaded: 47 }
```

**说明**：
- 404 错误会使用 `debug` 级别日志（静默跳过）
- 其他错误会使用 `warn` 级别日志（记录但继续）
- 所有跳过的作品数量会在任务结束时统一显示

---

### 🔍 查看详细日志

```bash
# 查看运行日志
./scripts/pixiv.sh logs

# 或直接查看日志文件
tail -f data/pixiv-downloader.log
```

---

## 🔒 安全提示

> ⚠️ **重要**：配置文件包含敏感信息，请务必注意安全

### 🛡️ 安全建议

| 建议 | 说明 |
|------|------|
| ✅ **不要分享配置文件** | `config/standalone.config.json` 包含敏感认证信息 |
| ✅ **不要提交到 Git** | 确保配置文件在 `.gitignore` 中（已默认排除） |
| ✅ **定期备份** | 使用 `./scripts/auto-backup.sh` 备份配置和数据 |
| ✅ **使用强密码** | 保护你的 Pixiv 账号 |
| ✅ **HTTPS 加密** | 所有 API 请求均通过 HTTPS 安全传输 |
| ✅ **定期更新 Token** | 定期重新运行配置向导更新认证信息 |

### 🔐 关于 refresh_token

`refresh_token` 等同于你的账号密码，拥有它即可访问你的 Pixiv 账户。

**如果 refresh_token 泄露：**
1. 立即在 Pixiv 账户设置中撤销授权
2. 修改 Pixiv 账户密码
3. 重新运行配置向导获取新的 token

---

## 📊 下载记录管理

所有下载记录保存在 SQLite 数据库中（`data/pixiv-downloader.db`），包括：

- 作品 ID、标题、作者信息
- 下载时间、文件路径
- 作品统计（浏览量、收藏数等）

### 查看下载记录

```bash
# 使用 SQLite 命令行工具
sqlite3 data/pixiv-downloader.db "SELECT * FROM downloaded_artworks LIMIT 10;"

# 或使用图形界面工具
# - DB Browser for SQLite
# - SQLiteStudio
```

### 清理下载记录

```bash
# 使用维护脚本（推荐）
./scripts/auto-maintain.sh

# 或手动删除数据库（会重新下载所有作品）
rm data/pixiv-downloader.db
```

---

## 🚀 进阶使用

### 在服务器上部署

#### 方式 1：使用 Docker（推荐 ⭐）

```bash
# Docker 模式部署
./scripts/auto-deploy.sh production docker

# 或使用 Docker 管理脚本
./scripts/pixiv.sh docker deploy
```

#### 方式 2：使用自动部署脚本（原生模式）

```bash
./scripts/auto-deploy.sh
```

#### 方式 3：使用 PM2 管理

```bash
# 安装 PM2
npm install -g pm2

# 启动定时任务
pm2 start "npm run scheduler" --name pixivflow

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

#### 方式 4：使用 systemd

创建服务文件 `/etc/systemd/system/pixivflow.service`：

```ini
[Unit]
Description=PixivFlow Automation Downloader
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/pixivflow
ExecStart=/usr/bin/node dist/index.js scheduler
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl enable pixivflow
sudo systemctl start pixivflow
sudo systemctl status pixivflow
```

---

### 配置多个下载任务

可以在 `targets` 数组中添加多个目标：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 50
    },
    {
      "type": "illustration",
      "tag": "イラスト",
      "limit": 30,
      "minBookmarks": 1000
    },
    {
      "type": "novel",
      "tag": "小説",
      "limit": 10
    }
  ]
}
```

---

### 使用代理

如果需要通过代理访问 Pixiv，有两种方式：

#### 方式 1：使用环境变量（推荐 ⭐）

程序会自动从环境变量读取代理配置，无需修改配置文件：

```bash
# 设置代理环境变量（优先级：all_proxy > https_proxy > http_proxy）
export all_proxy=socks5://127.0.0.1:6153
# 或
export https_proxy=http://127.0.0.1:6152
# 或
export http_proxy=http://127.0.0.1:6152

# 然后运行程序
npm run download
```

**支持的代理协议**：
- `http://` - HTTP 代理
- `https://` - HTTPS 代理
- `socks5://` - SOCKS5 代理
- `socks4://` - SOCKS4 代理

**环境变量优先级**：
1. `all_proxy` 或 `ALL_PROXY`（最高优先级）
2. `https_proxy` 或 `HTTPS_PROXY`
3. `http_proxy` 或 `HTTP_PROXY`

#### 方式 2：配置文件设置

```json
{
  "network": {
    "proxy": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 7890,
      "protocol": "http"
    }
  }
}
```

**注意**：如果配置文件中已启用代理，环境变量不会覆盖配置文件中的设置。

---

## 📄 开源许可

本项目采用 [GPL-3.0-or-later](LICENSE) 许可证开源。

**这意味着：**
- ✅ 可以自由使用、修改和分发
- ✅ 修改后的代码也必须开源
- ✅ 需要保留原作者信息和许可证声明

---

## 🙏 致谢

### 灵感来源

- [PixivBatchDownloader](https://github.com/xuejianxianzun/PixivBatchDownloader) - 浏览器扩展版本
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) - OAuth 认证实现参考

### 感谢所有贡献者 🎉

---

## 📮 获取帮助

遇到问题？这里有多种方式获取帮助：

| 类型 | 渠道 | 说明 |
|------|------|------|
| 🐛 **Bug 反馈** | [GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues) | 报告问题和错误 |
| 💡 **功能建议** | [GitHub Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | 提出新功能想法 |
| 📖 **使用问题** | [查看文档](./START_HERE.md) | 查阅完整文档 |
| ✅ **环境检查** | `./scripts/pixiv.sh health` | 运行健康检查 |
| 💬 **社区交流** | [Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | 与其他用户交流 |
| 📚 **完整教程** | [TUTORIAL.md](./TUTORIAL.md) | 详细使用教程 |
| 🔍 **常见问题** | [常见问题](#-常见问题) | 查看常见问题解答 |

### 搜索关键词

如果你在寻找类似工具，这些关键词可能对你有帮助：

- `pixiv downloader` - Pixiv 下载器
- `pixiv batch download` - Pixiv 批量下载
- `pixiv automation` - Pixiv 自动化
- `pixiv cli` - Pixiv 命令行工具
- `pixiv api` - Pixiv API 客户端
- `pixiv scheduler` - Pixiv 定时任务
- `pixiv artwork downloader` - Pixiv 作品下载器
- `pixiv novel downloader` - Pixiv 小说下载器

### 提问前请先：

1. 🔍 查看 [常见问题](#-常见问题) 章节
2. 📖 阅读相关文档
3. ✅ 运行健康检查 `./scripts/health-check.sh`
4. 📋 查看运行日志 `./scripts/pixiv.sh logs`

---

## 📈 项目统计

<div align="center">

### 项目数据

![GitHub repo size](https://img.shields.io/github/repo-size/zoidberg-xgd/pixivflow?style=flat-square)
![GitHub language count](https://img.shields.io/github/languages/count/zoidberg-xgd/pixivflow?style=flat-square)
![GitHub top language](https://img.shields.io/github/languages/top/zoidberg-xgd/pixivflow?style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/zoidberg-xgd/pixivflow?style=flat-square)

</div>

### 性能指标

- ⚡ **启动速度**：< 2 秒
- 📦 **包大小**：< 5 MB（不含依赖）
- 💾 **内存占用**：< 100 MB（运行时）
- 🔄 **下载速度**：支持并发下载，智能限流和动态并发调整
- 📊 **数据库**：SQLite，轻量级，无需额外服务

---

## 🤝 贡献

我们欢迎所有形式的贡献！无论是报告 Bug、提出功能建议，还是提交代码，都非常感谢。

### 如何贡献

1. **Fork 项目**
2. **创建特性分支** (`git checkout -b feature/AmazingFeature`)
3. **提交更改** (`git commit -m 'Add some AmazingFeature'`)
4. **推送到分支** (`git push origin feature/AmazingFeature`)
5. **开启 Pull Request**

### 贡献指南

详细的贡献指南请查看 [CONTRIBUTING.md](docs/project/CONTRIBUTING.md)，包含：
- 行为准则
- 开发环境设置
- 代码规范
- 提交规范
- Pull Request 流程

---

## 📝 更新日志

查看 [CHANGELOG.md](docs/project/CHANGELOG.md) 了解详细的版本更新记录。

---

## 支持项目

如果这个项目对你有帮助，请考虑：

- ⭐ **给项目一个 Star** - 让更多人发现这个项目
- 🍴 **Fork 项目** - 创建你自己的版本
- 🐛 **报告 Bug** - 帮助我们改进
- 💡 **提出建议** - 分享你的想法
- 📢 **分享给更多人** - 让更多人受益
- 💻 **贡献代码** - 参与项目开发

<div align="center">

### ⭐ Star 这个项目

**[⭐ Star on GitHub](https://github.com/zoidberg-xgd/pixivflow)** - 让更多人发现 PixivFlow！

---

Made with ❤️ by [zoidberg-xgd](https://github.com/zoidberg-xgd)

**PixivFlow** - 让 Pixiv 作品收集变得优雅而高效

[⬆ 回到顶部](#-pixivflow)

</div>
