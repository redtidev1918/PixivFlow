# 架构说明 / Architecture

## 项目架构

PixivFlow 是一个纯后端项目，提供 CLI 工具和 RESTful API 服务器。


### 后端项目 (Backend)


**特点：**
- 纯后端实现，不依赖前端代码
- 可以作为 npm 包安装：`npm install pixivflow`
- 提供 CLI 命令行工具
- 提供 RESTful API 服务器（可选）
- 支持 CORS，可以与任何前端项目集成
- 通过环境变量 `STATIC_PATH` 可选地服务静态文件

**启动方式：**

**CLI 模式：**
```bash
# 作为 npm 包使用
npm install -g pixivflow
pixivflow download      # 执行下载
pixivflow scheduler     # 启动定时任务
pixivflow webui         # 启动 API 服务器
```

**API 服务器模式：**
```bash
# 作为 npm 包使用
npm install -g pixivflow
pixivflow webui                    # 启动 API 服务器，访问 http://localhost:3000

# 或者从源码运行
npm run build
node dist/webui/index.js

# 指定静态文件路径（可选）
STATIC_PATH=/path/to/frontend/dist pixivflow webui

# 仅启动后端 API（推荐用于生产环境）
pixivflow webui                    # 纯 API 模式，不服务静态文件
```

**API 端点：**
- `/api/auth` - 认证相关（登录、登出、状态检查）
- `/api/config` - 配置管理（查看、编辑、备份、恢复）
- `/api/download` - 下载管理（启动、停止、状态查询）
- `/api/stats` - 统计信息（下载统计、文件统计）
- `/api/logs` - 日志查看（实时日志流，WebSocket）
- `/api/files` - 文件管理（文件列表、预览、操作）

### 前端项目（独立仓库）

