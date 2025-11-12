# Docker 部署指南

PixivFlow 完全支持 Docker 部署，无需在主机上安装 Node.js、Python 或其他依赖。

---

## 🚀 快速开始

### 方式 1：使用脚本（推荐）

```bash
# 1. 初始化 Docker 环境
./scripts/pixiv.sh docker setup

# 2. 登录 Pixiv 账号
./scripts/pixiv.sh docker login

# 3. 构建并部署
./scripts/pixiv.sh docker deploy

# 4. 查看状态
./scripts/pixiv.sh docker status

# 5. 查看日志
./scripts/pixiv.sh docker logs -f
```

### 方式 2：使用 docker-compose（推荐用于生产环境）

```bash
# 1. 准备环境变量文件（可选）
cp docker-env.example .env
# 编辑 .env 文件，配置代理等参数

# 2. 准备配置文件
cp config/standalone.config.example.json config/standalone.config.json

# 3. 登录 Pixiv 账号（在主机上）
npm run login

# 4. 启动定时任务服务
docker-compose up -d pixivflow

# 或启动 API 服务器
docker-compose up -d pixivflow-webui

# 或同时启动两个服务
docker-compose up -d
```

---

## 📋 Docker 服务说明

`docker-compose.yml` 提供了两个服务：

### 1. pixivflow - 定时任务服务（默认）

- **功能**：自动执行定时下载任务
- **运行方式**：后台持续运行
- **健康检查**：自动检查数据库文件是否存在
- **端口**：无需端口映射

### 2. pixivflow-webui - API 服务器（可选）

- **功能**：提供 RESTful API 服务器
- **访问地址**：http://localhost:3000（可在 `.env` 中配置）
- **API 端点**：
  - `/api/auth` - 认证相关
  - `/api/config` - 配置管理
  - `/api/download` - 下载管理
  - `/api/stats` - 统计信息
  - `/api/logs` - 日志查看（WebSocket）
  - `/api/files` - 文件管理
