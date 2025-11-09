# 构建脚本使用指南

本项目提供了多个构建脚本，每个都有不同的特点和用途。

## 📋 可用的构建脚本

### 1. `build-electron-simple.sh` (推荐) ⭐
**增强版 Bash 脚本** - 已添加进度条和详细日志

**特点：**
- ✅ 进度条显示
- ✅ 详细的日志记录（保存到 `~/.pixiv-downloader-build-logs/`）
- ✅ 错误捕获和报告
- ✅ 时间戳记录
- ✅ 彩色输出

**使用方法：**
```bash
# 基本使用
npm run electron:build:mac:simple

# 或直接运行
bash build-electron-simple.sh

# 使用代理
bash build-electron-simple.sh http://proxy.example.com:8080
```

**日志位置：**
- 完整日志：`~/.pixiv-downloader-build-logs/build_YYYYMMDD_HHMMSS.log`
- 错误日志：`~/.pixiv-downloader-build-logs/errors_YYYYMMDD_HHMMSS.log`

**查看日志：**
```bash
# 查看最近错误
tail -n 50 ~/.pixiv-downloader-build-logs/errors_*.log | tail -n 50

# 查看所有日志文件
ls -lth ~/.pixiv-downloader-build-logs/
```

---

### 2. `build-electron-enhanced.js` (实验性)
**Node.js 版本** - 使用开源工具提供更好的体验

**特点：**
- ✅ 使用 `ora` 提供优雅的加载动画
- ✅ 使用 `chalk` 提供彩色输出
- ✅ 结构化日志记录
- ✅ 更好的错误处理

**安装依赖（可选，但推荐）：**
```bash
npm install --save-dev ora chalk fs-extra
```

**使用方法：**
```bash
# 基本使用
npm run electron:build:mac:enhanced

# 或直接运行
node build-electron-enhanced.js

# 使用代理
node build-electron-enhanced.js http://proxy.example.com:8080
```

**注意：** 即使不安装 `ora` 和 `chalk`，脚本也能运行（会使用简单的回退实现）。

---

### 3. `build-electron.sh`
**完整版 Bash 脚本** - 包含更多检查和步骤

**使用方法：**
```bash
npm run electron:build:mac:verbose
```

---

## 🛠️ 安装推荐的开源工具

### 方案 1: 安装 Node.js 工具（用于 enhanced 脚本）
```bash
npm install --save-dev ora chalk fs-extra
```

### 方案 2: 安装系统工具（用于进度显示）
```bash
# macOS
brew install pv

# Linux
sudo apt-get install pv
```

### 方案 3: 使用 Electron Forge（完整解决方案）
```bash
npm install --save-dev @electron-forge/cli
npx electron-forge import
```

---

## 🔍 构建前检查

运行环境检查脚本：
```bash
npm run electron:check
```

这会检查：
- Node.js 和 npm 版本
- 依赖是否安装
- 构建资源是否存在
- 磁盘空间是否充足

---

## 📊 构建流程

所有脚本都执行以下步骤：

1. **构建前端** (`npm run build`)
   - 编译 TypeScript
   - 构建 Vite 项目

2. **检查后端**
   - 如果后端未构建，自动构建

3. **检查资源**
   - 检查图标文件
   - 检查配置文件

4. **打包 Electron**
   - 使用 electron-builder 打包
   - 生成 DMG/安装包

---

## 🐛 调试和错误处理

### 查看构建日志
```bash
# 查看最新的构建日志
ls -lth ~/.pixiv-downloader-build-logs/ | head -5

# 查看特定日志文件
tail -f ~/.pixiv-downloader-build-logs/build_20240101_120000.log

# 查看错误日志
cat ~/.pixiv-downloader-build-logs/errors_*.log
```

### 常见问题

1. **构建失败 - 依赖问题**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **构建失败 - Electron 下载问题**
   ```bash
   # 使用代理
   bash build-electron-simple.sh http://proxy.example.com:8080
   ```

3. **构建失败 - 权限问题**
   ```bash
   # macOS 需要代码签名权限
   # 检查 build/entitlements.mac.plist 文件
   ```

4. **查看详细错误**
   ```bash
   # 启用 electron-builder 调试模式
   DEBUG=electron-builder:* npm run electron:build:mac
   ```

---

## 📚 更多资源

- [构建工具文档](./BUILD_TOOLS.md) - 了解更多开源工具
- [Electron Builder 文档](https://www.electron.build/)
- [Electron 官方文档](https://www.electronjs.org/docs)

---

## 💡 推荐

- **日常使用：** `build-electron-simple.sh` - 功能完善，日志详细
- **想要更好体验：** `build-electron-enhanced.js` - 需要安装额外依赖
- **需要完整解决方案：** 考虑迁移到 Electron Forge


