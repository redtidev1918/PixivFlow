# 📱 Android/Termux 安装指南

本指南介绍如何在 Android 设备上使用 Termux 安装和运行 PixivFlow。

> ⚠️ **注意**：Termux 环境下的安装可能需要额外的构建工具，因为 `better-sqlite3` 需要原生编译。

---

## 📋 前置要求

### 1. 安装 Termux

从以下渠道之一安装 Termux：

- **F-Droid**（推荐）：https://f-droid.org/packages/com.termux/
- **GitHub Releases**：https://github.com/termux/termux-app/releases

> ⚠️ **重要**：不要从 Google Play 安装 Termux，该版本已停止维护。

### 2. 更新 Termux 包

```bash
pkg update && pkg upgrade
```

### 3. 安装基础工具

```bash
# 安装 Node.js 和 npm
pkg install nodejs npm

# 安装构建工具（编译 better-sqlite3 必需）
pkg install python3 make clang

# 验证安装
node --version   # 应显示 v18.0.0 或更高
npm --version    # 应显示 9.0.0 或更高
python3 --version
make --version
clang --version
```

---

## 🚀 安装 PixivFlow

### 方式 1：本地安装（推荐 ⭐）

在 Termux 中，推荐使用本地安装而不是全局安装，以避免权限和路径问题：

```bash
# 1. 创建项目目录
mkdir -p ~/pixivflow
cd ~/pixivflow

# 2. 安装 PixivFlow
npm install pixivflow

# 3. 验证安装
npx pixivflow --help
```

**使用方式**：

```bash
# 在项目目录中运行
cd ~/pixivflow
npx pixivflow login
npx pixivflow download
```

### 方式 2：全局安装（需要解决编译问题）

如果必须全局安装，需要先解决 `better-sqlite3` 的编译问题：

#### 步骤 1：设置环境变量

```bash
# 设置 Python 路径
export PYTHON=$(which python3)

# 设置构建工具路径
export PATH=$PATH:/data/data/com.termux/files/usr/bin
```

#### 步骤 2：安装全局包

```bash
# 尝试全局安装
npm install -g pixivflow
```

#### 步骤 3：如果仍然失败

如果遇到 `android_ndk_path` 错误，可以尝试：

```bash
# 方法 1：设置 node-gyp 配置
npm config set python $(which python3)

# 方法 2：手动编译 better-sqlite3
npm install -g better-sqlite3 --build-from-source

# 然后再安装 pixivflow
npm install -g pixivflow
```

---

## 🔧 解决编译问题

### 问题：`gyp: Undefined variable android_ndk_path`

这是 `better-sqlite3` 在 Android 环境下编译时的常见问题。

#### 解决方案 1：使用预编译版本（如果可用）

```bash
# 检查是否有预编译的二进制文件
npm install better-sqlite3 --prefer-offline

# 如果失败，继续使用方案 2
```

#### 解决方案 2：手动配置 node-gyp

```bash
# 创建 node-gyp 配置目录
mkdir -p ~/.cache/node-gyp

# 设置环境变量
export npm_config_node_gyp=$(npm prefix -g)/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js

# 尝试安装
npm install -g pixivflow --build-from-source
```

#### 解决方案 3：从源码安装

```bash
# 1. 克隆仓库
git clone https://github.com/redtidev1918/PixivFlow.git
cd pixivflow

# 2. 安装依赖（本地编译）
npm install

# 3. 构建项目
npm run build

# 4. 使用本地构建的版本
npm start
```

---

## 📝 配置和使用

### 1. 登录账号

```bash
# 本地安装方式
cd ~/pixivflow
npx pixivflow login

# 或全局安装方式
pixivflow login
```

### 2. 配置下载目标

编辑配置文件（通常在 `~/pixivflow/config/standalone.config.json` 或 `~/.config/pixivflow/standalone.config.json`）：

