# Docker 指南

PixivFlow 支持 Docker 部署，无需安装 Node.js 环境。

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

### 方式 2：使用 docker-compose

```bash
# 1. 准备配置文件
cp config/standalone.config.example.json config/standalone.config.json

# 2. 登录 Pixiv 账号（在主机上）
npm run login

# 3. 启动定时任务服务
docker-compose up -d pixivflow

# 或启动 WebUI 服务
docker-compose up -d pixivflow-webui

# 或同时启动两个服务
docker-compose up -d
```

---

## 📋 Docker 服务说明

`docker-compose.yml` 提供了两个服务：

### 1. pixivflow - 定时任务服务（默认）

- 自动执行定时下载任务
- 后台持续运行

### 2. pixivflow-webui - WebUI 管理界面（可选）

- 提供现代化的 Web 管理界面
- 访问地址：http://localhost:3000
- 支持文件浏览、统计查看、任务管理等

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

# 启动 WebUI 服务
docker-compose up -d pixivflow-webui

# 同时启动两个服务
docker-compose up -d

# 查看日志
docker-compose logs -f pixivflow
docker-compose logs -f pixivflow-webui

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 重新构建镜像
docker-compose build
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

- **配置文件**：`./config/standalone.config.json`
- **下载文件**：`./downloads/`
- **数据库**：`./data/pixiv-downloader.db`
- **日志文件**：`./data/pixiv-downloader.log`

这些目录通过 Docker volume 挂载，确保数据不会丢失。

---

## 🔧 配置说明

### 环境变量

可以通过环境变量配置 Docker 容器：

```bash
# 设置代理
export all_proxy=socks5://127.0.0.1:6153

# 启动服务
docker-compose up -d
```

### 端口映射

- **定时任务服务**：无需端口映射（后台运行）
- **WebUI 服务**：端口 3000（可在 docker-compose.yml 中修改）

---

## ❓ 常见问题

### 问题 1：网络连接问题

**症状**：无法访问 Pixiv API

**解决方法**：
1. 检查网络连接
2. 如果使用代理，在配置文件中设置代理
3. 或使用环境变量设置代理

### 问题 2：随机下载问题

**症状**：随机下载失败

**解决方法**：
1. 检查网络连接
2. 检查配置文件是否正确
3. 查看日志：`./scripts/pixiv.sh docker logs`

### 问题 3：数据丢失

**症状**：重启容器后数据丢失

**解决方法**：
1. 确保使用 Docker volume 挂载数据目录
2. 检查 `docker-compose.yml` 中的 volume 配置

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [使用指南](./USAGE.md)
- [配置指南](./CONFIG.md)
- [脚本指南](./SCRIPTS.md)