前端是一个独立的 React 项目，已分离到独立仓库：[**pixivflow-webui**](https://github.com/zoidberg-xgd/pixivflow-webui)

**特点：**
- 独立的项目，有自己的 `package.json`
- 通过 HTTP API 与后端通信
- 可以独立构建和部署
- 支持开发模式和生产模式

**开发方式：**
```bash
# 克隆前端仓库
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui

npm install
npm run dev  # 开发模式，连接到后端 API
npm run build  # 构建生产版本
```

**部署方式：**
1. 克隆前端仓库：`git clone https://github.com/zoidberg-xgd/pixivflow-webui.git`
2. 构建前端：`cd pixivflow-webui && npm install && npm run build`
3. 将构建产物部署到静态文件服务器（如 Nginx、CDN 等）
4. 配置反向代理，将 `/api/*` 请求代理到后端服务器

### 前后端集成

#### 方式一：后端服务静态文件（开发/简单部署）

```bash
# 克隆并构建前端
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui && npm install && npm run build

# 启动后端并指定静态文件路径
STATIC_PATH=./pixivflow-webui/dist pixivflow webui
```

#### 方式二：独立部署（生产推荐）

**后端部署：**
```bash
# 安装后端
npm install -g pixivflow

# 启动 API 服务器
pixivflow webui --host 0.0.0.0 --port 3000
```

**前端部署：**
```bash
# 克隆并构建前端
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui
npm install
npm run build

# 部署到 Nginx
# 配置 Nginx 将 /api/* 代理到后端，其他请求服务静态文件
```

**Nginx 配置示例：**
```nginx
server {
    listen 80;
    server_name example.com;

    # 前端静态文件
    root /path/to/pixivflow-webui/dist;
    index index.html;

    # API 代理到后端
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket 支持（用于实时日志）
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 开发模式

**后端开发：**
```bash
# 后端开发模式（自动重新编译）
npm run build:watch
npm run dev:backend
```

**前端开发：**
```bash
# 前端开发模式（需要后端 API 已运行）
cd pixivflow-webui
npm run dev
```

前端开发服务器会通过代理连接到后端 API（默认端口 3001）。

### 环境变量

**后端环境变量：**
- `PORT` - API 服务器端口（默认：3000）
- `HOST` - 绑定地址（默认：localhost）
- `STATIC_PATH` - 静态文件路径（可选）

**前端环境变量：**
- `VITE_DEV_API_PORT` - 开发模式下后端 API 端口（默认：3001）
- `VITE_API_URL` - 生产模式下后端 API URL

### 技术栈

**后端：**
- **TypeScript** - 类型安全的 JavaScript
- **Node.js** - 运行时环境
- **Express** - Web 框架（API 服务器）
- **Socket.IO** - WebSocket 实时通信
- **SQLite** - 轻量级数据库
- **node-cron** - 定时任务调度

**前端（独立仓库）：**
- **React** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Ant Design** - UI 组件库

### 优势

1. **独立性**：后端可以独立运行，不依赖前端
2. **可扩展性**：后端可以作为 npm 包被其他项目使用
3. **灵活性**：前端可以使用任何技术栈，只需调用后端 API
4. **可维护性**：代码结构清晰，职责分离
5. **可部署性**：支持多种部署方式，适应不同场景
6. **轻量级**：纯后端实现，资源占用低

---

## Architecture

## Project Architecture

PixivFlow is a pure backend project that provides CLI tools and RESTful API server.

### Core Architecture

The backend consists of three main components:
- **CLI Tools** - Command-line interface for direct usage
- **API Server** - RESTful API server for frontend integration
- **Scheduler** - Cron-based task scheduler

### Backend Project

The backend is a pure API server and CLI tool that can be published and used as an npm package.

**Features:**
- Pure backend implementation, no dependency on frontend code
- Can be installed as npm package: `npm install pixivflow`
- Provides CLI command-line tools
- Provides RESTful API server (optional)
- Supports CORS, can integrate with any frontend project
- Optionally serves static files via `STATIC_PATH` environment variable

**Startup:**

**CLI Mode:**
```bash
# Use as npm package
npm install -g pixivflow
pixivflow download      # Execute download
pixivflow scheduler     # Start scheduled tasks
pixivflow webui         # Start API server
```

**API Server Mode:**
```bash
# Use as npm package
npm install -g pixivflow
pixivflow webui                    # Start API server, access http://localhost:3000

# Or run from source
npm run build
node dist/webui/index.js

# Specify static file path (optional)
STATIC_PATH=/path/to/frontend/dist pixivflow webui

# API-only mode (recommended for production)
pixivflow webui                    # Pure API mode, no static files
```

**API Endpoints:**
- `/api/auth` - Authentication (login, logout, status check)
- `/api/config` - Configuration management (view, edit, backup, restore)
- `/api/download` - Download management (start, stop, status query)
- `/api/stats` - Statistics (download stats, file stats)
- `/api/logs` - Logs (real-time log stream, WebSocket)
- `/api/files` - File management (file list, preview, operations)

### Frontend Project (Separate Repository)

The frontend is an independent React project located in a separate repository: [**pixivflow-webui**](https://github.com/zoidberg-xgd/pixivflow-webui)

**Features:**
- Independent project with its own `package.json`
- Communicates with backend via HTTP API
- Can be built and deployed independently
- Supports development and production modes

**Development:**
```bash
# Clone frontend repository
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui

npm install
npm run dev  # Development mode, connects to backend API
npm run build  # Build production version
```

**Deployment:**
1. Clone frontend repository: `git clone https://github.com/zoidberg-xgd/pixivflow-webui.git`
2. Build frontend: `cd pixivflow-webui && npm install && npm run build`
3. Deploy build artifacts to static file server (e.g., Nginx, CDN)
4. Configure reverse proxy to forward `/api/*` requests to backend server

### Integration

#### Method 1: Backend Serves Static Files (Development/Simple Deployment)

```bash
# Clone and build frontend
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui && npm install && npm run build

# Start backend with static file path
STATIC_PATH=./pixivflow-webui/dist pixivflow webui
```

#### Method 2: Independent Deployment (Production Recommended)

**Backend Deployment:**
```bash
# Install backend
npm install -g pixivflow

# Start API server
pixivflow webui --host 0.0.0.0 --port 3000
```

**Frontend Deployment:**
```bash
# Clone and build frontend
git clone https://github.com/zoidberg-xgd/pixivflow-webui.git
cd pixivflow-webui
npm install
npm run build

# Deploy to Nginx
# Configure Nginx to proxy /api/* to backend, serve static files for other requests
```

**Nginx Configuration Example:**
```nginx
server {
    listen 80;
    server_name example.com;

    # Frontend static files
    root /path/to/pixivflow-webui/dist;
    index index.html;

    # API proxy to backend
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket support (for real-time logs)
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # SPA routing support
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Development Mode

**Backend Development:**
```bash
# Backend development mode (auto recompile)
npm run build:watch
npm run dev:backend
```

**Frontend Development:**
```bash
# Frontend development mode (requires backend running)
cd pixivflow-webui
npm run dev
```

The frontend development server will connect to the backend API via proxy (default port 3001).

### Environment Variables

**Backend Environment Variables:**
- `PORT` - API server port (default: 3000)
- `HOST` - Bind address (default: localhost)
- `STATIC_PATH` - Static file path (optional)

**Frontend Environment Variables:**
- `VITE_DEV_API_PORT` - Backend API port in development mode (default: 3001)
- `VITE_API_URL` - Backend API URL in production mode

### Tech Stack

**Backend:**
- **TypeScript** - Type-safe JavaScript
- **Node.js** - Runtime environment
- **Express** - Web framework (API server)
- **Socket.IO** - WebSocket real-time communication
- **SQLite** - Lightweight database
- **node-cron** - Task scheduler

**Frontend (Separate Repository):**
- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Ant Design** - UI component library

### Advantages

1. **Independence**: Backend can run independently, no dependency on frontend
2. **Scalability**: Backend can be used as an npm package by other projects
3. **Flexibility**: Frontend can use any technology stack, just needs to call backend API
4. **Maintainability**: Clear code structure, separation of concerns
5. **Deployability**: Supports multiple deployment methods, adapts to different scenarios
6. **Lightweight**: Pure backend implementation, low resource usage
