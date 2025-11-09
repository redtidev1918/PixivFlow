# 🎨 PixivFlow WebUI 架构设计文档

## 📋 概述

本文档描述了 PixivFlow WebUI 的整体架构设计，包括技术栈选择、模块划分、API 设计和前端页面结构。

## 🛠️ 技术栈

### 后端
- **框架**: Express.js + TypeScript
- **原因**: 与现有项目技术栈一致，易于集成现有代码
- **特性**: RESTful API、WebSocket（实时日志）

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 库**: Ant Design / Material-UI（待定）
- **状态管理**: React Query + Zustand
- **路由**: React Router v6

### 实时通信
- **WebSocket**: 用于实时日志推送和下载状态更新

## 📁 项目结构

```
pixivflow/
├── src/
│   ├── webui/                    # WebUI 后端代码
│   │   ├── server.ts             # Express 服务器入口
│   │   ├── routes/               # API 路由
│   │   │   ├── auth.ts           # 认证相关
│   │   │   ├── config.ts         # 配置管理
│   │   │   ├── download.ts       # 下载任务
│   │   │   ├── stats.ts          # 统计信息
│   │   │   ├── logs.ts           # 日志查看
│   │   │   └── files.ts          # 文件浏览
│   │   ├── services/             # 业务逻辑层
│   │   │   ├── DownloadService.ts
│   │   │   ├── ConfigService.ts
│   │   │   └── StatsService.ts
│   │   ├── middleware/           # 中间件
│   │   │   ├── auth.ts
│   │   │   └── errorHandler.ts
│   │   └── websocket/            # WebSocket 处理
│   │       └── LogStream.ts
│   └── ... (现有代码)
│
├── webui-frontend/               # 前端应用
│   ├── src/
│   │   ├── pages/                # 页面组件
│   │   │   ├── Dashboard.tsx     # 仪表盘
│   │   │   ├── Config.tsx        # 配置管理
│   │   │   ├── Download.tsx      # 下载任务
│   │   │   ├── History.tsx       # 下载历史
│   │   │   ├── Logs.tsx          # 日志查看
│   │   │   └── Files.tsx         # 文件浏览
│   │   ├── components/           # 通用组件
│   │   │   ├── Layout/
│   │   │   ├── DownloadCard/
│   │   │   ├── ConfigForm/
│   │   │   └── LogViewer/
│   │   ├── hooks/                # 自定义 Hooks
│   │   ├── services/             # API 客户端
│   │   ├── store/                # 状态管理
│   │   └── utils/                # 工具函数
│   ├── package.json
│   └── vite.config.ts
│
└── package.json                  # 根 package.json
```

## 🔌 API 设计

### 认证相关 (`/api/auth`)

```
POST   /api/auth/login           # 登录
POST   /api/auth/logout          # 登出
GET    /api/auth/status          # 获取登录状态
POST   /api/auth/refresh         # 刷新 token
```

### 配置管理 (`/api/config`)

```
GET    /api/config               # 获取配置
PUT    /api/config               # 更新配置
POST   /api/config/validate      # 验证配置
GET    /api/config/backup        # 备份配置
POST   /api/config/restore       # 恢复配置
```

### 下载任务 (`/api/download`)

```
POST   /api/download/start        # 启动下载任务
POST   /api/download/stop         # 停止下载任务
GET    /api/download/status      # 获取下载状态
GET    /api/download/history      # 获取下载历史
POST   /api/download/random      # 随机下载
```

### 统计信息 (`/api/stats`)

```
GET    /api/stats/overview        # 概览统计
GET    /api/stats/downloads       # 下载统计
GET    /api/stats/tags            # 标签统计
GET    /api/stats/authors         # 作者统计
```

### 日志查看 (`/api/logs`)

```
GET    /api/logs                 # 获取日志（分页）
GET    /api/logs/stream          # WebSocket 实时日志流
DELETE /api/logs                 # 清空日志
```

### 文件浏览 (`/api/files`)

