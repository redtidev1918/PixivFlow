# WebUI 指南

PixivFlow 提供了现代化的 Web 管理界面，支持图形化操作。

---

## 🚀 快速开始

> 💡 **提示**：如果通过 `npm install -g pixivflow` 全局安装，可以直接使用 `pixivflow webui` 命令。如果从源码安装，请使用 `npm run` 命令。

### 全局安装后使用

#### 方式 1：自动构建并启动（推荐 ⭐）

如果从项目源码目录运行，会自动检测并构建前端：

```bash
# 1. 首先需要克隆源码仓库（如果还没有）
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 2. 在项目源码目录中运行（自动构建前端）
pixivflow webui
```

**功能说明：**
- ✅ 自动检测项目源码目录
- ✅ 如果前端未构建，自动执行 `npm run build`
- ✅ 构建完成后自动启动服务器并提供前端

**如何找到项目源码目录？**

如果你通过 `npm install -g pixivflow` 全局安装，需要单独克隆源码：

```bash
# 方法 1：克隆到任意位置（推荐）
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow
pixivflow webui

# 方法 2：查看全局安装位置（通常不包含源码）
npm root -g
# 输出类似：/usr/local/lib/node_modules
# 但全局安装的包通常不包含 webui-frontend 源码
```

然后访问 http://localhost:3000 即可使用完整的 WebUI。

#### 方式 2：手动指定静态文件路径

如果前端已经构建，可以直接指定路径：

```bash
# 使用 --static-path 选项
pixivflow webui --static-path /path/to/pixivflow/webui-frontend/dist

# 或使用环境变量
STATIC_PATH=/path/to/pixivflow/webui-frontend/dist pixivflow webui
```

#### 方式 3：仅启动后端 API

```bash
# 仅启动后端 API（无前端界面）
pixivflow webui
```

如果找不到前端静态文件，服务器会仅提供 API 服务。访问 http://localhost:3000 可以访问 API。

### 源码安装使用

#### 🚀 一键启动开发模式（推荐）

使用单个命令同时启动前端和后端，支持热重载：

```bash
# 同时启动前端和后端（自动热重载）
npm run dev
```

或者使用完整命令：

```bash
npm run webui:dev:full
```

这个命令会：
- 自动构建后端一次
- 启动 TypeScript 编译监听（自动重新编译）
- 启动后端服务器（自动重启）
- 启动前端开发服务器（热重载）

访问 http://localhost:5173 即可使用 WebUI（前端开发服务器会自动代理 API 请求到后端）。

#### 开发模式（前后端分离，手动启动）

如果需要分别控制前端和后端：

```bash
# 终端 1：启动 WebUI 后端
npm run webui

# 终端 2：启动前端开发服务器
npm run webui:frontend
```

然后访问 http://localhost:5173 即可使用 WebUI（前端开发服务器）。

#### 生产模式（单服务器）

```bash
# 一键启动：构建前端并启动后端服务器
npm run webui:start
```

或者分步执行：

```bash
# 1. 构建前端
npm run webui:build

# 2. 启动 WebUI（自动提供前端静态文件）
npm run webui
```

然后访问 http://localhost:3000 即可使用 WebUI（后端服务器）。

---

## 🖥️ 桌面应用（Electron）

### 开发模式

```bash
cd webui-frontend
npm run electron:dev
```

### 构建桌面应用

```bash
cd webui-frontend

# 构建所有平台
npm run electron:build

# 仅 Windows
npm run electron:build:win

# 仅 macOS
npm run electron:build:mac

# 仅 Linux
npm run electron:build:linux
```

构建完成后，安装包会在 `webui-frontend/release/` 目录下。

---

## 📋 功能说明

### 下载统计和概览

- 查看下载统计信息
- 查看标签统计
- 查看作者统计

### 文件浏览和预览

- 浏览已下载的文件
- 预览图片和文本文件
- 支持日文、中文等特殊字符文件名

### 实时日志查看

- 查看运行日志
- WebSocket 实时日志流

### 配置管理

- 查看和编辑配置
- 实时更新配置

### 任务管理

- 启动/停止下载任务
- 查看任务状态

### 下载历史查看

- 查看下载历史记录
- 查看作品详情

---

## 🔌 API 端点

### 认证相关

- `GET /api/auth/status` - 获取认证状态
- `POST /api/auth/login` - 登录
- `POST /api/auth/logout` - 登出

### 配置管理

- `GET /api/config` - 获取配置
- `PUT /api/config` - 更新配置

### 下载任务

- `POST /api/download/start` - 启动下载任务
- `POST /api/download/stop` - 停止下载任务
- `GET /api/download/status` - 获取任务状态

### 统计信息

- `GET /api/stats/overview` - 获取概览统计
- `GET /api/stats/tags` - 获取标签统计
- `GET /api/stats/authors` - 获取作者统计

### 日志查看

- `GET /api/logs` - 获取日志
- WebSocket `/api/logs/stream` - 实时日志流

### 文件浏览

- `GET /api/files/list` - 获取文件列表
- `GET /api/files/preview` - 预览文件
- `DELETE /api/files/delete` - 删除文件

---

## ⚙️ 配置说明

### 端口配置

- **开发模式**：前端使用 Vite 开发服务器（端口 5173），后端使用 Express 服务器（端口 3000）
- **生产模式**：使用 Express 服务器（端口 3000），前端静态文件已内置

### 开发命令说明

| 命令 | 说明 | 用途 |
|------|------|------|
| `npm run dev` | 一键启动开发模式（推荐） | 同时启动前端和后端，支持热重载 |
| `npm run webui:dev:full` | 完整开发模式 | 与 `dev` 相同，三个进程同时运行 |
| `npm run webui:start` | 一键启动生产模式 | 构建前端并启动后端服务器 |
| `npm run webui` | 仅启动后端 | 需要先构建前端或单独启动前端 |
| `npm run webui:frontend` | 仅启动前端 | 需要后端已运行 |
| `npm run webui:build` | 构建前端 | 用于生产部署 |

### Docker 部署

Docker 部署使用生产模式，前端静态文件已内置在镜像中，访问端口为 3000。

### Electron 桌面应用

Electron 桌面应用会自动启动后端服务器，无需手动启动。

---

## 📝 注意事项

- **平台支持**：当前仅支持 Windows / macOS / Linux 桌面应用，不支持移动端（iOS/Android）
- **开发模式**：使用 Vite 开发服务器（端口 5173），生产模式使用 Express 服务器（端口 3000）
- **Docker 部署**：使用生产模式，前端静态文件已内置在镜像中，访问端口为 3000
- **Electron 桌面应用**：会自动启动后端服务器，无需手动启动

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [使用指南](./USAGE.md)
- [Docker 指南](./DOCKER.md)

