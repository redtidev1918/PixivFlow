# 📦 构建和发布指南

本指南将帮助您构建可发布的 Electron 应用，让用户可以直接使用，无需安装 Node.js 或运行任何命令。

## 🎯 构建流程概览

构建过程分为三个步骤：
1. **构建后端** - 编译 TypeScript 后端代码
2. **构建前端** - 编译 React 前端代码
3. **打包 Electron** - 使用 electron-builder 打包成可执行文件

## 📋 前置要求

### 系统要求
- **macOS**: macOS 10.13+ (用于构建 macOS 版本)
- **Windows**: Windows 10+ (用于构建 Windows 版本)
- **Linux**: Ubuntu 18.04+ 或其他现代 Linux 发行版 (用于构建 Linux 版本)

### 软件要求
- Node.js 18.0.0 或更高版本
- npm 9.0.0 或更高版本
- Git (可选，用于版本控制)

### 安装依赖

在项目根目录和 `webui-frontend` 目录分别安装依赖：

```bash
# 在项目根目录安装后端依赖
cd /path/to/PixivBatchDownloader-master
npm install

# 在 webui-frontend 目录安装前端依赖
cd webui-frontend
npm install
```

## 🚀 快速构建

### macOS (Apple Silicon - M1/M2/M3)

```bash
cd webui-frontend
npm run electron:build:mac
```

### macOS (Intel)

修改 `package.json` 中的 `electron:build:mac` 脚本，将 `--arm64` 改为 `--x64`，然后运行：

```bash
cd webui-frontend
npm run electron:build:mac
```

### Windows

```bash
cd webui-frontend
npm run electron:build:win
```

### Linux

```bash
cd webui-frontend
npm run electron:build:linux
```

### 通用构建（自动检测平台）

```bash
cd webui-frontend
npm run electron:build
```

## 📝 详细构建步骤

如果您想手动控制每个步骤，可以按以下步骤操作：

### 步骤 1: 构建后端

在项目根目录运行：

```bash
cd /path/to/PixivBatchDownloader-master
npm run build
```

这将编译 TypeScript 代码到 `dist/` 目录。

### 步骤 2: 构建前端

在 `webui-frontend` 目录运行：

```bash
cd webui-frontend
npm run build
```

这将编译 React 代码到 `webui-frontend/dist/` 目录。

### 步骤 3: 打包 Electron 应用

在 `webui-frontend` 目录运行：

```bash
# macOS (arm64)
npx electron-builder --mac --arm64

# macOS (x64)
npx electron-builder --mac --x64

# Windows
npx electron-builder --win

# Linux
npx electron-builder --linux
```

## 📂 构建输出

构建完成后，可执行文件将位于：

```
webui-frontend/release/
```

### macOS
- **DMG 安装包**: `PixivFlow-1.0.0-arm64.dmg`
- **应用包**: `PixivFlow-1.0.0-arm64.dmg` (安装后位于 `/Applications/PixivFlow.app`)

### Windows
- **安装程序**: `PixivFlow Setup 1.0.0-x64.exe`
- **便携版**: `PixivFlow-1.0.0-x64.exe` (如果配置了 portable 版本)

### Linux
- **AppImage**: `PixivFlow-1.0.0-x64.AppImage`

## 🔧 高级构建选项

### 使用详细日志构建

```bash
cd webui-frontend
DEBUG=electron-builder:* npm run electron:build:mac
```

### 仅打包不创建安装程序（用于测试）

```bash
cd webui-frontend
npm run electron:pack
```

这将创建未打包的应用目录，位于 `webui-frontend/release/mac-arm64/PixivFlow.app` (macOS) 或类似位置。

### 使用增强构建脚本

项目提供了几个增强的构建脚本：

```bash
# 使用增强的 Node.js 构建脚本（推荐）
cd webui-frontend
npm run electron:build:mac:enhanced

# 使用 Shell 脚本构建（带详细日志）
cd webui-frontend
npm run electron:build:mac:verbose

# 使用简单构建脚本
cd webui-frontend
npm run electron:build:mac:simple
```

## ✅ 构建前检查

运行构建环境检查脚本：

```bash
cd webui-frontend
npm run electron:check
```

这将检查：
- Node.js 和 npm 版本
- 必要的依赖是否已安装
- 构建目录是否存在
- 后端和前端是否已构建

## 🐛 常见问题

