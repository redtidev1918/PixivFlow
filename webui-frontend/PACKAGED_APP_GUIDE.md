# 📦 打包后的应用使用指南

## ✅ 回答您的问题

### 1. **构建后可以直接运行吗？**
**是的！** 构建完成后，您会得到一个可执行文件（DMG/EXE/AppImage），双击即可运行，无需任何额外配置。

### 2. **不用源代码，发给别人也能运行？**
**是的！** 打包后的应用包含了：
- ✅ 前端代码（已编译）
- ✅ 后端代码（已编译）
- ✅ 后端依赖（node_modules）
- ✅ Electron 运行时（内置 Node.js）

用户只需要：
1. 下载安装包
2. 安装应用
3. 双击运行

**完全不需要：**
- ❌ 安装 Node.js
- ❌ 安装 npm
- ❌ 运行任何命令
- ❌ 源代码

### 3. **Pixiv 登录需要后端，后端会被打包吗？**
**是的！** 后端已经被完整打包进去了，包括：

- ✅ **后端代码**：编译后的 JavaScript 文件（`dist/webui/index.js`）
- ✅ **后端依赖**：所有 Node.js 依赖（express, socket.io, better-sqlite3 等）
- ✅ **后端功能**：包括 Pixiv 登录、下载、API 调用等所有功能

### 4. **登录需要 Python gppt，Python 会被打包吗？**
**不会，但会自动处理！** 

Pixiv 登录使用 Python 的 `gppt` 库来完成。Python 不会被打包进应用（因为体积太大），但应用会：

- ✅ **自动检测系统 Python**：应用会自动查找系统中已安装的 Python 3
- ✅ **自动安装 gppt**：如果 Python 已安装但 gppt 未安装，应用会自动安装
- ✅ **友好的错误提示**：如果 Python 未安装，会显示清晰的安装指导

