# 🎨 PixivFlow

<div align="center">

**Intelligent Pixiv Automation Downloader | 智能的 Pixiv 自动化下载工具**

Make Pixiv artwork collection elegant and efficient | 让 Pixiv 作品收集变得优雅而高效

[![GitHub stars](https://img.shields.io/github/stars/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/network/members)
[![GitHub issues](https://img.shields.io/github/issues/zoidberg-xgd/pixivflow?style=for-the-badge&logo=github)](https://github.com/zoidberg-xgd/pixivflow/issues)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/gpl-3.0)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow)
[![Maintenance](https://img.shields.io/badge/Maintained-yes-green.svg?style=flat-square)](https://github.com/zoidberg-xgd/pixivflow/graphs/commit-activity)

[Quick Start](#-quick-start) • [Features](#-features) • [Documentation](#-documentation) • [Scripts](#-script-tools) • [Use Cases](#-use-cases)

[English](#) | [中文](README.md)

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
- [🛠️ Script Tools](#️-script-tools)
  - [🎯 Main Control Script (Most Used)](#-main-control-script-most-used)
  - [🔐 Login Management](#-login-management)
  - [⚙️ Configuration Management](#️-configuration-management)
  - [📊 Monitoring and Maintenance](#-monitoring-and-maintenance)
  - [🚀 Deployment and Backup](#-deployment-and-backup)
  - [🐳 Docker Management](#-docker-management)
  - [🎨 Advanced CLI Tool](#-advanced-cli-tool)
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
| **🌐 WebUI Management** | Modern web management interface with file preview, real-time logs, and task management |
| **📊 Statistics Reports** | Detailed run logs and download statistics |

### 🎁 Additional Advantages

- ✅ **Fully Standalone**: No browser required, pure CLI tool
- ✅ **WebUI Support**: Modern web management interface with graphical operations
- ✅ **Cross-Platform**: Windows / macOS / Linux support
- ✅ **Lightweight**: Low resource usage, suitable for long-term server running
- ✅ **Open Source**: GPL-3.0 license, free to customize and distribute
- ✅ **Type Safe**: Written in TypeScript with complete type hints
- ✅ **Well Documented**: Detailed documentation and tutorials

---

## 🚀 Quick Start

### 📋 Requirements

**Required Environment**:
- Node.js 18+ and npm 9+
- A Pixiv account

**Login Functionality (Only needed for first-time login)**:
- Python 3.9+ and `gppt` package (`pip install gppt`)
  - ⚠️ **Note**: Python is only used for first-time login to obtain refresh token, not a required dependency for running the project
  - If already logged in (have refresh token), Python is not needed
  - If refresh token expires, Python is needed only when re-logging in

### 🎬 Quick Start (Recommended)

**The simplest way - one-click setup**:

```bash
# 1. Install dependencies
npm install

# 2. Run quick start script (auto completes login, config, test)
./scripts/quick-start.sh
```

That's it! The quick start script will automatically guide you through:
- ✅ Environment check and dependency installation
- ✅ Pixiv account login
- ✅ Download configuration setup
- ✅ Test download verification

---

### 🌐 Global Installation (Recommended ⭐)

If you want to use `pixivflow` command from any directory, you can install it globally:

#### Method 1: Install from Local Directory

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

#### Method 2: Install Directly from GitHub Repository

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
- ✅ **Interactive login mode** (default): Opens browser window, manual login in browser
  - Uses Python gppt library, which internally uses Selenium to open browser window
  - Suitable for: Cases requiring manual CAPTCHA or security verification
- ✅ **Headless login mode**: Runs browser in background, automatically enters username and password
  - Uses Python gppt library, which internally uses Selenium to run browser in background
  - Requires `-u` and `-p` parameters (username and password)
  - Suitable for: Server environments or automation scenarios
- ✅ Auto update config: Automatically updates refresh token in config after successful login
- ✅ Setup wizard: Use `npm run setup` for interactive configuration

**About Python Dependency**:
- 🔐 **Only for login**: Python and gppt are only used for first-time login to obtain refresh token
  - Both login modes use Python gppt library
  - gppt internally uses Selenium to automate browser (interactive mode opens window, headless mode runs in background)
- ✅ **Not needed after login**: If already logged in (have refresh token), Python is not needed
- 🔄 **When token expires**: If refresh token expires, Python is needed only when re-logging in
- 💡 **Alternative**: You can complete first-time login on a machine with Python installed, then copy the refresh token to the config file

**Login Mode Details**:
- **Default mode** (`npm run login`): Opens browser window, manual login in browser
- **Headless mode** (`npm run login -- -u username -p password`): No browser window, automatic login with provided credentials

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
> ✅ **Verified**: Test scripts have been verified and can download artworks normally. See [TEST_GUIDE.md](docs/guides/TEST_GUIDE.md) for detailed test results.

---

### 🌐 Using WebUI (Optional)

PixivFlow also provides a modern web management interface with graphical operations:

**Development Mode (Frontend-Backend Separation):**
```bash
# 1. Start WebUI backend
npm run webui

# 2. Start frontend in another terminal
npm run webui:frontend
```

Then visit http://localhost:5173 to use the WebUI (frontend development server).

**Production Mode (Single Server):**
```bash
# 1. Build frontend
npm run webui:build

# 2. Start WebUI (automatically serves frontend static files)
STATIC_PATH=webui-frontend/dist npm run webui
```

Then visit http://localhost:3000 to use the WebUI (backend server).

> **Note**:
> - Development mode uses Vite dev server (port 5173), production mode uses Express server (port 3000)
> - Docker deployment uses production mode, frontend static files are built into the image, access port is 3000
> - For detailed Docker deployment instructions, see [Docker Usage Guide](docs/docker/DOCKER.md) and [WebUI Setup Guide](docs/webui/WEBUI_SETUP.md)

**WebUI API Endpoints**:
- Root path `GET /` - Returns API info (when static files not configured)
- Health check `GET /api/health` - Server health status
- Authentication `GET /api/auth/*` - Login, logout, status query
- Config management `GET /api/config` - Get and update config
- Download tasks `POST /api/download/*` - Start, stop, query download tasks
- Statistics `GET /api/stats/*` - Download stats, tag stats, author stats
- Log viewing `GET /api/logs` - Get logs, WebSocket real-time log stream
- File browsing `GET /api/files/*` - File list, preview, delete

**WebUI Features**:
- 📊 Download statistics and overview
- 📁 File browsing and preview (supports special characters in filenames like Japanese, Chinese)
- 📝 Real-time log viewing
- ⚙️ Configuration management
- 🎯 Task management (start/stop downloads)
- 📈 Download history viewing

For detailed instructions, see [WebUI Usage Guide](docs/webui/WEBUI_README.md) and [WebUI Setup Guide](docs/webui/WEBUI_SETUP.md).

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

For detailed instructions, see [Docker Usage Guide](docs/docker/DOCKER.md).

**Related Documentation**:
- [Docker Usage Guide](docs/docker/DOCKER.md) - Complete Docker deployment and usage instructions
- [Docker Network Solution](docs/docker/DOCKER_NETWORK_SOLUTION.md) - Solve proxy connection issues
- [Docker Random Download Fix](docs/docker/DOCKER_RANDOM_DOWNLOAD_FIX.md) - Solve random download related issues

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

# Configuration file management
./scripts/config-manager.sh backup    # Backup config
./scripts/config-manager.sh restore   # Restore config
./scripts/config-manager.sh validate  # Validate config
./scripts/config-manager.sh edit      # Edit config

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

### 📊 Monitoring and Maintenance

```bash
# Auto monitor (continuously monitor running status)
./scripts/auto-monitor.sh

# Auto maintenance (clean logs, optimize database)
./scripts/auto-maintain.sh

# Detailed health check
./scripts/health-check.sh
```

### 🚀 Deployment and Backup

```bash
# Auto deploy to server
./scripts/auto-deploy.sh

# Auto backup config and data
./scripts/auto-backup.sh
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

For detailed instructions, see [Docker Usage Guide](docs/docker/DOCKER.md).

**Related Documentation**:
- [Docker Usage Guide](docs/docker/DOCKER.md) - Complete Docker deployment and usage instructions
- [Docker Network Solution](docs/docker/DOCKER_NETWORK_SOLUTION.md) - Solve proxy connection issues
- [Docker Random Download Fix](docs/docker/DOCKER_RANDOM_DOWNLOAD_FIX.md) - Solve random download related issues

### 🎨 Advanced CLI Tool

```bash
# Use full CLI tool (directly calls built-in functions)
./scripts/pixiv-cli.sh <command>

# Available commands:
./scripts/pixiv-cli.sh login [options]    # Login
./scripts/pixiv-cli.sh refresh <token>     # Refresh token
./scripts/pixiv-cli.sh download            # Execute download
./scripts/pixiv-cli.sh random              # Random download
./scripts/pixiv-cli.sh scheduler            # Start scheduled task
./scripts/pixiv-cli.sh stats               # View statistics
./scripts/pixiv-cli.sh export              # Export data
```

**💡 Tips**:
- All scripts support `--help` to view detailed usage
- Scripts directly call built-in CLI (`dist/index.js`), no need to go through npm, better performance
- Recommend using `./scripts/pixiv.sh` as main entry point

Detailed guide: [Script Usage Guide](docs/scripts/SCRIPTS_GUIDE.md)

---

## 📚 Documentation

### 🌟 Must Read for Beginners

| Document | Description |
|----------|-------------|
| [📚 TUTORIAL](docs/getting-started/TUTORIAL.md) | **Complete Tutorial**: From login to download to scheduled tasks, detailed teaching |
| [📖 START_HERE](docs/getting-started/START_HERE.md) | Complete beginner guide, from scratch |
| [⚡ QUICKSTART](docs/getting-started/QUICKSTART.md) | 3-minute quick start |
| [🔐 LOGIN_GUIDE](docs/guides/LOGIN_GUIDE.md) | Login process details |
| [🧪 TEST_GUIDE](docs/guides/TEST_GUIDE.md) | Testing and troubleshooting |

### 📘 Advanced Documentation

| Document | Description |
|----------|-------------|
| [📋 CONFIG_GUIDE](docs/guides/CONFIG_GUIDE.md) | Configuration file usage guide |
| [⚙️ STANDALONE-SETUP-GUIDE](docs/guides/STANDALONE-SETUP-GUIDE.md) | Complete configuration options |
| [📊 RANKING_DOWNLOAD_GUIDE](docs/guides/RANKING_DOWNLOAD_GUIDE.md) | Ranking download guide |
| [🔄 CONFIG-PATH-MIGRATION](docs/guides/CONFIG-PATH-MIGRATION.md) | Configuration path migration guide |
| [🛠️ SCRIPTS_GUIDE](docs/scripts/SCRIPTS_GUIDE.md) | All scripts detailed guide |
| [🌐 WEBUI_README](docs/webui/WEBUI_README.md) | WebUI usage guide |
| [🚀 WEBUI_SETUP](docs/webui/WEBUI_SETUP.md) | WebUI setup guide |

### 🐳 Docker Documentation

| Document | Description |
|----------|-------------|
| [🐳 DOCKER](docs/docker/DOCKER.md) | Docker usage guide |
| [🔧 DOCKER_NETWORK_SOLUTION](docs/docker/DOCKER_NETWORK_SOLUTION.md) | Docker network issue solution |
| [🔧 DOCKER_RANDOM_DOWNLOAD_FIX](docs/docker/DOCKER_RANDOM_DOWNLOAD_FIX.md) | Docker random download issue solution |

### 📄 Project Documentation

| Document | Description |
|----------|-------------|
| [📝 CHANGELOG](docs/project/CHANGELOG_EN.md) | Version changelog |
| [📝 CHANGELOG (中文)](docs/project/CHANGELOG.md) | 版本更新日志 |
| [🤝 CONTRIBUTING](docs/project/CONTRIBUTING_EN.md) | Contributing guide |
| [🤝 CONTRIBUTING (中文)](docs/project/CONTRIBUTING.md) | 贡献指南 |

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

> **💡 Tip**: All download tasks are implemented through configuration files, no need to modify source code. See [Configuration File Usage Guide](docs/guides/CONFIG_GUIDE.md) for details.

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
│   │   ├── easy-setup.sh            # Setup wizard (recommended)
│   │   ├── config-manager.sh        # Config management
│   │   ├── health-check.sh          # Health check
│   │   ├── auto-monitor.sh          # Auto monitor
│   │   ├── auto-maintain.sh         # Auto maintenance
│   │   ├── auto-backup.sh           # Auto backup
│   │   └── auto-deploy.sh           # Auto deploy
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

**Complete Configuration Guide**: See [Configuration Guide](docs/guides/STANDALONE-SETUP-GUIDE.md) and [Configuration File Usage Guide](docs/guides/CONFIG_GUIDE.md)

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
./scripts/config-manager.sh validate

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
| ✅ **Regular Backups** | Use `./scripts/auto-backup.sh` to backup config and data |
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
# Use maintenance script (recommended)
./scripts/auto-maintain.sh

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
| 📖 **Usage Questions** | [View Documentation](docs/getting-started/START_HERE.md) | Read complete documentation |
| 🔧 **Auto-Fix Issues** | `./scripts/pixiv.sh check --fix` | Auto-fix environment issues ⭐ New |
| 🔄 **Update & Fix** | `./scripts/pixiv.sh update` | One-click update and fix ⭐ New |
| ✅ **Environment Check** | `./scripts/pixiv.sh health` | Run health check |
| 💬 **Community Discussion** | [Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | Discuss with other users |
| 📚 **Complete Tutorial** | [TUTORIAL.md](docs/getting-started/TUTORIAL.md) | Detailed usage tutorial |
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
3. ✅ Run health check `./scripts/health-check.sh`
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

See [CONTRIBUTING_EN.md](docs/project/CONTRIBUTING_EN.md) for detailed contributing guide, including:
- Code of Conduct
- Development environment setup
- Code standards
- Commit standards
- Pull Request process

---

## 📝 Changelog

See [CHANGELOG_EN.md](docs/project/CHANGELOG_EN.md) for detailed version update records.

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

