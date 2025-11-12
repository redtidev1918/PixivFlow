# 🎨 PixivFlow

<div align="center">

**Intelligent Pixiv Automation Downloader | 智能的 Pixiv 自动化下载工具**

Make Pixiv artwork collection elegant and efficient | 让 Pixiv 作品收集变得优雅而高效

[![GitHub stars](https://img.shields.io/github/stars/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/network/members)
[![GitHub issues](https://img.shields.io/github/issues/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/issues)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow)
[![Maintenance](https://img.shields.io/badge/Maintained-yes-green.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow/graphs/commit-activity)

[Quick Start](#-quick-start) • [Features](#-features) • [CLI Commands](#-cli-commands) • [Scripts](#-script-tools) • [Use Cases](#-use-cases)

[English](README_EN.md) | [中文](README.md)

</div>

---

## 📑 Table of Contents

<details>
<summary><b>Click to expand full table of contents</b></summary>

<br>

**Getting Started**
- [💡 What is PixivFlow?](#-what-is-pixivflow)
  - [🌟 Why Choose PixivFlow?](#-why-choose-pixivflow)
  - [🎯 Core Philosophy](#-core-philosophy)
- [✨ Features](#-features)
  - [🚀 Core Features](#-core-features)
  - [🎁 Additional Advantages](#-additional-advantages)
- [🚀 Quick Start](#-quick-start)
  - [📋 Requirements](#-requirements)
  - [🎬 Quick Start (Recommended)](#-quick-start-recommended)
  - [🎯 Manual Setup](#-manual-setup)
  - [🌐 Using WebUI (Optional)](#-using-webui-optional)

**Tools & Documentation**
- [🎨 CLI Commands](#-cli-commands)
  - [🚀 Core Commands](#-core-commands)
  - [⚙️ Configuration Management](#️-configuration-management-1)
  - [📊 Monitoring and Maintenance](#-monitoring-and-maintenance-1)
- [🛠️ Script Tools](#️-script-tools)
  - [🎯 Main Control Script (Most Used)](#-main-control-script-most-used)
  - [🔐 Login Management](#-login-management)
  - [🐳 Docker Management](#-docker-management)
- [📚 Documentation](#-documentation)
  - [🌟 Must Read for Beginners](#-must-read-for-beginners)
  - [📘 Advanced Documentation](#-advanced-documentation)
  - [🐳 Docker Documentation](#-docker-documentation)
  - [📄 Project Documentation](#-project-documentation)

**Usage & Configuration**
- [🎯 Use Cases](#-use-cases)
  - [Scenario 1: Daily Auto Collection](#scenario-1-daily-auto-collection-of-inspiration-materials)
  - [Scenario 2: Server Scheduled Collection](#scenario-2-server-scheduled-collection-of-specific-tags)
  - [Scenario 3: Quick Experience](#scenario-3-quick-experience---random-download)
  - [Scenario 4: One-Time Batch Download](#scenario-4-one-time-batch-download)
- [📁 Project Structure](#-project-structure)
- [⚙️ Core Configuration](#️-core-configuration)
  - [Authentication Configuration](#authentication-configuration)
  - [Download Targets](#download-targets)
  - [Scheduled Tasks](#scheduled-tasks)
  - [Storage Configuration](#storage-configuration)

**Troubleshooting & Advanced**
- [🐛 FAQ](#-faq)
  - [❓ Setup Wizard Login Failed?](#-setup-wizard-login-failed)
  - [❓ Authentication Failed or Token Expired?](#-authentication-failed-or-token-expired)
  - [❓ No Matching Artworks Found?](#-no-matching-artworks-found)
  - [❓ Scheduled Task Not Running?](#-scheduled-task-not-running)
  - [❓ Slow Download Speed or Frequent Failures?](#-slow-download-speed-or-frequent-failures)
  - [❓ Encountered Deleted or Private Artworks?](#-encountered-deleted-or-private-artworks)
- [🔒 Security Tips](#-security-tips)
- [📊 Download Record Management](#-download-record-management)
- [🚀 Advanced Usage](#-advanced-usage)
  - [Deploy on Server](#deploy-on-server)
  - [Configure Multiple Download Tasks](#configure-multiple-download-tasks)
  - [Using Proxy](#using-proxy)

**Project Information**
- [📄 Open Source License](#-open-source-license)
- [🙏 Acknowledgments](#-acknowledgments)
- [📮 Get Help](#-get-help)
- [📈 Project Statistics](#-project-statistics)
- [🤝 Contributing](#-contributing)
- [📝 Changelog](#-changelog)
- [Support the Project](#support-the-project)

</details>

---

## 💡 What is PixivFlow?

**PixivFlow** is a **fully standalone** Pixiv artwork batch downloader designed for automation. No browser extension required, can run automatically in command line or on servers, supports scheduled tasks, intelligent deduplication, resume download, and more.

### 🌟 Why Choose PixivFlow?

Compared to other Pixiv downloaders, PixivFlow focuses on **automation** and **server deployment** scenarios:

| Advantage | Description |
|-----------|-------------|
| 🚀 **Fully Standalone** | No browser extension required, pure CLI tool that can run in any environment (servers, Docker, CI/CD) |
| 🤖 **True Automation** | Set once, run forever. Supports Cron scheduled tasks, no manual intervention needed |
| 🖥️ **Server Friendly** | Designed for servers, supports background running, process management, log rotation |
| 🔐 **Secure & Reliable** | Uses OAuth 2.0 PKCE standard flow to ensure account security, avoids password leakage risks |
| 📦 **Lightweight Deployment** | Low resource usage, no additional services needed (like databases, Redis), SQLite is enough |
| 🛠️ **Out of the Box** | Rich script tools and setup wizard, get started in 3 steps |

### 🎯 Core Philosophy

- **Automation First**: Set once, run automatically, no manual intervention
- **Intelligent Management**: Auto deduplication, resume download, error retry
- **Simple & Easy**: 3 steps to get started, setup wizard guides you through
- **Out of the Box**: Rich script tools, no need to remember complex commands

---

## ✨ Features

### 🚀 Core Features

| Feature | Description |
|---------|-------------|
| **📥 Batch Download** | Supports batch download of illustrations and novels, configurable download count and filters |
| **🏷️ Tag Search** | Search artworks by tags, supports exact match, partial match, and other modes |
| **🎲 Random Download** | One-click download random popular tag artworks for quick experience |
| **⏰ Scheduled Tasks** | Cron expression configuration, supports daily, weekly, monthly automatic downloads |
| **🔍 Smart Filtering** | Multi-dimensional filtering by bookmarks, date range, artwork type, etc. |
| **💾 Auto Deduplication** | SQLite database records history, automatically skips already downloaded artworks |
| **🔄 Resume Download** | Automatically resumes after interruption, no need to restart |
| **🛡️ Error Handling** | Auto retry, error recovery, smart skip deleted/private artworks |
| **📡 RESTful API** | Complete REST API with authentication, configuration, download, and statistics |
| **🔌 WebSocket** | Real-time log streaming and download status updates |
| **📊 Statistics Reports** | Detailed run logs and download statistics |

### 🎁 Additional Advantages

- ✅ **Fully Standalone**: No browser required, pure CLI tool
- ✅ **API Server**: Provides RESTful API and WebSocket, can integrate with any frontend
- ✅ **npm Package**: Can be installed as npm package, supports global and local installation
- ✅ **Lightweight**: Low resource usage, suitable for long-term server running
- ✅ **Open Source**: GPL-3.0 license, free to customize and distribute
- ✅ **Type Safe**: Written in TypeScript with complete type hints
- ✅ **Well Documented**: Detailed documentation and tutorials

---

## 🚀 Quick Start

### 📋 Requirements

- **Node.js 18+** and **npm 9+** (Recommended: LTS versions 18.x, 20.x, 22.x, or 24.x)
- **Pixiv account**
- **Windows users**: Recommended to use WSL (`wsl --install`) or Git Bash

> ⚠️ **Node.js Version Note**:
> - Recommended to use **LTS (Long Term Support) versions**: 18.x, 20.x, 22.x, or 24.x
> - Avoid using odd-numbered versions (e.g., 19.x, 21.x, 23.x), as these may not be supported by all dependencies
> - If you see `EBADENGINE` warnings, consider switching to an LTS version
> 
> 💡 **Login Note**: The project uses Node.js library for login by default, **Python is not required**. Python gppt is only used as a fallback option (optional).  
> 📖 **Detailed Guide**: See [Quick Start Guide](docs/QUICKSTART.md)

### 🎬 Quick Installation (Recommended ⭐)

#### Method 1: Install from npm (Easiest)

```bash
# Install globally from npm
npm install -g pixivflow

# Verify installation
pixivflow --help

# Login to account
pixivflow login

# Start downloading
pixivflow download
```

#### Method 2: Install from Source

```bash
# 1. Clone the repository
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 2. Install dependencies
npm install

# 3. Login to account
npm run login

# 4. Start downloading
npm run download
```

**Or use one-click script** (automatically completes all setup):

```bash
./scripts/quick-start.sh
```

---

### 🌐 Global Installation (Optional)

If you want to use `pixivflow` command from any directory, you can install it globally:

#### Method 1: Install from npm (Recommended ⭐)

```bash
# Install globally from npm
npm install -g pixivflow
```

#### Method 2: Install from Local Directory

```bash
# 1. Clone the repository
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. Install globally
npm install -g .
```

#### Method 3: Install Directly from GitHub Repository

```bash
# Install globally from GitHub repository
npm install -g git+https://github.com/zoidberg-xgd/pixivflow.git

# Note: After installation, you may need to build
# Find the global installation directory (usually in npm root -g's parent directory/bin)
# Or reinstall with build script specified
```

#### Verify Global Installation

After installation, you can use the `pixivflow` command from any directory:

```bash
# View help
pixivflow --help

# Check installation location
which pixivflow

# Login to account
pixivflow login

# Execute download
pixivflow download

# Start scheduled task
pixivflow scheduler

# Normalize and reorganize downloaded files
pixivflow normalize
pixivflow normalize --dry-run      # Preview changes without applying

# Migrate configuration paths (convert absolute to relative)
pixivflow migrate-config
pixivflow migrate-config --dry-run # Preview migration changes
```

#### Configuration After Global Installation

After global installation, the configuration file location:
- Configuration file: `~/.pixivflow/config/standalone.config.json` (if using default path)
- Or use `--config` parameter to specify configuration file path

```bash
# Use custom configuration file
pixivflow download --config /path/to/config.json

# Login (will automatically create configuration file)
pixivflow login
```

#### Update Global Installation

If you need to update the globally installed version:

```bash
# Method 1: Reinstall (from local directory)
cd /path/to/pixivflow
npm run build
npm install -g .

# Method 2: Update from GitHub
npm install -g git+https://github.com/zoidberg-xgd/pixivflow.git
```

> **💡 Tips**:
> - After global installation, you can use the `pixivflow` command directly from any directory
> - First use requires running `pixivflow login` to login
> - Configuration file will be automatically created in user home directory or project directory
> - npm package: https://www.npmjs.com/package/pixivflow

---

### 🎯 Manual Setup

If you want to manually control each step:

#### 1️⃣ Install Dependencies

```bash
npm install
```

#### 2️⃣ Login to Pixiv Account

```bash
# Simplest way: Enter username and password in terminal (recommended)
npm run login

# Or use setup wizard (pure terminal login, interactive config)
./scripts/easy-setup.sh
# or
npm run setup
```

**Login Notes**:
- ✅ **Default login mode**: Uses Node.js library for login (no Python required)
- ✅ **Python fallback option**: Python gppt can be used as a fallback option (optional)
- ✅ Auto update config: Automatically updates refresh token in config after successful login
- ✅ Setup wizard: Use `npm run setup` for interactive configuration

#### 3️⃣ Configure Download Options (Optional)

If using `npm run login` to login, you can configure download options later:

```bash
# Run setup wizard
./scripts/easy-setup.sh
# or
npm run setup
```

The setup wizard will automatically complete all settings, including:
- ⚙️ Configure download options (tags, quantity, filters, etc.)
- ⏰ Scheduled task settings

#### 4️⃣ Start Downloading

```bash
# Test download (recommended for first use)
./scripts/pixiv.sh test

# Execute one download
./scripts/pixiv.sh once

# Start scheduled task
./scripts/pixiv.sh run
```

That's it! 🎉

> **💡 Tip**: For first use, it's recommended to run `test` to download 1-2 artworks first, confirm the configuration is correct before formal use.
> 

---

### 📡 API Server (Optional)

PixivFlow provides a RESTful API server that can integrate with frontend projects.

**Architecture Note**: This project uses a completely separated frontend-backend architecture. The backend is a pure API server that can be used as an npm package independently. The frontend is an independent React project that has been separated to an independent repository: [pixivflow-webui](https://github.com/zoidberg-xgd/pixivflow-webui). See [Architecture Documentation](docs/ARCHITECTURE.md) for details.

#### Start API Server

```bash
# Method 1: Use as npm package (Recommended)
npm install -g pixivflow
pixivflow webui                    # Start API server, visit http://localhost:3000

# Method 2: Run from source
npm run build
node dist/webui/index.js

# Method 3: Specify static file path (Optional, for simple deployment)
pixivflow webui --static-path /path/to/frontend/dist

# Or use environment variable
STATIC_PATH=/path/to/frontend/dist pixivflow webui

# Method 4: Start backend API only (Recommended for production)
pixivflow webui                    # Pure API mode, no static files served
```

#### API Endpoints

- `/api/auth` - Authentication (login, logout, status check)
- `/api/config` - Configuration management (view, edit, backup, restore)
- `/api/download` - Download management (start, stop, status query)
- `/api/stats` - Statistics (download stats, file stats)
- `/api/logs` - Logs (real-time log stream, WebSocket)
- `/api/files` - File management (file list, preview, operations)

#### Frontend Integration

Frontend has been separated to an independent repository: [**pixivflow-webui**](https://github.com/zoidberg-xgd/pixivflow-webui)

```bash
# Clone frontend repository
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui

# Install dependencies
npm install

# Development mode (requires backend API running)
npm run dev                        # Start frontend dev server, visit http://localhost:5173

# Build production version
npm run build                      # Build output in dist/ directory
```

> 📖 **Detailed Instructions**: See [Architecture Documentation](docs/ARCHITECTURE.md) to learn about frontend-backend separation architecture and deployment methods

---

### 🐳 Using Docker (Recommended)

PixivFlow supports Docker deployment, no need to install Node.js environment:

#### Quick Start

```bash
# 1. Prepare configuration file
cp config/standalone.config.example.json config/standalone.config.json

# 2. Login to Pixiv account (on host)
npm run login

# 3. Start scheduled task service
docker-compose up -d pixivflow

# Or start WebUI service
docker-compose up -d pixivflow-webui

# Or start both services
docker-compose up -d
```

#### Using Script Tools

```bash
# 1. Initialize Docker environment
./scripts/pixiv.sh docker setup

# 2. Login to Pixiv account
./scripts/pixiv.sh docker login

# 3. Build and deploy
./scripts/pixiv.sh docker deploy

# 4. Check status
./scripts/pixiv.sh docker status

# 5. View logs
./scripts/pixiv.sh docker logs -f
```

#### Docker Services

`docker-compose.yml` provides two services:

1. **pixivflow** - Scheduled task service (default)
   - Automatically executes scheduled download tasks
   - Runs continuously in background

2. **pixivflow-webui** - WebUI management interface (optional)
   - Provides modern web management interface
   - Access address: http://localhost:3000
   - Supports file browsing, statistics viewing, task management, etc.

#### Docker Common Commands

```bash
# Start scheduled task service
docker-compose up -d pixivflow

# Start WebUI service
docker-compose up -d pixivflow-webui

# Start both services
docker-compose up -d

# View logs
docker-compose logs -f pixivflow
docker-compose logs -f pixivflow-webui

# Stop services
docker-compose stop

# Stop and remove containers
docker-compose down

# Rebuild images
docker-compose build
```

#### Docker Script Commands

- `docker setup` - Initialize Docker environment
- `docker build` - Build Docker image
- `docker deploy` - Deploy service (build + start)
- `docker up` - Start service
- `docker down` - Stop service
- `docker status` - View service status
- `docker logs` - View logs
- `docker login` - Login to account in container
- `docker random` - Random download artwork (for testing)

> 📖 **Detailed Instructions**: See [Docker Usage Guide](docs/DOCKER.md)

---

## 🎨 CLI Commands

> 💡 **Recommended**: After global installation, you can directly use the `pixivflow` command without relying on scripts in the project directory.

### 🚀 Core Commands

```bash
# Use after global installation
pixivflow login                      # Login to Pixiv account
pixivflow download                   # Execute download
pixivflow random                     # Random download
pixivflow scheduler                  # Start scheduled task
pixivflow normalize                  # Normalize files
pixivflow migrate-config             # Migrate config
pixivflow health                     # Health check (recommended ⭐)
pixivflow status                     # View download statistics and recent records
pixivflow logs                       # View run logs
pixivflow setup                      # Interactive setup wizard (first time use) ⭐
pixivflow dirs                       # View directory information (where files are saved) ⭐
```

### ⚙️ Configuration Management

```bash
pixivflow config                     # Config management (view/edit/backup/restore) ⭐
pixivflow config show                # View config
pixivflow config set <key> <value>   # Set config value (e.g., storage.downloadDirectory) ⭐
pixivflow config backup              # Backup config
pixivflow config restore             # Restore config
pixivflow config validate            # Validate config
pixivflow config edit                # Edit config
```

**Config Set Examples**:
```bash
# Set download directory
pixivflow config set storage.downloadDirectory ./my-downloads

# Set illustration directory
pixivflow config set storage.illustrationDirectory ./my-illustrations

# Set novel directory
pixivflow config set storage.novelDirectory ./my-novels
```

### 📊 Monitoring and Maintenance

```bash
pixivflow monitor                    # Real-time monitoring of process status and performance metrics ⭐
pixivflow maintain                   # Auto maintenance (clean logs, optimize database, etc.) ⭐
pixivflow backup                     # Auto backup config and data ⭐
```

> 📖 **Detailed Instructions**: See [Script Usage Guide](docs/SCRIPTS.md)

---

## 🛠️ Script Tools

PixivFlow provides rich script tools so you don't need to remember complex npm commands. All scripts directly call built-in CLI functions for better performance and faster response.

### 🎯 Main Control Script (Most Used)

```bash
./scripts/pixiv.sh <command>
```

| Command | Description |
|---------|-------------|
| `setup` | Interactive setup wizard (must run first time) |
| `login` | Login to Pixiv account (interactive, directly calls built-in CLI) |
| `test` | Test download (download small amount to verify config) |
| `once` | Execute one download |
| `random` | Random download one popular tag artwork (supports `--novel` for novels) |
| `run` | Start scheduled task (runs continuously in background) |
| `stop` | Stop running scheduled task |
| `status` | View current running status |
| `check` | Environment check (supports `--fix` for auto-fix) ⭐ New |
| `update` | One-click update and fix (update code, dependencies, fix errors) ⭐ New |
| `health` | Health check (check config, network, etc.) |
| `logs` | View run logs |

**💡 Tip**: 
- All commands directly call built-in CLI, no need to go through npm scripts, faster response.
- **New Features**: `check --fix` and `update` commands support automatic fixing of common issues.

### 🔐 Login Management

```bash
# Method 1: Use main control script (recommended)
./scripts/pixiv.sh login

# Method 2: Use login script (supports more options)
./scripts/login.sh

# Method 3: Use npm command
npm run login

# Headless login (provide username and password via parameters)
./scripts/pixiv.sh login -u your_username -p your_password
```

### ⚙️ Configuration Management

```bash
# Interactive setup wizard
./scripts/easy-setup.sh

# Configuration path migration (auto-fix absolute paths, for project migration)
pixivflow migrate-config              # Execute migration
pixivflow migrate-config --dry-run     # Preview changes
pixivflow migrate-config --json        # JSON format output
# Or use npm command
npm run start migrate-config          # Execute migration
npm run start migrate-config --dry-run # Preview changes
```

### 🔧 Environment Check and Auto-Fix ⭐ New Feature

```bash
# Basic environment check
./scripts/pixiv.sh check

# Auto-fix environment issues (recommended ⭐)
./scripts/pixiv.sh check --fix

# One-click update and fix (update code, dependencies, fix errors)
./scripts/pixiv.sh update

# Or use alias
./scripts/pixiv.sh fix
```

**New Feature Description**:
- ✅ `check --fix`: Automatically install missing dependencies, create config, compile code
- ✅ `update`: One-click update code, dependencies, and fix common errors
- ✅ Smart detection: Automatically detect if build artifacts are outdated
- ✅ Unified error handling: Provide clear error messages and fix suggestions

### 🚀 Deployment and Backup

```bash
# Auto deploy to server
./scripts/auto-deploy.sh
```

### 🐳 Docker Management

```bash
# Use main control script
./scripts/pixiv.sh docker <command>

# Or directly use Docker script
./scripts/docker.sh <command>
```

**Common Commands**:
- `docker setup` - Initialize Docker environment
- `docker build` - Build image
- `docker deploy` - Deploy service
- `docker up` - Start service
- `docker down` - Stop service
- `docker status` - View status
- `docker logs` - View logs
- `docker login` - Login to account
- `docker test` - Test download

> 📖 **Detailed Instructions**: See [Docker Usage Guide](docs/DOCKER.md)

---

## 📚 Documentation

> 📖 **Complete Documentation Index**: See [Documentation Navigation](docs/README.md) for a complete list and classification of all documents

### 🌟 Must Read for Beginners (Read in Order)

| Document | Description | Rating |
|----------|-------------|--------|
| [⚡ QUICKSTART](docs/QUICKSTART.md) | **3-minute quick start** - Fastest way to get started | ⭐⭐⭐⭐⭐ |
| [🔐 LOGIN](docs/LOGIN.md) | **Login process details** - Login problem solutions | ⭐⭐⭐⭐ |
| [📖 USAGE](docs/USAGE.md) | **Usage guide** - Feature usage instructions | ⭐⭐⭐⭐ |

### 📘 Feature Guides

| Document | Description | Rating |
|----------|-------------|--------|
| [📋 CONFIG](docs/CONFIG.md) | **Configuration file usage guide** - All configuration options explained | ⭐⭐⭐⭐⭐ |
| [🛠️ SCRIPTS](docs/SCRIPTS.md) | **Script usage guide** - All scripts detailed instructions | ⭐⭐⭐⭐⭐ |

### 🌐 WebUI and Docker

| Document | Description | Rating |
|----------|-------------|--------|
| [🌐 WEBUI](docs/WEBUI.md) | **WebUI usage guide** - Web management interface and deployment configuration | ⭐⭐⭐⭐ |
| [🐳 DOCKER](docs/DOCKER.md) | **Docker usage guide** - Docker deployment and usage (includes solutions for common issues) | ⭐⭐⭐⭐ |

### 📄 Project Documentation

| Document | Description |
|----------|-------------|
| [📝 CHANGELOG](docs/project/CHANGELOG.md) | Version changelog |
| [🤝 CONTRIBUTING](docs/project/CONTRIBUTING.md) | Contributing guide |

---

## 🎯 Use Cases

### Scenario 1: Daily Auto Collection of Inspiration Materials

**Requirement**: Automatically download high-quality landscape and illustration artworks daily as design materials

**Configuration Example**:

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

**Run Method**:

```bash
./scripts/pixiv.sh run
```

---

### Scenario 2: Server Scheduled Collection of Specific Tags

**Requirement**: Weekly collect popular artworks of specific tags on server

**Configuration Example**:

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

**Deployment Method**:

```bash
# Use auto deploy script
./scripts/auto-deploy.sh

# Or use PM2 to manage process
pm2 start "npm run scheduler" --name pixivflow
```

---

### Scenario 3: Quick Experience - Random Download

**Requirement**: Quick experience tool, download one random artwork

**Run Method**:

```bash
# Random download illustration (default)
npm run random

# Random download novel
npm run random -- --novel
# or
npm run random -- -n

# Explicitly specify download illustration
npm run random -- --illustration
# or
npm run random -- -i

# Or use main program (if pixivflow is globally installed)
pixivflow random
pixivflow random --novel
```

**Feature Description**:
- 🎲 **Random Tag Selection**: Randomly select from popular tags (illustrations: 風景, イラスト, オリジナル, etc.; novels: 小説, オリジナル, ホラー, etc.)
- 🔍 **Random Artwork Selection**: Randomly select one artwork from search results
- 🔐 **Auto Login**: If not logged in, will automatically guide login
- 📥 **Quick Experience**: Download 1 random artwork, quickly understand tool features
- 📚 **Type Support**: Supports random download of both illustrations and novels

---

### Scenario 4: One-Time Batch Download

**Requirement**: One-time download artworks of specified tags

**Configuration Example**:

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

**Run Method**:

```bash
# Use convenient script (recommended)
./scripts/pixiv.sh once

# Or use npm command
npm run download

# Or use main program (if pixivflow is globally installed)
pixivflow download
```

> 💡 **Tip**: All download tasks are implemented through configuration files, no need to modify source code. See [Configuration File Usage Guide](docs/CONFIG.md) for details.

---

## 📁 Project Structure

```
pixivflow/
├── 📄 Configuration Files
│   ├── config/
│   │   ├── standalone.config.json           # Main config (create yourself)
│   │   └── standalone.config.example.json   # Config template
│
├── 💻 Source Code
│   ├── src/
│   │   ├── index.ts                 # Main program entry
│   │   ├── setup-wizard.ts          # Setup wizard
│   │   ├── config.ts                # Config management
│   │   ├── logger.ts                # Logging system
│   │   ├── pixiv/                   # Pixiv API
│   │   │   ├── AuthClient.ts        # Auth client
│   │   │   └── PixivClient.ts       # API client
│   │   ├── download/                # Download module
│   │   │   ├── DownloadManager.ts   # Download manager
│   │   │   └── FileService.ts       # File service
│   │   ├── storage/                 # Data persistence
│   │   │   └── Database.ts          # SQLite database
│   │   └── scheduler/               # Scheduled tasks
│   │       └── Scheduler.ts         # Task scheduler
│
├── 🛠️ Script Tools
│   ├── scripts/
│   │   ├── pixiv.sh                 # Main control script (recommended)
│   │   ├── easy-setup.sh            # Setup wizard (backup)
│   │   └── auto-deploy.sh           # Auto deploy
│   │
│   │   ⚠️ Note: The following features have been migrated to CLI commands (use after global install):
│   │   - Config management: `pixivflow config`
│   │   - Health check: `pixivflow health`
│   │   - Auto monitor: `pixivflow monitor`
│   │   - Auto maintenance: `pixivflow maintain`
│   │   - Auto backup: `pixivflow backup`
│
├── 📦 Output Directories (auto created)
│   ├── dist/                        # Compiled output
│   ├── downloads/                   # Download directory
│   │   ├── illustrations/           # Illustrations
│   │   └── novels/                  # Novels
│   └── data/                        # Data directory
│       ├── pixiv-downloader.db      # SQLite database
│       ├── pixiv-downloader.log     # Run logs
│       └── metadata/                # Metadata directory (auto created)
│           └── *.json               # Artwork metadata JSON files
│
└── 📚 Documentation
    ├── README.md                    # Main project doc
    └── docs/                        # Documentation directory
        ├── getting-started/         # Getting started guides
        │   ├── START_HERE.md        # Beginner guide
        │   ├── QUICKSTART.md        # Quick start
        │   └── TUTORIAL.md          # Complete tutorial
        ├── guides/                  # Usage guides
        │   ├── LOGIN_GUIDE.md       # Login guide
        │   ├── CONFIG_GUIDE.md      # Config guide
        │   ├── STANDALONE-SETUP-GUIDE.md  # Standalone setup guide
        │   ├── RANKING_DOWNLOAD_GUIDE.md  # Ranking download guide
        │   └── TEST_GUIDE.md        # Test guide
        ├── webui/                   # WebUI documentation
        ├── docker/                  # Docker documentation
        ├── scripts/                 # Script documentation
        │   └── SCRIPTS_GUIDE.md     # Script guide
        └── project/                 # Project documentation
            ├── CHANGELOG.md         # Changelog
            └── CONTRIBUTING.md      # Contributing guide
```

---

## ⚙️ Core Configuration

Configuration file is located at `config/standalone.config.json`. Below are key configuration items:

### Authentication Configuration

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

> ⚠️ `refreshToken` is automatically obtained through setup wizard, no need to manually fill

### Download Targets

```json
{
  "targets": [
    {
      "type": "illustration",              // Type: illustration or novel
      "tag": "風景",                       // Search tag
      "limit": 20,                         // Download limit
      "searchTarget": "partial_match_for_tags",
      "minBookmarks": 500,                 // Minimum bookmarks
      "startDate": "2024-01-01",          // Start date (optional)
      "endDate": "2024-12-31"             // End date (optional)
    }
  ]
}
```

### Scheduled Tasks

```json
{
  "scheduler": {
    "enabled": true,                      // Whether enabled
    "cron": "0 3 * * *",                 // Cron expression
    "timezone": "Asia/Shanghai"           // Timezone
  }
}
```

#### Cron Expression Quick Reference

| Expression | Description |
|------------|-------------|
| `0 * * * *` | Every hour |
| `0 */6 * * *` | Every 6 hours |
| `0 2 * * *` | Daily at 2:00 |
| `0 0 * * 0` | Weekly on Sunday at 0:00 |
| `0 0 1 * *` | Monthly on 1st at 0:00 |

### Storage Configuration

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

#### Directory Organization Modes

| Mode | Description | Directory Structure Example |
|------|-------------|----------------------------|
| `flat` | Flat structure (default) | `illustrations/123456_Title_1.jpg` |
| `byAuthor` | Organize by author | `illustrations/AuthorName/123456_Title_1.jpg` |
| `byTag` | Organize by tag | `illustrations/TagName/123456_Title_1.jpg` |
| `byDate` | Organize by date | `illustrations/2024-12/123456_Title_1.jpg` |
| `byAuthorAndTag` | By author and tag | `illustrations/AuthorName/TagName/123456_Title_1.jpg` |
| `byDateAndAuthor` | By date and author | `illustrations/2024-12/AuthorName/123456_Title_1.jpg` |

> 💡 **Tip**: Using organization modes can make downloaded files more organized, easier to manage and find.

> 💡 **Tip**: Paths support auto-fix, the project will automatically detect and fix path issues on startup. Use `pixivflow migrate-config` to manually migrate configuration paths.  
> 📚 **Complete Configuration Guide**: See [Configuration Guide](docs/CONFIG.md)

---

## 🐛 FAQ

### ❓ Setup Wizard Login Failed?

**Symptoms**: Login fails after running `npm run setup`

**Solutions**:
1. Confirm you correctly entered Pixiv username and password in terminal
2. Check network connection and proxy settings
3. Re-run setup wizard: `npm run setup`

---

### ❓ Authentication Failed or Token Expired?

**Symptoms**: "Authentication failed" or "401 Unauthorized" when downloading

**Solutions**:

```bash
# Method 1: Use login script (recommended, simplest)
npm run login

# Method 2: Re-run setup wizard
./scripts/easy-setup.sh
# or
npm run setup
```

---

### ❓ No Matching Artworks Found?

**Symptoms**: Search results empty or download count is 0

**Possible Causes**:
- Tag spelling error or doesn't exist
- Filter conditions too strict
- Network connection issues

**Solutions**:
1. Try common tags: `イラスト`, `風景`, `art`
2. Lower `minBookmarks` value
3. Check network connection and firewall settings
4. Search on Pixiv website to confirm tag exists

---

### ❓ Scheduled Task Not Running?

**Symptoms**: Scheduled task set but not auto downloading

**Solutions**:

```bash
# 1. Environment check and auto-fix (recommended ⭐)
./scripts/pixiv.sh check --fix

# 2. One-click update and fix
./scripts/pixiv.sh update

# 3. Check configuration
pixivflow config validate

# 4. View running status
./scripts/pixiv.sh status

# 5. Check logs
./scripts/pixiv.sh logs

# 6. Ensure program keeps running
# Use PM2 to manage process
pm2 start "npm run scheduler" --name pixivflow
pm2 save
pm2 startup
```

---

### ❓ Slow Download Speed or Frequent Failures?

**Possible Causes**: Unstable network connection or Pixiv server rate limiting

**Solutions**:
1. Check network connection
2. Reduce concurrent download count
3. Increase retry count and timeout
4. Use proxy server (if needed)

---

### ❓ Encountered Deleted or Private Artworks?

**Symptoms**: Some artworks cannot be downloaded during download process

**Description**:
PixivFlow has built-in comprehensive error handling that automatically handles the following:

- ✅ **Auto Skip Deleted Artworks**: If artwork is deleted by author, will auto skip and continue downloading others
- ✅ **Auto Skip Private Artworks**: If artwork is set to private or requires special permissions, will auto skip
- ✅ **Auto Skip Inaccessible Artworks**: If artwork cannot be accessed for other reasons (e.g., 404 error), will auto skip
- ✅ **Record Skip Count**: Will display skipped artwork count after download completes
- ✅ **Won't Interrupt Flow**: Single artwork download failure won't affect entire download task

**Log Example**:

```
[INFO] Skipped 3 novel(s) (deleted, private, or inaccessible)
[INFO] Illustration tag 風景 completed, { downloaded: 47 }
```

**Description**:
- 404 errors use `debug` level logs (silently skipped)
- Other errors use `warn` level logs (recorded but continue)
- All skipped artwork counts will be displayed at task end

---

### 🔍 View Detailed Logs

```bash
# View run logs
./scripts/pixiv.sh logs

# Or directly view log file
tail -f data/pixiv-downloader.log
```

---

## 🔒 Security Tips

> ⚠️ **Important**: Configuration files contain sensitive information, please pay attention to security

### 🛡️ Security Recommendations

| Recommendation | Description |
|----------------|-------------|
| ✅ **Don't Share Config Files** | `config/standalone.config.json` contains sensitive authentication info |
| ✅ **Don't Commit to Git** | Ensure config file is in `.gitignore` (excluded by default) |
| ✅ **Regular Backups** | Use `pixivflow backup` to backup config and data |
| ✅ **Use Strong Passwords** | Protect your Pixiv account |
| ✅ **HTTPS Encryption** | All API requests use HTTPS secure transmission |
| ✅ **Regular Token Updates** | Regularly re-run setup wizard to update authentication info |

### 🔐 About refresh_token

`refresh_token` is equivalent to your account password, having it allows access to your Pixiv account.

**If refresh_token is leaked**:
1. Immediately revoke authorization in Pixiv account settings
2. Change Pixiv account password
3. Re-run setup wizard to get new token

---

## 📊 Download Record Management

All download records are saved in SQLite database (`data/pixiv-downloader.db`), including:

- Artwork ID, title, author info
- Download time, file path
- Artwork statistics (views, bookmarks, etc.)

### View Download Records

```bash
# Use SQLite command line tool
sqlite3 data/pixiv-downloader.db "SELECT * FROM downloaded_artworks LIMIT 10;"

# Or use GUI tools
# - DB Browser for SQLite
# - SQLiteStudio
```

### Clean Download Records

```bash
# Use maintenance command (recommended)
pixivflow maintain

# Or manually delete database (will re-download all artworks)
rm data/pixiv-downloader.db
```

---

## 🚀 Advanced Usage

### Deploy on Server

#### Method 1: Use Docker (Recommended ⭐)

```bash
# Docker mode deployment
./scripts/auto-deploy.sh production docker

# Or use Docker management script
./scripts/pixiv.sh docker deploy
```

#### Method 2: Use Auto Deploy Script (Native Mode)

```bash
./scripts/auto-deploy.sh
```

#### Method 3: Use PM2 Management

```bash
# Install PM2
npm install -g pm2

# Start scheduled task
pm2 start "npm run scheduler" --name pixivflow

# Save PM2 config
pm2 save

# Set auto start on boot
pm2 startup
```

#### Method 4: Use systemd

Create service file `/etc/systemd/system/pixivflow.service`:

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

Start service:

```bash
sudo systemctl enable pixivflow
sudo systemctl start pixivflow
sudo systemctl status pixivflow
```

---

### Configure Multiple Download Tasks

You can add multiple targets in the `targets` array:

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

### Using Proxy

If you need to access Pixiv through proxy, there are two methods:

#### Method 1: Use Environment Variables (Recommended ⭐)

Program automatically reads proxy config from environment variables, no need to modify config file:

```bash
# Set proxy environment variables (priority: all_proxy > https_proxy > http_proxy)
export all_proxy=socks5://127.0.0.1:6153
# or
export https_proxy=http://127.0.0.1:6152
# or
export http_proxy=http://127.0.0.1:6152

# Then run program
npm run download
```

**Supported Proxy Protocols**:
- `http://` - HTTP proxy
- `https://` - HTTPS proxy
- `socks5://` - SOCKS5 proxy
- `socks4://` - SOCKS4 proxy

**Environment Variable Priority**:
1. `all_proxy` or `ALL_PROXY` (highest priority)
2. `https_proxy` or `HTTPS_PROXY`
3. `http_proxy` or `HTTP_PROXY`

#### Method 2: Config File Settings

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

**Note**: If proxy is enabled in config file, environment variables won't override config file settings.

---

## 📄 Open Source License

This project is open source under [GPL-3.0-or-later](LICENSE) license.

**This means**:
- ✅ Free to use, modify and distribute
- ✅ Modified code must also be open source
- ✅ Must retain original author info and license notice

---

## 🙏 Acknowledgments

### Inspiration Sources

- [PixivBatchDownloader](https://github.com/xuejianxianzun/PixivBatchDownloader) - Browser extension version
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) - OAuth authentication implementation reference

### Thanks to All Contributors 🎉

---

## 📮 Get Help

Having issues? Here are multiple ways to get help:

| Type | Channel | Description |
|------|---------|-------------|
| 🐛 **Bug Report** | [GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues) | Report issues and bugs |
| 💡 **Feature Suggestion** | [GitHub Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | Propose new feature ideas |
| 📖 **Usage Questions** | [View Documentation](docs/README.md) | Read complete documentation |
| 🔧 **Auto-Fix Issues** | `./scripts/pixiv.sh check --fix` | Auto-fix environment issues ⭐ New |
| 🔄 **Update & Fix** | `./scripts/pixiv.sh update` | One-click update and fix ⭐ New |
| ✅ **Environment Check** | `./scripts/pixiv.sh health` | Run health check |
| 💬 **Community Discussion** | [Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | Discuss with other users |
| 🔍 **FAQ** | [FAQ](#-faq) | View FAQ |

### Search Keywords

If you're looking for similar tools, these keywords might help:

- `pixiv downloader` - Pixiv downloader
- `pixiv batch download` - Pixiv batch download
- `pixiv automation` - Pixiv automation
- `pixiv cli` - Pixiv CLI tool
- `pixiv api` - Pixiv API client
- `pixiv scheduler` - Pixiv scheduled tasks
- `pixiv artwork downloader` - Pixiv artwork downloader
- `pixiv novel downloader` - Pixiv novel downloader

### Before Asking:

1. 🔍 Check [FAQ](#-faq) section
2. 📖 Read relevant documentation
3. ✅ Run health check `pixivflow health`
4. 📋 View run logs `./scripts/pixiv.sh logs`

---

## 📈 Project Statistics

<div align="center">

### Project Data

![GitHub repo size](https://img.shields.io/github/repo-size/zoidberg-xgd/pixivflow?style=flat-square)
![GitHub language count](https://img.shields.io/github/languages/count/zoidberg-xgd/pixivflow?style=flat-square)
![GitHub top language](https://img.shields.io/github/languages/top/zoidberg-xgd/pixivflow?style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/zoidberg-xgd/pixivflow?style=flat-square)

</div>

### Performance Metrics

- ⚡ **Startup Speed**: < 2 seconds
- 📦 **Package Size**: < 5 MB (excluding dependencies)
- 💾 **Memory Usage**: < 100 MB (runtime)
- 🔄 **Download Speed**: Supports concurrent downloads, auto rate limiting
- 📊 **Database**: SQLite, lightweight, no additional service needed

---

## 🤝 Contributing

We welcome all forms of contributions! Whether it's reporting bugs, proposing features, or submitting code, we're very grateful.

### How to Contribute

1. **Fork the Project**
2. **Create Feature Branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit Changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to Branch** (`git push origin feature/AmazingFeature`)
5. **Open Pull Request**

### Contributing Guide

See [CONTRIBUTING.md](docs/project/CONTRIBUTING.md) for detailed contributing guide, including:
- Code of Conduct
- Development environment setup
- Code standards
- Commit standards
- Pull Request process

---

## 📝 Changelog

See [CHANGELOG.md](docs/project/CHANGELOG.md) for detailed version update records.

---

## Support the Project

If this project helps you, please consider:

- ⭐ **Give the Project a Star** - Let more people discover this project
- 🍴 **Fork the Project** - Create your own version
- 🐛 **Report Bugs** - Help us improve
- 💡 **Propose Suggestions** - Share your ideas
- 📢 **Share with More People** - Let more people benefit
- 💻 **Contribute Code** - Participate in project development

<div align="center">

### ⭐ Star This Project

**[⭐ Star on GitHub](https://github.com/zoidberg-xgd/pixivflow)** - Let more people discover PixivFlow!

---

Made with ❤️ by [zoidberg-xgd](https://github.com/zoidberg-xgd)

**PixivFlow** - Make Pixiv artwork collection elegant and efficient

[⬆ Back to Top](#-pixivflow)

</div>

