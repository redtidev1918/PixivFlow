# WebUI 快速启动指南

## 🚀 一键启动命令

### 开发模式（推荐）

同时启动前端和后端，支持热重载和自动重启：

```bash
npm run dev
```

**功能说明：**
- ✅ 自动构建后端一次
- ✅ TypeScript 自动编译（监听文件变化）
- ✅ 后端服务器自动重启（监听 dist 目录变化）
- ✅ 前端开发服务器热重载（Vite）

**访问地址：** http://localhost:5173

### 生产模式

构建前端并启动后端服务器：

```bash
npm run webui:start
```

**功能说明：**
- ✅ 自动构建前端
- ✅ 启动后端服务器（提供静态文件）

**访问地址：** http://localhost:3000

---

## 📋 其他可用命令

| 命令 | 说明 | 用途 |
|------|------|------|
| `npm run dev` | 一键启动开发模式 | **推荐**：开发时使用 |
| `npm run webui:start` | 一键启动生产模式 | **推荐**：生产部署使用 |
| `npm run webui:dev:full` | 完整开发模式 | 与 `dev` 相同 |
| `npm run webui` | 仅启动后端 | 需要先构建或单独启动前端 |
| `npm run webui:frontend` | 仅启动前端 | 需要后端已运行 |
| `npm run webui:build` | 构建前端 | 用于生产部署 |

---

## 🔧 技术细节

### 开发模式架构

```
┌─────────────────┐
│  TypeScript     │  → 监听 src/ 目录，自动编译到 dist/
│  build:watch    │
└─────────────────┘
         ↓
┌─────────────────┐
│  Nodemon        │  → 监听 dist/ 目录，自动重启后端服务器
│  Backend Server │  → 运行在 http://localhost:3000
└─────────────────┘
         ↑
┌─────────────────┐
│  Vite Dev       │  → 前端开发服务器，热重载
│  Frontend       │  → 运行在 http://localhost:5173
└─────────────────┘
```

### 端口说明

- **前端开发服务器**：5173（Vite）
- **后端 API 服务器**：3000（Express）
- **前端代理**：前端自动代理 `/api` 和 `/socket.io` 到后端

---

## 📝 注意事项

1. **首次运行**：确保已安装所有依赖
   ```bash
   npm install
   cd webui-frontend && npm install && cd ..
   ```

2. **端口冲突**：如果端口被占用，后端会自动寻找可用端口

3. **停止服务**：按 `Ctrl+C` 停止所有服务

4. **生产部署**：使用 `npm run webui:start` 或手动构建后使用 `npm run webui`

---

## 🆘 常见问题

### Q: 前端无法连接到后端？

A: 确保后端服务器已启动（端口 3000），前端会自动代理 API 请求。

### Q: 修改后端代码后没有生效？

A: 开发模式下，TypeScript 会自动编译，nodemon 会自动重启服务器。如果没生效，检查终端输出是否有错误。

### Q: 如何只启动前端或后端？

A: 使用 `npm run webui:frontend` 或 `npm run webui` 分别启动。

---

更多详细信息请查看 [WebUI 完整指南](docs/WEBUI.md)