```bash
# 使用 nano 编辑器
nano ~/.config/pixivflow/standalone.config.json
```

配置示例：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

### 3. 开始下载

```bash
# 本地安装方式
cd ~/pixivflow
npx pixivflow download

# 或全局安装方式
pixivflow download
```

---

## ⚠️ 已知限制

### 1. Puppeteer 支持

Termux 环境下，Puppeteer（无头浏览器）可能无法正常工作，因为：

- Android 系统限制
- 缺少必要的系统库
- Chromium 无法在 Android 上运行

**解决方案**：使用 `pixiv-token-getter`（Node.js 库）进行登录，这是默认方式，不需要 Puppeteer。

### 2. 文件系统权限

Termux 的文件系统访问可能受到 Android 系统限制：

- 只能访问 Termux 的私有目录（`~/`）
- 需要 Android 11+ 的存储访问权限才能访问外部存储

**建议**：将下载目录设置在 Termux 目录内：

```json
{
  "storage": {
    "illustrationDir": "~/downloads/illustrations",
    "novelDir": "~/downloads/novels"
  }
}
```

### 3. 后台运行

Termux 应用被系统杀死后，后台任务会停止。

**解决方案**：

```bash
# 使用 nohup 运行
nohup npx pixivflow scheduler > ~/pixivflow.log 2>&1 &

# 或使用 tmux（推荐）
pkg install tmux
tmux new -s pixivflow
# 在 tmux 中运行
npx pixivflow scheduler
# 按 Ctrl+B 然后 D 分离会话
```

---

## 🐛 故障排除

### 问题 1：编译失败

**症状**：`gyp ERR! configure error` 或 `android_ndk_path` 错误

**解决方案**：

```bash
# 1. 确保安装了所有构建工具
pkg install python3 make clang

# 2. 清理 npm 缓存
npm cache clean --force

# 3. 删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install
```

### 问题 2：权限错误

**症状**：`EACCES` 或权限被拒绝

**解决方案**：

```bash
# 使用本地安装而不是全局安装
mkdir ~/pixivflow && cd ~/pixivflow
npm install pixivflow
```

### 问题 3：找不到命令

**症状**：`command not found: pixivflow`

**解决方案**：

```bash
# 使用 npx 运行
npx pixivflow --help

# 或创建别名
echo 'alias pixivflow="npx pixivflow"' >> ~/.bashrc
source ~/.bashrc
```

### 问题 4：数据库初始化失败

**症状**：`Failed to initialize database`

**解决方案**：

```bash
# 确保有写入权限
mkdir -p ~/.config/pixivflow
chmod 755 ~/.config/pixivflow

# 检查磁盘空间
df -h ~
```

---

## 💡 最佳实践

### 1. 使用本地安装

在 Termux 中，推荐使用本地安装：

```bash
mkdir ~/pixivflow && cd ~/pixivflow
npm install pixivflow
```

### 2. 使用 tmux 管理会话

```bash
# 安装 tmux
pkg install tmux

# 创建新会话
tmux new -s pixivflow

# 在会话中运行
npx pixivflow scheduler

# 分离会话（Ctrl+B 然后 D）
# 重新连接：tmux attach -t pixivflow
```

### 3. 配置自动启动（可选）

创建启动脚本 `~/start-pixivflow.sh`：

```bash
#!/data/data/com.termux/files/usr/bin/bash
cd ~/pixivflow
npx pixivflow scheduler
```

添加执行权限：

```bash
chmod +x ~/start-pixivflow.sh
```

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [配置指南](./CONFIG.md)
- [登录指南](./LOGIN.md)
- [使用指南](./USAGE.md)

---

## 🆘 获取帮助

如果遇到问题：

1. 查看本文档的故障排除部分
2. 查看 [GitHub Issues](https://github.com/redtidev1918/PixivFlow/issues)
3. 提交新的 Issue（请包含 Termux 版本和错误日志）

---

