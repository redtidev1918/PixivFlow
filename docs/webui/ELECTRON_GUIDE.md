# 🖥️ PixivFlow Electron 桌面应用指南

PixivFlow WebUI 现在支持打包为 Electron 桌面应用。

## 📋 前置要求

- Node.js 18+ 和 npm 9+
- 已安装项目依赖
- 已构建后端项目（`npm run build`）

## 🔧 安装步骤

### 1. 安装依赖

```bash
# 在项目根目录安装后端依赖
npm install

# 安装前端依赖（包括 Electron）
cd webui-frontend
npm install
cd ..
```

### 2. 构建后端

```bash
# 构建后端 TypeScript 代码
npm run build
```

### 3. 准备图标文件（可选）

为了构建带有自定义图标的应用程序，您需要在 `webui-frontend/build/` 目录下放置以下图标文件：

- `icon.ico` - Windows 图标（256x256 或更大）
- `icon.icns` - macOS 图标（1024x1024）
- `icon.png` - Linux 图标（512x512 或更大）

如果没有提供图标文件，electron-builder 会使用默认图标。

详细说明请参考：[build/README.md](../../webui-frontend/build/README.md)

## 🚀 开发模式

在开发模式下运行 Electron 应用：

```bash
cd webui-frontend

# 1. 构建前端
npm run build

# 2. 启动 Electron 开发模式
npm run electron:dev
```

开发模式会：
- 自动启动后端服务器（如果未运行）
- 打开 Electron 窗口显示 WebUI
- 支持热重载（需要手动刷新窗口）

## 📦 构建桌面应用

### 构建所有平台

```bash
cd webui-frontend
npm run electron:build
```

### 构建特定平台

```bash
# Windows
npm run electron:build:win

# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

### 仅打包（不生成安装程序）

```bash
npm run electron:pack
```

构建完成后，安装包会在 `webui-frontend/release/` 目录下。

## 📁 构建输出

构建完成后，您会在 `webui-frontend/release/` 目录下找到：

### Windows
- `PixivFlow Setup x.x.x.exe` - NSIS 安装程序
- `PixivFlow x.x.x.exe` - 便携版（如果配置了）

### macOS
- `PixivFlow-x.x.x.dmg` - DMG 安装镜像
- `PixivFlow-x.x.x-mac.zip` - ZIP 压缩包

### Linux
- `PixivFlow-x.x.x.AppImage` - AppImage 可执行文件

## ⚙️ 配置说明

### Electron 主进程配置

主进程文件位于 `webui-frontend/electron/main.js`，负责：
- 创建和管理应用窗口
- 启动后端服务器
- 处理应用生命周期事件

### 预加载脚本

预加载脚本位于 `webui-frontend/electron/preload.js`，用于：
- 在渲染进程中暴露安全的 API
- 桥接主进程和渲染进程之间的通信

### 构建配置

构建配置位于 `webui-frontend/electron-builder.yml`，包含：
- 应用信息（ID、名称、版权等）
- 平台特定配置（图标、权限等）
- 打包选项（文件包含、资源等）

## 🔍 工作原理

1. **后端集成**：Electron 应用会自动启动后端服务器（如果未运行）
2. **前端加载**：Electron 窗口加载构建后的前端静态文件
3. **API 通信**：前端通过 HTTP 和 WebSocket 与后端通信
4. **文件系统**：应用可以访问本地文件系统，用于下载和管理文件

## 🐛 故障排除

### 问题：构建失败，提示找不到图标

**解决方案**：
- 检查 `webui-frontend/build/` 目录下是否有图标文件
- 如果没有图标，electron-builder 会使用默认图标，但某些平台可能需要显式提供
- 参考 [build/README.md](../../webui-frontend/build/README.md) 创建图标文件

### 问题：应用启动后无法连接到后端

**解决方案**：
1. 确保后端已构建（`npm run build`）
2. 检查后端服务器是否正常启动
3. 查看 Electron 控制台错误信息（在开发模式下按 `Cmd/Ctrl + Shift + I`）

### 问题：macOS 构建需要代码签名

**解决方案**：
- 开发版本可以禁用代码签名（已在配置中设置 `gatekeeperAssess: false`）
- 发布版本需要配置代码签名，在 `electron-builder.yml` 中添加签名配置

### 问题：Windows 构建需要管理员权限

**解决方案**：
- 已配置为 `asInvoker`，不需要管理员权限
- 如果仍有问题，检查 `electron-builder.yml` 中的 `requestedExecutionLevel` 设置

## 📝 开发建议

### 开发流程

1. **修改前端代码**：
   ```bash
   cd webui-frontend
   npm run dev  # 在浏览器中测试
   ```

2. **测试 Electron**：
   ```bash
   npm run build
   npm run electron:dev
   ```

3. **构建发布版本**：
   ```bash
   npm run electron:build
   ```

### 调试技巧

- 在开发模式下，使用 `Cmd/Ctrl + Shift + I` 打开开发者工具
- 查看主进程日志：在终端中运行 `npm run electron:dev` 可以看到后端日志
- 检查网络请求：在开发者工具的 Network 标签中查看 API 请求

## 🔐 安全注意事项

- Electron 应用可以访问本地文件系统，请确保只访问必要的目录
- 预加载脚本使用上下文隔离，确保安全性
- macOS 应用已配置必要的权限（网络访问、文件访问等）

## 📚 相关文档

- [WebUI 使用指南](./WEBUI_README.md)
- [构建资源说明](../../webui-frontend/build/README.md)

## 🎯 下一步

- 创建自定义应用图标
- 配置应用自动更新
- 添加系统托盘支持
- 配置应用菜单和快捷键