**用户需要做的：**
1. **首次使用前安装 Python 3.9+**（只需一次）
   - macOS: `brew install python3` 或从 [python.org](https://www.python.org/downloads/) 下载
   - Windows: 从 [python.org](https://www.python.org/downloads/) 下载安装程序
   - Linux: `sudo apt-get install python3` (Ubuntu/Debian) 或 `sudo yum install python3` (RHEL/CentOS)

2. **首次登录时**：应用会自动安装 `gppt` 库（如果未安装）

**注意：**
- Python 只需要安装一次，之后所有用户都可以使用
- `gppt` 会在首次登录时自动安装
- 登录成功后，`refresh_token` 会保存到配置文件，之后不需要再次登录

## 🔧 打包后的应用如何工作

### 应用启动流程

1. **用户双击应用图标**
   - Electron 启动
   - 加载主窗口

2. **自动启动后端服务器**
   - Electron 从 `resources/dist/webui/index.js` 启动后端
   - 后端使用 `resources/backend-node_modules` 中的依赖
   - 后端监听 `localhost:3000`

3. **加载前端界面**
   - Electron 窗口连接到 `http://localhost:3000`
   - 前端界面显示在窗口中

4. **用户使用应用**
   - 所有功能（登录、下载、配置等）都通过后端 API 工作
   - 后端完全独立运行，不需要外部服务

### 文件结构（打包后）

```
PixivFlow.app (或 .exe)
├── Electron 运行时
├── resources/
│   ├── dist/                    # 后端编译后的代码
│   │   └── webui/
│   │       └── index.js        # 后端入口文件
│   ├── backend-node_modules/    # 后端依赖
│   │   ├── express/
│   │   ├── socket.io/
│   │   ├── better-sqlite3/
│   │   └── ... (其他依赖)
│   └── webui-dist/              # 前端静态文件
│       ├── index.html
│       ├── assets/
│       └── ...
└── ...
```

## 📝 用户使用步骤

### macOS 用户

1. **下载 DMG 文件**
   ```
   PixivFlow-1.0.0-arm64.dmg
   ```

2. **安装应用**
   - 双击 DMG 文件
   - 将 `PixivFlow.app` 拖拽到 `Applications` 文件夹

3. **运行应用**
   - 打开 `Applications` 文件夹
   - 双击 `PixivFlow.app`
   - 应用会自动启动后端和前端

4. **首次使用**
   - 应用会自动打开登录界面
   - 输入 Pixiv 账号密码登录
   - 登录成功后即可使用所有功能

### Windows 用户

1. **下载安装程序**
   ```
   PixivFlow Setup 1.0.0-x64.exe
   ```

2. **安装应用**
   - 双击安装程序
   - 按照向导完成安装

3. **运行应用**
   - 从开始菜单或桌面快捷方式启动
   - 应用会自动启动后端和前端

### Linux 用户

1. **下载 AppImage 文件**
   ```
   PixivFlow-1.0.0-x64.AppImage
   ```

2. **运行应用**
   ```bash
   chmod +x PixivFlow-1.0.0-x64.AppImage
   ./PixivFlow-1.0.0-x64.AppImage
   ```

## 🔐 登录功能说明

### 登录流程

打包后的应用**完全支持 Pixiv 登录**，登录流程如下：

1. **用户在界面输入账号密码**
   - 前端界面收集用户输入的 Pixiv 账号和密码

2. **后端调用 Python gppt 进行登录**
   - 后端自动检测系统 Python 3
   - 如果 gppt 未安装，自动安装
   - 使用 gppt 库进行 Pixiv OAuth 认证
   - gppt 内部使用 Selenium 自动化浏览器完成登录

3. **保存 Token 到配置文件**
   - 登录成功后，获取 `refresh_token` 和 `access_token`
   - **重要**：保存的是 `refresh_token`，**不是密码**
   - `refresh_token` 保存到配置文件：`~/Library/Application Support/PixivFlow/config.json` (macOS)

4. **后续使用**
   - 使用保存的 `refresh_token` 刷新 `access_token`
   - 不需要再次输入密码
   - 除非 `refresh_token` 过期或失效

### Python 依赖说明

**为什么需要 Python？**

Pixiv 登录使用 OAuth 2.0 PKCE 流程，需要自动化浏览器来完成认证。Python 的 `gppt` 库提供了这个功能。

**Python 不会被打包的原因：**
- Python 运行时体积很大（几百MB）
- 打包 Python 会让应用体积变得非常大
- 大多数系统已经安装了 Python 3

**应用如何处理 Python 依赖：**

1. **自动检测 Python**
   - 应用会自动查找系统中的 Python 3
   - 支持多种常见安装位置（Homebrew、系统路径等）

2. **自动安装 gppt**
   - 如果 Python 已安装但 gppt 未安装
   - 应用会自动运行 `pip install gppt`
   - 用户无需手动操作

3. **友好的错误提示**
   - 如果 Python 未安装，会显示清晰的安装指导
   - 包含各平台的安装命令和下载链接

### 数据存储

应用会在以下位置存储数据：

- **macOS**: `~/Library/Application Support/PixivFlow/`
- **Windows**: `%APPDATA%\PixivFlow\`
- **Linux**: `~/.config/PixivFlow/`

存储内容包括：
- 配置文件
- 数据库文件
- 下载的作品
- 登录 Token

## ⚠️ 注意事项

### 1. Python 依赖（首次使用）

**首次使用前需要安装 Python 3.9+：**

- **macOS**: 
  ```bash
  brew install python3
  ```
  或从 [python.org](https://www.python.org/downloads/) 下载安装程序

- **Windows**: 
  从 [python.org](https://www.python.org/downloads/) 下载安装程序
  ⚠️ 安装时勾选 "Add Python to PATH"

- **Linux**: 
  ```bash
  sudo apt-get install python3  # Ubuntu/Debian
  sudo yum install python3      # RHEL/CentOS
  ```

**首次登录时：**
- 应用会自动检测 Python
- 如果 gppt 未安装，会自动安装（可能需要几分钟）
- 之后就不需要再次安装

### 2. Chrome 浏览器（gppt 需要）

- gppt 使用 Selenium 自动化浏览器
- 需要 Chrome 或 Chromium 浏览器
- ChromeDriver 会自动下载（首次使用时）

### 3. 首次运行可能需要时间

- 后端启动需要几秒钟
- 如果界面显示"连接中"，请稍等片刻
- 首次登录可能需要 20-30 秒（启动浏览器、完成认证）

### 4. 防火墙提示

- 后端监听 `localhost:3000`
- 如果防火墙询问，请允许访问

### 5. 端口占用

- 如果 3000 端口被占用，应用可能无法启动
- 可以关闭占用端口的其他应用

### 6. 系统要求

- **macOS**: macOS 10.13 或更高版本
- **Windows**: Windows 10 或更高版本
- **Linux**: 现代 Linux 发行版（Ubuntu 18.04+）
- **Python**: Python 3.9 或更高版本（需要单独安装）

## 🎉 总结

**打包后的应用基本独立**，包含：

✅ 前端界面  
✅ 后端服务器  
✅ Node.js 依赖  
✅ Node.js 运行时（Electron 内置）  
✅ Pixiv 登录功能  
✅ 所有下载和管理功能  

**用户需要做的：**

1. **首次使用前**（只需一次）：
   - 安装 Python 3.9+（如果系统未安装）
   - 从 [python.org](https://www.python.org/downloads/) 下载安装

2. **首次登录时**（只需一次）：
   - 应用会自动安装 `gppt` 库
   - 输入 Pixiv 账号密码登录
   - 登录成功后，Token 会保存到配置文件

3. **之后使用**：
   - 直接运行应用
   - 使用保存的 Token，无需再次登录

**完全不需要：**
- ❌ 安装 Node.js（Electron 内置）
- ❌ 安装 npm
- ❌ 运行命令（除了首次安装 Python）
- ❌ 源代码
- ❌ 任何技术知识（除了安装 Python）

**为什么需要 Python？**

Pixiv 登录使用 Python 的 `gppt` 库来完成 OAuth 认证。Python 不会被打包（体积太大），但应用会自动检测和使用系统 Python，并自动安装 `gppt` 库。

这就是 Electron 应用的优势：**一次打包，到处运行！** 🚀