### 问题 1: 构建失败 - 找不到后端文件

**错误信息**: `❌ 无法启动后端：后端文件不存在`

**解决方案**:
1. 确保已在项目根目录运行 `npm run build`
2. 检查 `dist/webui/index.js` 文件是否存在
3. 重新运行构建命令

### 问题 2: 构建失败 - 找不到前端文件

**错误信息**: `❌ 无法启动后端：静态文件目录不存在`

**解决方案**:
1. 确保已在 `webui-frontend` 目录运行 `npm run build`
2. 检查 `webui-frontend/dist/` 目录是否存在
3. 重新运行构建命令

### 问题 3: electron-builder 下载缓慢

**解决方案**:
1. 使用代理（如果可用）：
   ```bash
   export https_proxy=http://your-proxy:port
   export http_proxy=http://your-proxy:port
   ```

2. 或使用国内镜像（如果在中国）：
   ```bash
   export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
   ```

### 问题 4: macOS 构建需要代码签名

如果您要发布到 App Store 或让用户信任应用，需要代码签名：

1. 在 `electron-builder.yml` 中添加签名配置
2. 设置环境变量：
   ```bash
   export CSC_LINK=/path/to/certificate.p12
   export CSC_KEY_PASSWORD=your_password
   ```

### 问题 5: 应用启动后显示空白页面

**可能原因**:
1. 后端未正确启动
2. 静态文件路径不正确

**解决方案**:
1. 查看应用日志（macOS: `~/Library/Logs/PixivFlow/`）
2. 检查后端进程是否正在运行
3. 确保构建时包含了所有必要的文件

## 📦 发布准备

### 版本号管理

在 `webui-frontend/package.json` 中更新版本号：

```json
{
  "version": "1.0.0"
}
```

### 应用图标

确保以下图标文件存在（可选，如果不存在将使用默认图标）：
- `webui-frontend/build/icon.icns` (macOS)
- `webui-frontend/build/icon.ico` (Windows)
- `webui-frontend/build/icon.png` (Linux)

### 测试构建

在发布前，务必测试构建的应用：

1. **安装测试**: 安装 DMG/EXE/AppImage
2. **功能测试**: 测试所有主要功能
3. **性能测试**: 检查内存和 CPU 使用情况
4. **兼容性测试**: 在不同操作系统版本上测试

## 🚢 发布流程

### 1. 更新版本号

```bash
cd webui-frontend
# 编辑 package.json，更新 version 字段
```

### 2. 构建所有平台

```bash
# macOS
npm run electron:build:mac

# Windows (需要在 Windows 系统上)
npm run electron:build:win

# Linux
npm run electron:build:linux
```

### 3. 测试构建产物

- 在干净的系统上安装并测试
- 确保所有功能正常工作
- 检查文件大小是否合理

### 4. 创建发布说明

创建 `CHANGELOG.md` 或更新 GitHub Releases 说明，包括：
- 新功能和改进
- 修复的问题
- 已知问题
- 系统要求

### 5. 上传发布文件

- GitHub Releases
- 自己的网站
- 应用商店（如果适用）

## 📊 构建配置

主要配置文件：
- `webui-frontend/electron-builder.yml` - electron-builder 配置
- `webui-frontend/package.json` - 项目配置和脚本
- `webui-frontend/electron/main.cjs` - Electron 主进程代码

## 🔍 验证构建

构建完成后，验证以下内容：

1. ✅ 应用可以正常启动
2. ✅ 后端服务器正常启动
3. ✅ 前端界面正常显示
4. ✅ 所有功能正常工作
5. ✅ 文件大小合理（通常 100-200MB）
6. ✅ 安装/卸载流程正常

## 💡 提示

- **首次构建较慢**: 首次构建需要下载 Electron 二进制文件，可能需要几分钟
- **后续构建更快**: 后续构建会使用缓存，速度更快
- **清理构建**: 如需完全重新构建，删除 `webui-frontend/release/` 和 `webui-frontend/dist/` 目录
- **增量构建**: 只修改代码时，只需重新运行 `npm run build`，然后重新打包

## 📞 获取帮助

如果遇到问题：
1. 查看构建日志中的错误信息
2. 运行 `npm run electron:check` 检查环境
3. 查看 [electron-builder 文档](https://www.electron.build/)
4. 在项目 Issues 中搜索类似问题

---

**祝您构建顺利！** 🎉