```
GET    /api/files/list            # 列出文件（支持排序、筛选、日期筛选）
GET    /api/files/preview/:id     # 预览文件
GET    /api/files/download/:id    # 下载文件
DELETE /api/files/:id             # 删除文件
```

**文件列表 API 参数**：
- `path`: 文件路径（可选）
- `type`: 文件类型（illustration/novel，可选）
- `sort`: 排序方式（name/time/size/type/downloadedAt，可选）
- `order`: 排序顺序（asc/desc，可选）
- `dateFilter`: 日期筛选（today/yesterday/thisWeek/lastWeek/thisMonth/lastMonth，可选）

## 🎨 前端页面设计

### 1. 仪表盘 (Dashboard)
- 下载统计概览
- 最近下载的作品
- 系统状态（登录状态、定时任务状态）
- 快速操作按钮

### 2. 配置管理 (Config)
- 下载目标配置（标签、数量、筛选条件）
- 定时任务配置（Cron 表达式）
- 存储配置（目录组织方式）
- 网络配置（代理设置）

### 3. 下载任务 (Download)
- 任务列表
- 启动/停止任务
- 实时进度显示
- 任务历史记录

### 4. 下载历史 (History)
- 下载记录列表（分页、筛选、搜索）
- 作品详情（预览、作者、标签等）
- 统计图表

### 5. 日志查看 (Logs)
- 实时日志流（WebSocket）
- 日志筛选（级别、时间范围）
- 日志导出

### 6. 文件浏览 (Files)
- 文件树形结构
- 图片预览
- 文件管理（删除、下载）
- 下载时间显示（从数据库查询）
- 多种排序方式（名称、时间、大小、类型、下载时间）
- 日期筛选功能（今天、昨天、本周、上周、本月、上月）

## 🔄 数据流设计

### 下载任务流程

```
用户操作 → API 请求 → DownloadService → DownloadManager → 数据库更新
                                    ↓
                            WebSocket 推送
                                    ↓
                            前端实时更新
```

### 配置更新流程

```
用户修改配置 → API 请求 → ConfigService → 验证配置 → 保存文件
                                    ↓
                            通知相关服务
                                    ↓
                            前端刷新状态
```

## 🔐 安全考虑

1. **认证机制**: 基于 refresh token 的认证
2. **API 限流**: 防止恶意请求
3. **输入验证**: 所有用户输入必须验证
4. **文件访问控制**: 限制文件访问路径，防止路径遍历
5. **CORS 配置**: 仅允许指定域名访问

## 🚀 部署方案

### 开发环境
- 前端: Vite dev server (端口 5173)
- 后端: Express server (端口 3000)
- 代理: Vite proxy 配置

### 生产环境
- 前端: 构建静态文件，由 Express 提供
- 后端: Express 服务器
- 可选: Nginx 反向代理

## 📊 性能优化

1. **前端**:
   - 代码分割（路由级别）
   - 图片懒加载
   - 虚拟滚动（长列表）
   - 缓存策略（React Query）

2. **后端**:
   - API 响应缓存
   - 数据库查询优化
   - WebSocket 连接池管理

## 🔄 扩展性设计

1. **插件系统**: 预留插件接口
2. **主题系统**: 支持多主题切换
3. **国际化**: 支持多语言（i18n）
4. **权限系统**: 预留多用户权限管理

## 📝 开发计划

### Phase 1: 基础架构
- [x] 创建项目结构
- [ ] 后端 API 框架搭建
- [ ] 前端应用初始化
- [ ] 基础路由和页面

### Phase 2: 核心功能
- [ ] 认证管理
- [ ] 配置管理
- [ ] 下载任务控制
- [ ] 实时日志

### Phase 3: 高级功能
- [ ] 统计图表
- [ ] 文件浏览
- [ ] 下载历史管理

### Phase 4: 优化和测试
- [ ] 性能优化
- [ ] 错误处理
- [ ] 单元测试
- [ ] E2E 测试

## 📚 参考资源

- [Express.js 文档](https://expressjs.com/)
- [React 文档](https://react.dev/)
- [Vite 文档](https://vitejs.dev/)
- [Ant Design 文档](https://ant.design/)