- **前端集成**：前端已分离到独立仓库 [pixivflow-webui](https://github.com/zoidberg-xgd/pixivflow-webui)，可通过 API 与后端通信
- **健康检查**：自动检查 API 服务器是否可访问

---

## 🛠️ 常用命令

### 使用脚本

```bash
# 初始化环境
./scripts/pixiv.sh docker setup

# 构建镜像
./scripts/pixiv.sh docker build

# 部署服务
./scripts/pixiv.sh docker deploy

# 启动服务
./scripts/pixiv.sh docker up

# 停止服务
./scripts/pixiv.sh docker down

# 重启服务
./scripts/pixiv.sh docker restart

# 查看状态
./scripts/pixiv.sh docker status

# 查看日志
./scripts/pixiv.sh docker logs -f

# 进入容器
./scripts/pixiv.sh docker shell

# 在容器中执行命令
./scripts/pixiv.sh docker exec ls

# 登录账号
./scripts/pixiv.sh docker login

# 测试下载
./scripts/pixiv.sh docker test

# 随机下载
./scripts/pixiv.sh docker random
```

### 使用 docker-compose

```bash
# 启动定时任务服务
docker-compose up -d pixivflow

# 启动 API 服务器
docker-compose up -d pixivflow-webui

# 同时启动两个服务
docker-compose up -d

# 查看日志
docker-compose logs -f pixivflow
docker-compose logs -f pixivflow-webui

# 查看服务状态
docker-compose ps

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 重新构建镜像
docker-compose build --no-cache

# 查看资源使用情况
docker-compose top
```

---

## 🔐 登录账号

### 方式 1：使用脚本（推荐）

```bash
./scripts/pixiv.sh docker login
```

### 方式 2：在容器中登录

```bash
# 进入容器
./scripts/pixiv.sh docker shell

# 在容器中登录
node dist/index.js login
```

### 方式 3：在主机上登录（推荐）

```bash
# 在主机上登录，配置文件会自动同步到容器
npm run login
```

---

## 🧪 测试下载

### 方式 1：使用脚本

```bash
./scripts/pixiv.sh docker test
```

### 方式 2：随机下载

```bash
# 随机下载插画
./scripts/pixiv.sh docker random

# 随机下载小说
./scripts/pixiv.sh docker random --novel

# 随机下载多个作品
./scripts/pixiv.sh docker random --limit 5
```

---

## 📁 数据持久化

Docker 容器中的数据会持久化到主机的以下目录：

- **配置文件**：`./config/standalone.config.json`（只读挂载）
- **下载文件**：`./downloads/`
- **数据库**：`./data/pixiv-downloader.db`
- **日志文件**：`./data/pixiv-downloader.log`

这些目录通过 Docker volume 挂载，确保数据不会丢失。

### 数据备份

```bash
# 备份数据目录
tar -czf pixivflow-backup-$(date +%Y%m%d).tar.gz data/ config/ downloads/

# 恢复数据
tar -xzf pixivflow-backup-YYYYMMDD.tar.gz
```

---

## 🔧 配置说明

### 环境变量配置

推荐使用 `.env` 文件管理环境变量：

1. **复制示例文件**：
   ```bash
   cp docker-env.example .env
   ```

2. **编辑 `.env` 文件**，配置以下参数：
   ```bash
   # 时区
   TZ=Asia/Shanghai
   
   # 存储路径（容器内路径）
   PIXIV_DATABASE_PATH=/app/data/pixiv-downloader.db
   PIXIV_DOWNLOAD_DIR=/app/downloads
   PIXIV_ILLUSTRATION_DIR=/app/downloads/illustrations
   PIXIV_NOVEL_DIR=/app/downloads/novels
   
   # 日志级别
   PIXIV_LOG_LEVEL=info
   
   # 调度器配置
   PIXIV_SCHEDULER_ENABLED=true
   
   # WebUI 端口
   WEBUI_PORT=3000
   
   # 代理配置（如果代理在宿主机上）
   HTTP_PROXY=http://host.docker.internal:6152
   HTTPS_PROXY=http://host.docker.internal:6152
   # 或 SOCKS5 代理
   ALL_PROXY=socks5://host.docker.internal:6153
   ```

3. **启动服务**：
   ```bash
   docker-compose up -d
   ```

### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TZ` | 时区设置 | `Asia/Shanghai` |
| `PIXIV_DATABASE_PATH` | 数据库文件路径（容器内） | `/app/data/pixiv-downloader.db` |
| `PIXIV_DOWNLOAD_DIR` | 下载目录（容器内） | `/app/downloads` |
| `PIXIV_ILLUSTRATION_DIR` | 插画目录（容器内） | `/app/downloads/illustrations` |
| `PIXIV_NOVEL_DIR` | 小说目录（容器内） | `/app/downloads/novels` |
| `PIXIV_LOG_LEVEL` | 日志级别 | `info` |
| `PIXIV_SCHEDULER_ENABLED` | 是否启用调度器 | `true` |
| `WEBUI_PORT` | API 服务器端口（宿主机端口） | `3000` |
| `HTTP_PROXY` | HTTP 代理地址 | - |
| `HTTPS_PROXY` | HTTPS 代理地址 | - |
| `ALL_PROXY` | 通用代理地址（SOCKS5） | - |

### 端口映射

- **定时任务服务**：无需端口映射（后台运行）
- **API 服务器**：默认端口 3000（可在 `.env` 文件中通过 `WEBUI_PORT` 配置）

修改端口映射：

```yaml
# 在 docker-compose.yml 中修改
ports:
  - "8080:3000"  # 将宿主机端口改为 8080
```

或在 `.env` 文件中设置：
```bash
WEBUI_PORT=8080
```

---

## 🌐 网络配置

### 代理配置

如果需要在 Docker 容器中使用宿主机上的代理：

#### 方式 1：使用环境变量（推荐）

在 `.env` 文件中配置：
```bash
# HTTP/HTTPS 代理
HTTP_PROXY=http://host.docker.internal:6152
HTTPS_PROXY=http://host.docker.internal:6152

# SOCKS5 代理
ALL_PROXY=socks5://host.docker.internal:6153
```

#### 方式 2：在配置文件中设置

编辑 `config/standalone.config.json`：
```json
{
  "network": {
    "proxy": {
      "enabled": true,
      "host": "host.docker.internal",
      "port": 6152,
      "protocol": "http"
    }
  }
}
```

**注意**：
- macOS/Windows：使用 `host.docker.internal` 访问宿主机
- Linux：可以使用 `172.17.0.1` 或 `host.docker.internal`
- 如果代理只监听在 `127.0.0.1`，需要让代理监听在 `0.0.0.0` 或使用 `host.docker.internal`

### 自动代理调整

应用会自动检测运行环境并调整代理配置：
- 在 Docker 中运行时，如果代理地址是 `127.0.0.1`，会自动调整为 `host.docker.internal`
- 在本地运行时，如果代理地址是 `host.docker.internal`，会自动调整为 `127.0.0.1`

---

## 🏥 健康检查

Docker 容器配置了健康检查：

- **定时任务服务**：检查数据库文件是否存在
- **WebUI 服务**：检查 WebUI 是否可访问

查看健康状态：
```bash
docker-compose ps
```

---

## 🔍 故障排查

### 问题 1：网络连接问题

**症状**：无法访问 Pixiv API

**解决方法**：
1. 检查网络连接
2. 如果使用代理，检查代理配置：
   - 确认代理服务正在运行
   - 检查代理端口是否正确
   - 确认使用了 `host.docker.internal`（macOS/Windows）或 `172.17.0.1`（Linux）
3. 查看日志：`docker-compose logs -f pixivflow`

### 问题 2：登录失败

**症状**：无法登录或 Token 过期

**解决方法**：
1. 在主机上重新登录：`npm run login`
2. 或使用脚本登录：`./scripts/pixiv.sh docker login`
3. 检查配置文件是否正确挂载：`docker-compose exec pixivflow ls -la /app/config`

### 问题 3：数据丢失

**症状**：重启容器后数据丢失

**解决方法**：
1. 确保使用 Docker volume 挂载数据目录
2. 检查 `docker-compose.yml` 中的 volume 配置
3. 确认主机上的目录存在且有正确的权限

### 问题 4：API 服务器无法访问

**症状**：无法访问 http://localhost:3000

**解决方法**：
1. 检查服务是否运行：`docker-compose ps`
2. 检查端口映射：`docker-compose ps` 查看端口映射
3. 查看日志：`docker-compose logs -f pixivflow-webui`
4. 检查防火墙设置
5. 测试 API：`curl http://localhost:3000/api/health`

### 问题 5：镜像构建失败

**症状**：`docker-compose build` 失败

**解决方法**：
1. 检查网络连接（需要下载依赖）
2. 清理构建缓存：`docker-compose build --no-cache`
3. 检查 Dockerfile 语法
4. 查看详细错误信息：`docker-compose build --progress=plain`

### 问题 6：容器启动失败

**症状**：容器启动后立即退出

**解决方法**：
1. 查看日志：`docker-compose logs pixivflow`
2. 检查配置文件是否正确
3. 检查环境变量配置
4. 尝试交互式运行：`docker-compose run --rm pixivflow sh`

---

## 📊 资源使用

### 资源限制

可以在 `docker-compose.yml` 中设置资源限制：

```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

### 监控资源使用

```bash
# 查看资源使用情况
docker stats pixivflow pixivflow-webui

# 查看容器详细信息
docker inspect pixivflow
```

---

## 🔄 更新和维护

### 更新镜像

```bash
# 拉取最新代码
git pull

# 重新构建镜像
docker-compose build

# 重启服务
docker-compose up -d
```

### 清理资源

```bash
# 清理未使用的资源
docker system prune

# 清理所有相关资源（危险！）
./scripts/pixiv.sh docker clean-all
```

### 备份和恢复

```bash
# 备份
tar -czf backup-$(date +%Y%m%d).tar.gz data/ config/ downloads/

# 恢复
tar -xzf backup-YYYYMMDD.tar.gz
```

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [使用指南](./USAGE.md)
- [配置指南](./CONFIG.md)
- [脚本指南](./SCRIPTS.md)

---

## 💡 最佳实践

1. **使用 `.env` 文件**：将敏感信息和配置放在 `.env` 文件中，不要提交到版本控制
2. **定期备份**：定期备份 `data/` 和 `config/` 目录
3. **监控日志**：定期查看日志，及时发现问题
4. **资源限制**：在生产环境中设置适当的资源限制
5. **健康检查**：利用健康检查功能监控服务状态
6. **版本管理**：使用标签管理 Docker 镜像版本

---

## 🆘 获取帮助

如果遇到问题：

1. 查看日志：`docker-compose logs -f`
2. 检查文档：查看相关文档
3. 提交 Issue：在 GitHub 上提交问题报告
