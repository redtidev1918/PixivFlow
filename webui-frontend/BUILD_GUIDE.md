# 🚀 PixivFlow Electron 全平台构建指南

本指南介绍如何构建 PixivFlow Electron 应用的所有平台版本。

## 📋 前置要求

### 通用要求
- Node.js 18+ 和 npm 9+
- 已安装项目依赖
- 至少 2GB 可用磁盘空间

### 平台特定要求

#### macOS
- macOS 10.13+ (用于构建 macOS 应用)
- Xcode Command Line Tools (用于代码签名，可选)

#### Windows
- Windows 10+ (用于构建 Windows 应用)
- 或在 macOS/Linux 上安装 Wine (用于跨平台构建)

#### Linux
- 任何 Linux 发行版 (用于构建 Linux 应用)
- 或在 macOS 上使用 Docker (用于跨平台构建)

## 🔧 安装步骤

### 1. 安装后端依赖

```bash
# 在项目根目录
cd /path/to/PixivBatchDownloader-master
npm install
```

### 2. 安装前端依赖

```bash
# 在 webui-frontend 目录
cd webui-frontend
npm install
```

### 3. 准备图标文件（可选）

为了构建带有自定义图标的应用程序，您需要在 `webui-frontend/build/` 目录下放置以下图标文件：

- `icon.ico` - Windows 图标（256x256 或更大）
- `icon.icns` - macOS 图标（1024x1024）
- `icon.png` - Linux 图标（512x512 或更大）

如果没有提供图标文件，electron-builder 会使用默认图标。

## 🏗️ 构建方法

### 方法 1: 使用构建脚本（推荐）

#### 构建所有平台

```bash
cd webui-frontend
bash build-all-platforms.sh
```

#### 构建特定平台

```bash
# 构建 Windows
bash build-all-platforms.sh win

# 构建 macOS
bash build-all-platforms.sh mac

# 构建 Linux
bash build-all-platforms.sh linux
```

#### 构建特定架构

```bash
# 构建 Windows x64
bash build-all-platforms.sh win x64

# 构建 macOS ARM64
bash build-all-platforms.sh mac arm64

# 构建 Linux x64
bash build-all-platforms.sh linux x64
```

### 方法 2: 使用 npm 脚本

#### 构建所有平台

```bash
cd webui-frontend
npm run electron:build:all
```

#### 构建 Windows

```bash
# 所有架构
npm run electron:build:win

# 特定架构
npm run electron:build:win:x64
npm run electron:build:win:ia32
npm run electron:build:win:arm64
```

#### 构建 macOS

```bash
# ARM64 (默认)
npm run electron:build:mac

# 特定架构
npm run electron:build:mac:arm64
npm run electron:build:mac:x64

# 所有架构
npm run electron:build:mac:all
```

#### 构建 Linux

```bash
# x64 (默认)
npm run electron:build:linux

# 特定架构
npm run electron:build:linux:x64
npm run electron:build:linux:arm64

# 所有架构
npm run electron:build:linux:all
```

## 📦 构建输出

构建完成后，您会在 `webui-frontend/release/` 目录下找到构建产物：

### Windows
- `PixivFlow Setup x.x.x-x64.exe` - NSIS 安装程序 (x64)
- `PixivFlow Setup x.x.x-ia32.exe` - NSIS 安装程序 (32位)
- `PixivFlow Setup x.x.x-arm64.exe` - NSIS 安装程序 (ARM64)

### macOS
- `PixivFlow-x.x.x-arm64.dmg` - DMG 安装镜像 (ARM64)
- `PixivFlow-x.x.x-x64.dmg` - DMG 安装镜像 (x64)
- `PixivFlow-x.x.x-arm64.zip` - ZIP 压缩包 (ARM64)
- `PixivFlow-x.x.x-x64.zip` - ZIP 压缩包 (x64)

### Linux
- `PixivFlow-x.x.x-x64.AppImage` - AppImage 格式 (x64)
- `PixivFlow-x.x.x-arm64.AppImage` - AppImage 格式 (ARM64)
- `PixivFlow-x.x.x-x64.deb` - Debian 包 (x64)
- `PixivFlow-x.x.x-arm64.deb` - Debian 包 (ARM64)
- `PixivFlow-x.x.x-x64.rpm` - RPM 包 (x64)
- `PixivFlow-x.x.x-arm64.rpm` - RPM 包 (ARM64)
- `PixivFlow-x.x.x-x64.tar.gz` - 压缩包 (x64)
- `PixivFlow-x.x.x-arm64.tar.gz` - 压缩包 (ARM64)

## 🚀 快速开始

最简单的构建流程：

```bash
# 1. 安装依赖
cd webui-frontend
npm install
cd ..
npm install

# 2. 检查环境
cd webui-frontend
npm run electron:check

# 3. 构建当前平台
npm run electron:build

# 4. 查看构建产物
ls -lh release/
```

## 📚 更多信息

- [Electron Builder 文档](https://www.electron.build/)
- [Electron 文档](https://www.electronjs.org/docs)
- [项目文档](../docs/webui/ELECTRON_GUIDE.md)
