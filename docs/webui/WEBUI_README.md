# 🎨 PixivFlow WebUI 使用指南

## 📋 概述

PixivFlow WebUI 是一个现代化的 Web 界面，用于管理和监控 PixivFlow 下载任务。它提供了友好的图形界面，替代了命令行操作。

## 📋 前置要求

- Node.js 18+ 和 npm 9+
- 已安装项目依赖

## 🔧 安装步骤

### 1. 安装后端依赖

```bash
npm install
```

这将安装所有后端依赖，包括：
- Express.js
- Socket.IO
- CORS
- 其他现有依赖

### 2. 安装前端依赖

```bash
cd webui-frontend
npm install
cd ..
```

这将安装前端依赖，包括：
- React 18
- TypeScript
- Vite
- Ant Design
- React Query
- 其他前端库

### 3. 构建项目

```bash
# 构建后端 TypeScript 代码
npm run build
```

## 🚀 启动 WebUI

### 开发模式（推荐）

**终端 1 - 启动后端：**
```bash
npm run webui
```

**终端 2 - 启动前端开发服务器：**
```bash
npm run webui:frontend
```

然后访问：http://localhost:5173

### 生产模式

```bash
# 1. 构建前端
npm run webui:build

# 2. 启动后端（会自动提供前端静态文件）
STATIC_PATH=webui-frontend/dist npm run webui
```

然后访问：http://localhost:3000

## 📝 环境变量

可以通过环境变量配置 WebUI：

```bash
# 端口（默认：3000）
PORT=3000 npm run webui

# 主机（默认：localhost）
HOST=0.0.0.0 npm run webui

# 前端静态文件路径（生产模式）
STATIC_PATH=webui-frontend/dist npm run webui
```

---

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

Docker 镜像已经包含了构建好的前端静态文件，无需手动构建。

#### 启动 WebUI 服务

```bash
# 启动 WebUI 服务
docker-compose up -d pixivflow-webui

# 或同时启动定时任务和 WebUI
docker-compose up -d
```

#### 访问 WebUI

启动后，打开浏览器访问：**http://localhost:3000**

#### 查看日志

```bash
# 查看 WebUI 日志
docker-compose logs -f pixivflow-webui
```

#### 停止服务

```bash
# 停止 WebUI 服务
docker-compose stop pixivflow-webui

# 停止并删除容器
docker-compose down pixivflow-webui
```

#### 修改端口

如果需要修改 WebUI 端口，编辑 `docker-compose.yml`：

```yaml
pixivflow-webui:
  ports:
    - "8080:3000"  # 将宿主机端口改为 8080
  environment:
    - PORT=3000    # 容器内端口保持 3000
```

然后访问：http://localhost:8080

### Docker 环境变量

Docker 环境中的 WebUI 支持以下环境变量：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | WebUI 端口 | `3000` |
| `HOST` | WebUI 主机 | `0.0.0.0` |
| `STATIC_PATH` | 前端静态文件路径 | `/app/webui-frontend/dist` |
| `PIXIV_DATABASE_PATH` | 数据库文件路径（容器内路径） | `/app/data/pixiv-downloader.db` |
| `PIXIV_DOWNLOAD_DIR` | 下载根目录（容器内路径） | `/app/downloads` |
| `PIXIV_ILLUSTRATION_DIR` | 插画保存目录（容器内路径） | `/app/downloads/downloads/illustrations` |
| `PIXIV_NOVEL_DIR` | 小说保存目录（容器内路径） | `/app/downloads/downloads/novels` |

**重要提示**：
- Docker 环境中的路径配置需要使用**容器内路径**（如 `/app/data/...`），而不是宿主机路径
- `docker-compose.yml` 已自动配置这些环境变量，通常无需手动修改

### 更多信息

详细的 Docker 使用说明请查看 [Docker 使用指南](../docker/DOCKER.md)。

---

## 📁 项目结构

```
pixivflow/
├── src/webui/              # WebUI 后端代码
│   ├── server.ts           # Express 服务器
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑
│   └── websocket/          # WebSocket 处理
│
└── webui-frontend/         # 前端应用
    ├── src/
    │   ├── pages/          # 页面组件
    │   ├── components/     # 通用组件
    │   ├── services/       # API 客户端
    │   └── ...
    └── package.json
```

## 🔌 API 端点

### 根路径
- `GET /` - 获取 API 信息
  - 当未配置静态文件路径时，返回 JSON 格式的 API 信息
  - 包含服务器版本、可用端点列表和使用说明
  - 响应示例：
    ```json
    {
      "message": "PixivFlow WebUI API Server",
      "version": "2.0.0",
      "endpoints": {
        "health": "/api/health",
        "auth": "/api/auth",
        "config": "/api/config",
        "download": "/api/download",
        "stats": "/api/stats",
        "logs": "/api/logs",
        "files": "/api/files"
      },
      "note": "Frontend is not configured. To serve the frontend, set STATIC_PATH environment variable or run in development mode with separate frontend server on port 5173."
    }
    ```

### 健康检查
- `GET /api/health` - 服务器健康状态
  - 返回服务器状态和时间戳

