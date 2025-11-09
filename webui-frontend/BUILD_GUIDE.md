# Electron 构建指南

## 🚀 快速开始

### 步骤 0: 检查构建环境（推荐）

在开始构建前，先检查环境是否就绪：

```bash
cd webui-frontend
npm run electron:check
# 或
./check-build-env.sh
```

这会检查：
- ✅ Node.js 和 npm 是否安装
- ✅ 依赖是否已安装
- ✅ Electron 和 electron-builder 是否就绪
- ✅ 前端和后端是否已构建
- ✅ 图标文件是否存在
- ✅ 磁盘空间是否充足

### 方式一：使用改进的构建脚本（推荐）

```bash
cd webui-frontend

# 使用代理构建（推荐）
./build-electron-simple.sh http://127.0.0.1:6152

# 或使用完整版脚本（带更多检查）
./build-electron.sh http://127.0.0.1:6152
```

### 方式二：使用 npm 脚本

```bash
cd webui-frontend

# 设置代理环境变量
export https_proxy=http://127.0.0.1:6152
export http_proxy=http://127.0.0.1:6152
export all_proxy=socks5://127.0.0.1:6153

# 构建（带详细输出）
npm run electron:build:mac:verbose

# 或直接构建（简洁输出）
npm run electron:build:mac
```

### 方式三：使用 electron-builder 直接命令

```bash
cd webui-frontend

# 设置代理
export https_proxy=http://127.0.0.1:6152
export http_proxy=http://127.0.0.1:6152

# 构建前端
npm run build

# 构建 Electron（带详细日志）
DEBUG=electron-builder:* electron-builder --mac --arm64
```

## 📋 构建步骤说明

改进的构建脚本会执行以下步骤：

1. **检查依赖** - 确保 node_modules 已安装
2. **构建前端** - 编译 TypeScript 和打包 Vite
3. **检查 Electron** - 确保 Electron 二进制文件已下载
4. **检查后端** - 确保后端已构建（`../../dist` 目录存在）
5. **打包应用** - 使用 electron-builder 创建 DMG 文件

## 🔍 查看构建进度

### 实时查看日志

构建脚本会自动显示进度，重要信息会高亮显示：
- 🔵 蓝色：一般信息
- 🟢 绿色：成功信息
- 🟡 黄色：警告信息
- 🔴 红色：错误信息

### 查看详细日志文件

```bash
# 构建日志保存在
/tmp/electron-build.log

# 实时查看
tail -f /tmp/electron-build.log
```

## ⚙️ 配置说明

### 代理设置

如果网络较慢，建议使用代理：

```bash
# HTTP 代理
export https_proxy=http://127.0.0.1:6152
export http_proxy=http://127.0.0.1:6152

# SOCKS5 代理
export all_proxy=socks5://127.0.0.1:6153
```

### 架构选择

当前配置仅构建 **arm64** 架构（Apple Silicon Mac）。

如需构建 x64 版本，修改 `electron-builder.yml`：

```yaml
mac:
  target:
    - target: dmg
      arch:
        - x64  # 或同时包含 arm64 和 x64
```

### 缓存配置

Electron 二进制文件缓存位置：
- macOS: `~/Library/Caches/electron/`
- 构建缓存: `/tmp/electron-builder-cache`

## 🐛 常见问题

### 1. 构建卡住不动

**原因**：可能是在下载 Electron 二进制文件或编译原生模块

**解决方案**：
- 使用代理加速下载
- 检查网络连接
- 查看详细日志：`DEBUG=electron-builder:* npm run electron:build:mac`

### 2. Electron 下载失败

**解决方案**：
```bash
# 手动下载 Electron
cd webui-frontend
npm install electron --force

# 或使用国内镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install electron --force
```

### 3. 找不到后端文件

**解决方案**：
```bash
# 在项目根目录构建后端
cd ../..
npm run build
cd webui-frontend
```

### 4. 权限错误

**解决方案**：
```bash
# 确保脚本有执行权限
chmod +x build-electron.sh
chmod +x build-electron-simple.sh
```

## 📦 输出文件

构建完成后，在 `webui-frontend/release/` 目录下会生成：

- `PixivFlow-x.x.x.dmg` - macOS 安装镜像
- `PixivFlow-x.x.x-mac.zip` - ZIP 压缩包（可选）

## 🔗 参考资源

- [electron-builder 官方文档](https://www.electron.build/)
- [Electron 官方文档](https://www.electronjs.org/)
- 参考项目：VSCode、Obsidian、Discord 等开源 Electron 应用

