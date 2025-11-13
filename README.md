# 🎨 PixivFlow

<div align="center">

**智能的 Pixiv 自动化下载工具 | Intelligent Pixiv Automation Downloader**

让 Pixiv 作品收集变得优雅而高效 | Make Pixiv artwork collection elegant and efficient

[![GitHub stars](https://img.shields.io/github/stars/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/network/members)
[![GitHub issues](https://img.shields.io/github/issues/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/issues)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow)
[![Maintenance](https://img.shields.io/badge/Maintained-yes-green.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow/graphs/commit-activity)

[快速开始](#-快速开始) • [功能特性](#-功能特性) • [CLI 命令](#-cli-命令行工具) • [脚本工具](#-脚本工具) • [使用场景](#-使用场景)

[English](README_EN.md) | [中文](README.md)

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
- [🎨 CLI 命令行工具](#-cli-命令行工具)
  - [🚀 核心命令](#-核心命令)
  - [⚙️ 配置管理](#️-配置管理-1)
  - [📊 监控与维护](#-监控与维护-1)
- [🛠️ 脚本工具](#️-脚本工具)
  - [🎯 主控制脚本（最常用）](#-主控制脚本最常用)
  - [🔐 登录管理](#-登录管理)
  - [🐳 Docker 管理](#-docker-管理)
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

- **Node.js 18+** 和 **npm 9+**（推荐使用 LTS 版本：18.x, 20.x, 22.x 或 24.x）
- **Pixiv 账号**
- **Windows 用户**：推荐使用 WSL（`wsl --install`）或 Git Bash
- **Android/Termux 用户**：需要安装构建工具，详见 [Termux 安装指南](docs/TERMUX_INSTALL.md)

> ⚠️ **Node.js 版本说明**：
> - 推荐使用 **LTS（长期支持）版本**：18.x, 20.x, 22.x 或 24.x
> - 避免使用奇数版本（如 19.x, 21.x, 23.x），这些版本可能不被所有依赖包支持
> - 如果看到 `EBADENGINE` 警告，建议切换到 LTS 版本
> 
> 💡 **登录说明**：项目默认使用 Node.js 库进行登录，**无需 Python**。Python gppt 仅作为后备方案（可选）。  
> 📖 **详细指南**：查看 [快速开始指南](docs/QUICKSTART.md)

### 🎬 快速安装（推荐 ⭐）

#### 方式 1：从 npm 安装（最简单）

```bash
# 全局安装
npm install -g pixivflow

# 验证安装
pixivflow --help

# 登录账号
pixivflow login

# 开始下载
pixivflow download
```

#### 方式 2：从源码安装

```bash
# 1. 克隆仓库
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 2. 安装依赖
npm install

# 3. 登录账号
npm run login

# 4. 开始下载
npm run download
```

**或使用一键脚本**（自动完成所有设置）：

```bash
./scripts/quick-start.sh
```

---

### 📦 安装方式说明

#### 从 npm 安装（推荐 ⭐）

最简单的方式，直接使用 npm 全局安装：

```bash
npm install -g pixivflow
```

安装后即可在任何目录使用 `pixivflow` 命令。

#### 从源码安装

适合需要自定义或开发的情况：

```bash
# 从本地目录全局安装
npm install && npm run build && npm install -g .

# 或从 GitHub 安装
npm install -g git+https://github.com/zoidberg-xgd/pixivflow.git
```

**使用命令**（全局安装后）：

```bash
pixivflow login      # 登录
pixivflow download   # 下载
pixivflow scheduler  # 定时任务
pixivflow random     # 随机下载
```

**使用命令**（源码安装，未全局安装）：

```bash
npm run login        # 登录
npm run download     # 下载
npm run scheduler    # 定时任务
npm run random       # 随机下载
```

> 💡 **提示**：
> - 配置文件位于 `~/.pixivflow/config/standalone.config.json`，或使用 `--config` 指定路径
> - 首次使用需要运行 `pixivflow login` 进行登录
> - npm 包地址：https://www.npmjs.com/package/pixivflow

---

### 🌐 WebUI 管理界面（可选）

PixivFlow 还提供了现代化的 Web 管理界面，支持图形化操作：

**启动方式**：

#### 全局安装后使用

```bash
# 方式 1：自动构建并启动（推荐 ⭐）
# 首先需要克隆源码仓库（如果还没有）
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 首次使用需要安装后端依赖（如果还没有安装）
npm install

# 从项目根目录启动 WebUI（会自动检测并安装前端依赖、构建前端）
pixivflow webui                    # 访问 http://localhost:3000

# 方式 2：手动构建前端（可选）
# 如果自动构建失败，可以手动构建
cd webui-frontend
npm install                        # 安装前端依赖
npm run build                      # 构建前端
cd ..
pixivflow webui                    # 启动 WebUI

# 方式 3：手动指定前端静态文件路径
# 如果前端已经构建在其他位置，可以直接指定路径
pixivflow webui --static-path /path/to/webui-frontend/dist
# 或使用环境变量
STATIC_PATH=/path/to/webui-frontend/dist pixivflow webui

# 方式 4：仅启动后端 API（自动回退）
# 如果找不到前端或构建失败，服务器会自动仅提供 API 服务
pixivflow webui                    # 访问 http://localhost:3000（仅 API，无前端界面）
```

> 💡 **提示**：
> - 全局安装后，`npm install -g pixivflow` 安装的包通常不包含前端源码。要使用完整的 WebUI，需要单独克隆源码仓库到本地。
> - **推荐从项目根目录运行**：`pixivflow webui` 会优先从当前工作目录查找项目，如果检测到前端未构建，会自动安装前端依赖并构建前端（首次构建需要一些时间）。
> - 如果自动构建失败，请手动执行：`cd webui-frontend && npm install && npm run build`
> - 即使找不到前端，服务器仍会启动并提供 API 服务，可以通过 API 接口进行管理。

#### 源码安装使用

```bash
# 首次使用：安装依赖
npm install                # 安装后端依赖
cd webui-frontend
npm install                # 安装前端依赖
cd ..

# 开发模式（推荐：一键启动）
npm run dev                # 推荐：一键启动开发环境，支持热重载\n# - 自动协调前端和后端开发服务器端口（详见 `src/webui/ports.ts`）\n# - 注意：此命令会自动清理所需端口，避免冲突。

# 开发模式（手动启动，前后端分离）
# 注意：此方式需要确保前后端端口匹配，不推荐
npm run webui              # 启动后端（默认端口详见 `src/webui/ports.ts`）
npm run webui:frontend     # 启动前端（默认访问 http://localhost:5173）

# 生产模式（推荐：一键启动）
npm run webui:start        # 构建前端并启动后端服务器

# 生产模式（手动启动）
npm run webui:build        # 构建前端
npm run webui              # 启动后端（默认端口 3000，可通过 PORT 环境变量修改）

# 桌面应用（Electron）
cd webui-frontend
npm run electron:dev      # 开发模式
npm run electron:build    # 构建（支持 Windows/macOS/Linux）
```

> 📖 **详细说明**：查看 [WebUI 使用指南](docs/WEBUI.md)

**主要功能**：
- 📊 下载统计和概览
- 📁 文件浏览和预览（支持特殊字符文件名）
- 📝 实时日志查看
- ⚙️ 配置管理
- 🎯 任务管理（启动/停止下载）

---

### 🐳 Docker 部署（推荐）

Docker 部署无需安装 Node.js 环境：

```bash
# 快速开始
cp config/standalone.config.example.json config/standalone.config.json
npm run login  # 在主机上登录
docker-compose up -d

# 或使用脚本工具
./scripts/pixiv.sh docker setup    # 初始化
./scripts/pixiv.sh docker login    # 登录
./scripts/pixiv.sh docker deploy   # 部署
```

**服务说明**：
- `pixivflow` - 定时任务服务（后台运行）
- `pixivflow-webui` - WebUI 管理界面（访问 http://localhost:3000）

**常用命令**：
```bash
docker-compose up -d          # 启动服务
docker-compose logs -f        # 查看日志
docker-compose down           # 停止服务
./scripts/pixiv.sh docker status  # 查看状态
```

> 📖 **详细说明**：查看 [Docker 使用指南](docs/DOCKER.md)

---

## 🎨 CLI 命令行工具

> 💡 **推荐使用**：全局安装后可直接使用 `pixivflow` 命令，无需依赖项目目录中的脚本。

### 🚀 核心命令

```bash
# 全局安装后使用
pixivflow login                      # 登录 Pixiv 账号
pixivflow download                   # 执行下载
pixivflow random                     # 随机下载
pixivflow scheduler                  # 启动定时任务
pixivflow normalize                  # 整理文件
pixivflow migrate-config             # 迁移配置
pixivflow health                     # 健康检查（推荐 ⭐）
pixivflow status                     # 查看下载统计和最近记录
pixivflow logs                       # 查看运行日志
pixivflow setup                      # 交互式配置向导（首次使用）⭐
pixivflow dirs                       # 查看目录信息（文件保存位置）⭐
```

### ⚙️ 配置管理

```bash
pixivflow config                     # 配置管理（查看/编辑/备份/恢复）⭐
pixivflow config show                # 查看配置
pixivflow config set <key> <value>   # 设置配置项（如：storage.downloadDirectory）⭐
pixivflow config backup              # 备份配置
pixivflow config restore             # 恢复配置
pixivflow config validate            # 验证配置
pixivflow config edit                # 编辑配置
```

**配置设置示例**：
```bash
# 设置下载目录
pixivflow config set storage.downloadDirectory ./my-downloads

# 设置插画目录
pixivflow config set storage.illustrationDirectory ./my-illustrations

# 设置小说目录
pixivflow config set storage.novelDirectory ./my-novels
```

### 📊 监控与维护

```bash
pixivflow monitor                    # 实时监控进程状态和性能指标 ⭐
pixivflow maintain                   # 自动维护（清理日志、优化数据库等）⭐
pixivflow backup                     # 自动备份配置和数据 ⭐
```

> 📖 **详细说明**：查看 [脚本使用指南](docs/SCRIPTS.md)

---

## 🛠️ 脚本工具

PixivFlow 提供了丰富的脚本工具，所有脚本直接调用内置 CLI，性能更好、响应更快。

> 💡 **说明**：后端核心完全独立，可在任何环境运行（服务器、Docker、CI/CD）。WebUI 是可选的辅助工具，所有核心功能都可通过命令行使用。

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
| `check` | 环境检查（支持 `--fix` 自动修复） |
| `update` | 一键更新和修复（更新代码、依赖、修复错误） |
| `health` | 健康检查（检查配置、网络等）<br>**全局安装后使用**: `pixivflow health` |
| `status` | 查看下载统计和最近记录<br>**全局安装后使用**: `pixivflow status`  |
| `logs` | 查看运行日志<br>**全局安装后使用**: `pixivflow logs`  |
| `config` | 配置管理工具（查看/编辑/备份/恢复）<br>**全局安装后使用**: `pixivflow config` ⭐ |
| `backup` | 自动备份配置和数据<br>**全局安装后使用**: `pixivflow backup` ⭐ |
| `maintain` | 自动维护（清理日志、优化数据库等）<br>**全局安装后使用**: `pixivflow maintain` ⭐ |
| `monitor` | 实时监控进程状态和性能指标<br>**全局安装后使用**: `pixivflow monitor` ⭐ |
| `setup` | 交互式配置向导（首次使用）<br>**全局安装后使用**: `pixivflow setup` ⭐ |

### ⚙️ 其他工具

```bash
# 环境检查和修复
./scripts/pixiv.sh check --fix       # 自动修复环境问题
./scripts/pixiv.sh update            # 一键更新和修复
```

> 📖 **详细说明**：查看 [脚本使用指南](docs/SCRIPTS.md)

---

## 📚 文档导航

> 📖 **完整文档索引**: 查看 [文档导航](docs/README.md) 获取所有文档的完整列表和分类

### 🌟 新手必读（按顺序阅读）

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [⚡ QUICKSTART](docs/QUICKSTART.md) | **3 分钟快速上手** - 最快开始使用 | ⭐⭐⭐⭐⭐ |
| [🔐 LOGIN](docs/LOGIN.md) | **登录流程详解** - 登录问题解决方案 | ⭐⭐⭐⭐ |
| [📖 USAGE](docs/USAGE.md) | **使用指南** - 功能使用说明 | ⭐⭐⭐⭐ |

### 📘 功能指南

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [📋 CONFIG](docs/CONFIG.md) | **配置文件使用指南** - 所有配置选项详解 | ⭐⭐⭐⭐⭐ |
| [🛠️ SCRIPTS](docs/SCRIPTS.md) | **脚本使用指南** - 所有脚本详细说明 | ⭐⭐⭐⭐⭐ |

### 🌐 WebUI 和 Docker

| 文档 | 说明 | 推荐度 |
|------|------|--------|
| [🌐 WEBUI](docs/WEBUI.md) | **WebUI 使用指南** - Web 管理界面和部署配置 | ⭐⭐⭐⭐ |
| [🐳 DOCKER](docs/DOCKER.md) | **Docker 使用指南** - Docker 部署和使用（包含常见问题解决方案） | ⭐⭐⭐⭐ |
| [📱 TERMUX](docs/TERMUX_INSTALL.md) | **Termux/Android 安装指南** - Android 设备上的安装和使用 | ⭐⭐⭐ |

### 📄 项目文档

| 文档 | 说明 |
|------|------|
| [版本同步保护机制](docs/VERSION_SYNC_PROTECTION.md) | 版本同步保护机制说明，确保 package.json、npm 和 GitHub 标签同步 |
| [📝 CHANGELOG](docs/project/CHANGELOG.md) | 版本更新日志 |
| [🤝 CONTRIBUTING](docs/project/CONTRIBUTING.md) | 贡献指南 |

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

```bash
# 随机下载插画（默认）
npm run random
# 或
pixivflow random

# 随机下载小说
pixivflow random --novel
```

**功能说明**：
- 🎲 从热门标签中随机选择（插画：風景、イラスト等；小说：小説、オリジナル等）
- 🔍 从搜索结果中随机选择作品
- 🔐 自动登录（如未登录）
- 📥 快速体验：下载 1 个随机作品

---

### 场景 4：一次性批量下载

**需求**：一次性下载指定标签的作品

```bash
./scripts/pixiv.sh once    # 或 npm run download
```

> 💡 **提示**：所有下载任务通过配置文件实现，无需修改源代码。详细说明请查看 [配置文件使用指南](docs/CONFIG.md)。

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
│   │   ├── easy-setup.sh            # 配置向导（备用）
│   │   └── auto-deploy.sh           # 自动部署
│   │
│   │   ⚠️ 注意：以下功能已迁移到 CLI 命令（全局安装后使用）：
│   │   - 配置管理：`pixivflow config`
│   │   - 健康检查：`pixivflow health`
│   │   - 自动监控：`pixivflow monitor`
│   │   - 自动维护：`pixivflow maintain`
│   │   - 自动备份：`pixivflow backup`
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
        ├── README.md                # 文档导航
        ├── QUICKSTART.md            # 快速开始指南
        ├── LOGIN.md                 # 登录指南
        ├── CONFIG.md                # 配置指南
        ├── USAGE.md                 # 使用指南
        ├── SCRIPTS.md               # 脚本指南
        ├── WEBUI.md                 # WebUI 指南
        ├── DOCKER.md                # Docker 指南
        └── project/                 # 项目文档
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
    "deviceToken": "pixiv",
    "userAgent": "PixivAndroidApp/5.0.234 (Android 11; Pixel 6)"
  }
}
```

> ⚠️ `refreshToken` 通过配置向导自动获取，无需手动填写  
> ⚠️ `deviceToken` 默认值为 `"pixiv"`，通常不需要修改

### 下载目标

#### 基础配置

```json
{
  "targets": [
    {
      "type": "illustration",        // illustration 或 novel
      "tag": "風景",                 // 搜索标签（支持多标签，空格分隔）
      "limit": 20,                   // 下载数量限制
      "mode": "search"               // search（搜索）或 ranking（排行榜）
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
| `mode` | 下载模式 | `"search"` 或 `"ranking"` |
| `searchTarget` | 搜索范围 | `"partial_match_for_tags"`（部分匹配）<br>`"exact_match_for_tags"`（精确匹配） |
| `sort` | 排序方式 | `"date_desc"`（最新）<br>`"popular_desc"`（最受欢迎）<br>`"date_asc"`（最旧） |
| `minBookmarks` | 最低收藏数 | `500` |
| `startDate` / `endDate` | 日期范围 | `"2024-01-01"` |
| `random` | 随机选择 | `true` |
| `seriesId` | 小说系列ID | `14690617`（仅 novel） |
| `novelId` | 单篇小说ID | `26132156`（仅 novel） |
| `languageFilter` | 语言过滤 | `"chinese"`（仅中文）<br>`"non-chinese"`（仅非中文） |
| `detectLanguage` | 启用语言检测 | `true`（默认）或 `false`（仅 novel） |

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

> 💡 **语言检测**：`languageFilter` 支持 `"chinese"`（仅中文）或 `"non-chinese"`（仅非中文）。检测结果会保存到元数据文件。  
> 💡 **多标签搜索**：在 `tag` 字段中用空格分隔多个标签，表示作品必须同时包含所有标签（AND关系）。  
> 📚 **完整配置指南**：查看 [配置文件使用指南](docs/CONFIG.md) 了解所有配置选项和详细示例

### 定时任务

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",           // Cron 表达式
    "timezone": "Asia/Shanghai"     // 时区
  }
}
```

**Cron 表达式速查**：
- `0 * * * *` - 每小时执行
- `0 */6 * * *` - 每 6 小时执行
- `0 2 * * *` - 每天 2:00 执行
- `0 0 * * 0` - 每周日 0:00 执行
- `0 0 1 * *` - 每月 1 号 0:00 执行

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

**目录组织方式**：
- `flat` - 扁平结构（默认）
- `byAuthor` - 按作者组织
- `byTag` - 按标签组织
- `byDate` - 按日期组织（YYYY-MM）
- `byDay` - 按日组织（YYYY-MM-DD）
- `byAuthorAndTag` - 按作者和标签
- `byDateAndAuthor` - 按日期和作者
- `byDayAndAuthor` - 按日和作者

> 💡 **提示**：路径支持自动修复，项目启动时会自动检测并修复路径问题。使用 `pixivflow migrate-config` 可手动迁移配置路径。  
> 📚 **完整配置说明**：查看 [配置指南](docs/CONFIG.md)

---

## 🐛 常见问题

### ❓ 登录失败？

```bash
# 重新登录
npm run login
# 或
./scripts/pixiv.sh login
```

**检查项**：确认用户名密码正确、网络连接正常、代理设置正确

---

### ❓ 认证失败或 Token 过期？

```bash
npm run login  # 重新登录获取新 token
```

---

### ❓ 找不到匹配的作品？

**可能原因**：标签拼写错误、筛选条件过严、网络问题

**解决方法**：
1. 尝试常见标签：`イラスト`、`風景`、`art`
2. 降低 `minBookmarks` 值
3. 检查网络和代理设置

---

### ❓ 定时任务没有运行？

```bash
./scripts/pixiv.sh status    # 查看状态
./scripts/pixiv.sh logs      # 查看日志
```

**确保程序持续运行**：
```bash
pm2 start "npm run scheduler" --name pixivflow
pm2 save && pm2 startup
```

---

### ❓ 下载速度慢或经常失败？

**解决方法**：
1. 调整配置：减少 `download.concurrency`（1-2），增加 `download.requestDelay`（1000-2000ms）
2. 保持 `download.dynamicConcurrency: true`（默认启用），系统会自动调整并发数
3. 检查网络连接，必要时使用代理

> 💡 **提示**：内置智能动态并发控制，检测到速率限制（429 错误）时自动降低并发数

---

### ❓ 遇到已删除或私有的作品？

**自动处理**：系统会自动跳过已删除、私有或无法访问的作品，不会中断下载流程。跳过的数量会在任务结束时显示。

---

### ❓ Android/Termux 安装失败？

如果在 Android Termux 环境下安装时遇到 `better-sqlite3` 编译错误：

**解决方案**：

1. **安装构建工具**：
   ```bash
   pkg install python3 make clang
   ```

2. **使用本地安装**（推荐）：
   ```bash
   mkdir ~/pixivflow && cd ~/pixivflow
   npm install pixivflow
   npx pixivflow --help
   ```

3. **如果仍然失败**，查看详细的 [Termux 安装指南](docs/TERMUX_INSTALL.md)

> 💡 **提示**：Termux 环境下推荐使用本地安装而不是全局安装，以避免权限和路径问题。

---

### 🔍 查看详细日志

```bash
./scripts/pixiv.sh logs
# 或
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
| ✅ **定期备份** | 使用 `pixivflow backup` 备份配置和数据 |
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
# 使用维护命令（推荐）
pixivflow maintain

# 或手动删除数据库（会重新下载所有作品）
rm data/pixiv-downloader.db
```

---

## 🚀 进阶使用

### 服务器部署

**方式 1：Docker（推荐）**
```bash
./scripts/pixiv.sh docker deploy
```

**方式 2：PM2**
```bash
npm install -g pm2
pm2 start "npm run scheduler" --name pixivflow
pm2 save && pm2 startup
```

**方式 3：systemd**
创建 `/etc/systemd/system/pixivflow.service`，配置后启动：
```bash
sudo systemctl enable pixivflow && sudo systemctl start pixivflow
```

### 配置多个下载任务

在 `targets` 数组中添加多个目标：

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 50 },
    { "type": "illustration", "tag": "イラスト", "limit": 30, "minBookmarks": 1000 },
    { "type": "novel", "tag": "小説", "limit": 10 }
  ]
}
```

### 使用代理

**方式 1：环境变量（推荐）**
```bash
export all_proxy=socks5://127.0.0.1:6153
npm run download
```

**方式 2：配置文件**
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

> 💡 **提示**：环境变量优先级：`all_proxy` > `https_proxy` > `http_proxy`

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

| 类型 | 渠道 | 说明 |
|------|------|------|
| 🐛 **Bug 反馈** | [GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues) | 报告问题和错误 |
| 💡 **功能建议** | [GitHub Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | 提出新功能想法 |
| 📖 **使用问题** | [查看文档](docs/README.md) | 查阅完整文档 |
| ✅ **环境检查** | `./scripts/pixiv.sh health` | 运行健康检查 |
| 💬 **社区交流** | [Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | 与其他用户交流 |

**提问前请先**：
1. 🔍 查看 [常见问题](#-常见问题) 章节
2. 📖 阅读相关文档
3. ✅ 运行健康检查 `./scripts/pixiv.sh health`
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