### 认证相关
- `GET /api/auth/status` - 获取登录状态
- `POST /api/auth/login` - 登录
- `POST /api/auth/refresh` - 刷新 token
- `POST /api/auth/logout` - 登出

### 配置管理
- `GET /api/config` - 获取配置
- `PUT /api/config` - 更新配置
- `POST /api/config/validate` - 验证配置
- `GET /api/config/backup` - 备份配置
- `POST /api/config/restore` - 恢复配置

### 下载任务
- `POST /api/download/start` - 启动下载
- `POST /api/download/stop` - 停止下载
- `GET /api/download/status` - 获取下载状态
- `GET /api/download/history` - 获取下载历史
- `GET /api/download/incomplete` - 获取未完成任务列表
- `DELETE /api/download/incomplete` - 删除所有未完成任务
- `DELETE /api/download/incomplete/:id` - 删除指定未完成任务
- `POST /api/download/random` - 随机下载

### 统计信息
- `GET /api/stats/overview` - 概览统计
- `GET /api/stats/downloads` - 下载统计
- `GET /api/stats/tags` - 标签统计
- `GET /api/stats/authors` - 作者统计

### 日志查看
- `GET /api/logs` - 获取日志
- `DELETE /api/logs` - 清空日志
- WebSocket: `/socket.io` - 实时日志流

### 文件浏览
- `GET /api/files/list` - 列出文件
- `GET /api/files/preview` - 预览文件（支持日文、中文等特殊字符文件名）
- `DELETE /api/files/:id` - 删除文件

## 🎯 功能说明

### 未完成任务管理

WebUI 提供了完善的未完成任务管理功能：

#### 查看未完成任务
- 在下载页面可以看到所有未完成的任务（状态为 `failed` 或 `partial`）
- 显示任务的标签、类型、状态、错误信息和执行时间
- 支持分页和排序

#### 删除未完成任务
- **单个删除**：点击任务列表中的"删除"按钮，可以删除指定的未完成任务
- **批量删除**：点击"删除所有未完成任务"按钮，可以一次性删除所有未完成的任务
- 删除操作会显示确认对话框，防止误操作
- 删除成功后会自动刷新任务列表

#### 继续下载未完成任务
- 点击任务列表中的"继续下载"按钮，可以重新启动未完成的任务
- 系统会从上次中断的地方继续下载

## 🛠️ 开发

### 后端开发

```bash
# 监听模式编译
npm run build:watch

# 在另一个终端启动服务器
npm run webui
```

### 前端开发

```bash
cd webui-frontend
npm run dev
```

前端开发服务器运行在 http://localhost:5173，会自动代理 API 请求到后端。

## 📝 环境变量

- `PORT` - WebUI 服务器端口（默认：3000）
- `HOST` - WebUI 服务器主机（默认：localhost）
- `STATIC_PATH` - 前端静态文件路径（生产模式）

## 🔒 安全提示

1. WebUI 默认监听 localhost，仅本地访问
2. 生产环境建议配置反向代理（如 Nginx）
3. 考虑添加身份验证（待实现）

## 🐛 故障排除

### 问题 1: 端口被占用

**解决方案：**
```bash
PORT=3001 npm run webui
```

### 问题 2: 前端无法连接后端

**检查：**
1. 后端是否正在运行
2. 前端代理配置（`webui-frontend/vite.config.ts`）
3. 浏览器控制台是否有错误

### 问题 3: 编译错误

**解决方案：**
```bash
# 清理并重新构建
npm run clean
npm run build
```

### 问题 4: 依赖安装失败

**解决方案：**
```bash
# 清理 node_modules 并重新安装
rm -rf node_modules package-lock.json
npm install

# 前端同样处理
cd webui-frontend
rm -rf node_modules package-lock.json
npm install
cd ..
```

### 问题 5: 文件预览错误（ERR_INVALID_CHAR）

**问题**：预览包含日文、中文等特殊字符的文件名时出现错误。

**状态**：✅ 已修复（2025-11-08）

**修复内容**：
- 使用 RFC 5987 格式的 `Content-Disposition` 头
- 正确编码文件名（使用 `encodeURIComponent`）
- 改进了路径解析和错误处理

**测试结果**：
- ✅ 日文文件名预览正常
- ✅ 中文文件名预览正常
- ✅ Content-Type 正确设置

**说明**：文件预览功能已支持包含特殊字符的文件名（日文、中文等）。如果遇到问题，请确保：
1. 后端服务器已重启以加载最新代码
2. 使用最新版本的代码

### 问题 6: 访问根路径返回 "Cannot GET /" 错误

**问题**：访问 http://localhost:3000 时返回 "Cannot GET /" 错误。

**状态**：✅ 已修复（2025-11-08）

**说明**：
- 当未配置静态文件路径时，根路径现在会返回 API 信息 JSON 响应
- 这是正常行为，表示后端 API 服务器正在运行
- 要使用前端界面，请：
  - 开发模式：访问 http://localhost:5173（前端开发服务器）
  - 生产模式：设置 `STATIC_PATH` 环境变量并构建前端

## 📚 更多信息

详细架构设计请查看 [WEBUI_ARCHITECTURE.md](./WEBUI_ARCHITECTURE.md)

