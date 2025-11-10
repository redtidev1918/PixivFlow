# 🐳 Docker 使用指南

本文档介绍如何使用 Docker 运行 PixivFlow。

## 📋 目录

- [快速开始](#快速开始)
- [Docker Compose 使用](#docker-compose-使用)
- [手动构建和运行](#手动构建和运行)
- [数据持久化](#数据持久化)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## 🚀 快速开始

### 使用 Docker Compose（推荐）

1. **准备配置文件**

   首先，确保你有配置文件。如果还没有，可以复制示例配置：

   ```bash
   cp config/standalone.config.example.json config/standalone.config.json
   ```

   然后编辑 `config/standalone.config.json`，填入你的 Pixiv 账号信息。

2. **启动服务**

   ```bash
   # 启动定时任务服务
   docker-compose up -d pixivflow

   # 或启动 WebUI 服务
   docker-compose up -d pixivflow-webui
   ```

3. **查看日志**

   ```bash
   docker-compose logs -f pixivflow
   ```

4. **停止服务**

   ```bash
   docker-compose down
   ```

---

## 📦 Docker Compose 使用

### 服务说明

`docker-compose.yml` 提供了两个服务：

1. **pixivflow** - 定时任务服务（默认）
2. **pixivflow-webui** - WebUI 管理界面（可选）

### 使用 WebUI

WebUI 提供了现代化的 Web 管理界面，可以在浏览器中管理下载任务、查看统计、浏览文件等。

#### 启动 WebUI 服务

```bash
# 启动 WebUI 服务（会自动构建前端）
docker-compose up -d pixivflow-webui

# 或同时启动定时任务和 WebUI
docker-compose up -d
```

#### 访问 WebUI

启动后，打开浏览器访问：**http://localhost:3000**

> **注意**：Docker 中的 WebUI 使用生产模式，前端静态文件已内置在镜像中，无需单独构建。

#### WebUI 功能

- 📊 **下载统计**：查看下载概览、标签统计、作者统计
- 📁 **文件浏览**：浏览已下载的作品，支持预览（图片/小说）
- 📝 **实时日志**：查看实时运行日志
- ⚙️ **配置管理**：查看和更新配置文件
- 🎯 **任务管理**：启动/停止下载任务
- 📈 **下载历史**：查看历史下载记录

#### WebUI 环境变量

WebUI 服务支持以下环境变量（在 `docker-compose.yml` 中配置）：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | WebUI 端口 | `3000` |
| `HOST` | WebUI 主机 | `0.0.0.0` |
| `STATIC_PATH` | 前端静态文件路径 | `/app/webui-frontend/dist` |

#### 修改 WebUI 端口

如果需要修改 WebUI 端口，编辑 `docker-compose.yml`：

```yaml
pixivflow-webui:
  ports:
    - "8080:3000"  # 将宿主机端口改为 8080
  environment:
    - PORT=3000    # 容器内端口保持 3000
```

然后访问：http://localhost:8080

#### 查看 WebUI 日志

```bash
# 查看 WebUI 日志
docker-compose logs -f pixivflow-webui

# 查看最近 100 行日志
docker-compose logs --tail=100 pixivflow-webui
```

#### 停止 WebUI 服务

```bash
# 停止 WebUI 服务
docker-compose stop pixivflow-webui

# 停止并删除容器
docker-compose down pixivflow-webui
```

#### WebUI 与定时任务服务

- **独立运行**：可以只运行 WebUI 服务，不运行定时任务服务
- **共享数据**：两个服务共享相同的配置、数据和下载目录（通过卷挂载）
- **同时运行**：可以同时运行两个服务，WebUI 用于管理，定时任务用于自动下载

### 常用命令

```bash
# 启动定时任务服务
docker-compose up -d pixivflow

# 启动 WebUI 服务
docker-compose up -d pixivflow-webui

# 同时启动两个服务
docker-compose up -d

# 查看日志
docker-compose logs -f pixivflow

# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 重新构建镜像
docker-compose build

# 查看运行状态
docker-compose ps

# 随机下载作品（使用 docker.sh 脚本，推荐 ⭐）
./scripts/docker.sh random

# 随机下载小说
./scripts/docker.sh random --novel

# 随机下载多个作品
./scripts/docker.sh random --limit 5
```

### 自定义配置

你可以通过修改 `docker-compose.yml` 来自定义配置：

- **环境变量**：添加代理设置等
- **端口映射**：修改 WebUI 端口
- **资源限制**：设置 CPU 和内存限制
- **卷挂载**：修改数据存储路径

---

## 🔧 手动构建和运行

### 构建镜像

```bash
docker build -t pixivflow:latest .
```

### 运行容器

#### 方式 1：定时任务模式（推荐）

```bash
docker run -d \
  --name pixivflow \
  --restart unless-stopped \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/downloads:/app/downloads \
  -e TZ=Asia/Shanghai \
  pixivflow:latest
```

#### 方式 2：单次下载模式

```bash
docker run --rm \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/downloads:/app/downloads \
  pixivflow:latest \
  node dist/index.js download
```

#### 方式 3：WebUI 模式

```bash
docker run -d \
  --name pixivflow-webui \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/downloads:/app/downloads \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e STATIC_PATH=/app/webui-frontend/dist \
  -e PIXIV_DATABASE_PATH=/app/data/pixiv-downloader.db \
  -e PIXIV_DOWNLOAD_DIR=/app/downloads \
  -e PIXIV_ILLUSTRATION_DIR=/app/downloads/downloads/illustrations \
  -e PIXIV_NOVEL_DIR=/app/downloads/downloads/novels \
  pixivflow:latest \
  node dist/webui/index.js
```

**说明**：
- WebUI 服务会自动提供前端静态文件（已内置在镜像中）
- 访问地址：http://localhost:3000
- 确保设置了正确的路径环境变量，以便 WebUI 能够正确访问数据库和文件

#### 方式 4：交互式登录

```bash
docker run -it --rm \
  -v $(pwd)/config:/app/config \
  pixivflow:latest \
  node dist/index.js login
```

#### 方式 5：随机下载（推荐 ⭐）

随机下载是快速体验 Docker 环境下下载功能的最佳方式。

**使用 docker.sh 脚本（推荐）**：

```bash
# 随机下载一张图片（默认）
./scripts/docker.sh random

# 或使用简写
./scripts/docker.sh rd

# 随机下载一篇小说
./scripts/docker.sh random --novel

# 随机下载 5 个作品
./scripts/docker.sh random --limit 5

# 随机下载 3 篇小说
./scripts/docker.sh random --novel --limit 3
```

**直接使用 docker-compose**：

```bash
# 随机下载一张图片
docker-compose run --rm pixivflow \
  node dist/index.js random

# 随机下载小说
docker-compose run --rm pixivflow \
  node dist/index.js random --type novel

# 随机下载多个作品
docker-compose run --rm pixivflow \
  node dist/index.js random --limit 5
```

**功能特点**：

- ✅ 自动从热门标签中随机选择作品
- ✅ 自动使用 docker-compose.yml 中的代理配置
- ✅ 自动挂载配置、数据和下载目录
- ✅ 支持图片和小说两种类型
- ✅ 支持指定下载数量

**注意事项**：

1. 首次使用需要先完成登录：`./scripts/docker.sh login`
2. 确保配置文件存在：`config/standalone.config.json`
3. 确保 docker-compose.yml 中的代理配置正确
4. 如果 token 无效，脚本会自动提示需要重新登录

---

## 💾 数据持久化

### 目录说明

以下目录应该通过卷（volume）挂载到宿主机，以持久化数据：

| 容器内路径 | 宿主机路径 | 说明 |
|----------|----------|------|
| `/app/config` | `./config` | 配置文件目录 |
| `/app/data` | `./data` | 数据库和日志文件 |
| `/app/downloads` | `./downloads` | 下载的作品文件 |

### 使用命名卷（可选）

如果你不想使用绑定挂载，可以使用 Docker 命名卷：

```yaml
volumes:
  pixivflow-config:
  pixivflow-data:
  pixivflow-downloads:

services:
  pixivflow:
    volumes:
      - pixivflow-config:/app/config
      - pixivflow-data:/app/data
      - pixivflow-downloads:/app/downloads
```

---

## ⚙️ 配置说明

### 首次配置

1. **复制配置模板**

   ```bash
   cp config/standalone.config.example.json config/standalone.config.json
   ```

2. **编辑配置文件**

   编辑 `config/standalone.config.json`，至少需要配置：
   - `pixiv.refreshToken` - Pixiv 刷新令牌

3. **登录获取 Token**

   Docker 镜像已经包含了登录所需的所有依赖（Python gppt、Chromium 浏览器和 ChromeDriver），可以直接使用登录功能。

   **登录方式**：

   在 Docker 容器中登录，需要在终端中输入用户名和密码：

   ```bash
   docker run -it --rm \
     -v $(pwd)/config:/app/config \
     -e HTTPS_PROXY=http://host.docker.internal:7890 \
     pixivflow:latest \
     node dist/index.js login
   ```

   **使用配置向导**：

   ```bash
   docker run -it --rm \
     -v $(pwd)/config:/app/config \
     pixivflow:latest \
     node dist/setup-wizard.js
   ```

   **注意事项**：
   - 如果在中国大陆，需要设置代理环境变量（`HTTPS_PROXY` 或 `ALL_PROXY`）
   - 登录时会在终端中提示输入用户名和密码
   - 登录成功后，refresh token 会保存到配置文件中

### 环境变量

可以通过环境变量配置：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `TZ` | 时区 | `Asia/Shanghai` |
| `HTTP_PROXY` | HTTP 代理 | - |
| `HTTPS_PROXY` | HTTPS 代理 | - |
| `ALL_PROXY` | 全局代理 | - |
| `PORT` | WebUI 端口 | `3000` |
| `HOST` | WebUI 主机 | `0.0.0.0` |
| `PIXIV_DATABASE_PATH` | 数据库文件路径（容器内路径） | `/app/data/pixiv-downloader.db` |
| `PIXIV_DOWNLOAD_DIR` | 下载根目录（容器内路径） | `/app/downloads` |
| `PIXIV_ILLUSTRATION_DIR` | 插画保存目录（容器内路径） | `/app/downloads/downloads/illustrations` |
| `PIXIV_NOVEL_DIR` | 小说保存目录（容器内路径） | `/app/downloads/downloads/novels` |
| `PIXIV_SKIP_AUTO_LOGIN` | 跳过容器内自动登录 | `true`（Docker 环境推荐） |

**重要提示**：
- Docker 环境中的路径配置需要使用**容器内路径**（如 `/app/data/...`），而不是宿主机路径
- `docker-compose.yml` 已自动配置这些环境变量，通常无需手动修改
- 如果修改了卷挂载路径，需要相应更新这些环境变量

### 代理设置

如果需要通过代理访问 Pixiv，可以在 `docker-compose.yml` 中设置环境变量。

#### 使用本机代理（推荐）

如果代理软件运行在本机（如 Clash、V2Ray、Shadowsocks 等），需要使用特殊地址访问：

**macOS/Windows**：
```yaml
environment:
  - HTTP_PROXY=http://host.docker.internal:7890
  - HTTPS_PROXY=http://host.docker.internal:7890
  # 或使用 SOCKS5
  - ALL_PROXY=socks5://host.docker.internal:1080
```

**Linux**：
```yaml
environment:
  # 方式 1：使用 host.docker.internal（Docker 20.10+）
  - HTTP_PROXY=http://host.docker.internal:7890
  # 方式 2：使用 Docker 默认网关
  - HTTP_PROXY=http://172.17.0.1:7890
```

**说明**：
- `host.docker.internal` 是 Docker 提供的特殊主机名，指向宿主机
- 如果使用 `172.17.0.1`，这是 Docker 默认网桥的网关 IP
- 将 `7890` 和 `1080` 替换为你实际的代理端口

#### 使用局域网代理

如果代理在局域网其他机器上：
```yaml
environment:
  - HTTP_PROXY=http://192.168.1.100:7890
  - HTTPS_PROXY=http://192.168.1.100:7890
```

#### 使用远程代理

如果代理在远程服务器：
```yaml
environment:
  - HTTP_PROXY=http://proxy.example.com:8080
  - HTTPS_PROXY=http://proxy.example.com:8080
```

#### 支持的代理协议

- `http://` - HTTP 代理
- `https://` - HTTPS 代理
- `socks5://` - SOCKS5 代理
- `socks4://` - SOCKS4 代理

#### 验证代理配置

配置后重启容器，查看日志确认代理是否生效：
```bash
docker-compose restart pixivflow
docker-compose logs pixivflow | grep -i proxy
```

如果看到类似 `Proxy enabled` 或 `Proxy configured from environment variable` 的日志，说明代理配置成功。

---

## 🐛 常见问题

### 1. 容器启动后立即退出

**可能原因**：
- 配置文件不存在或格式错误
- refresh token 无效或过期

**解决方法**：
```bash
# 检查日志
docker-compose logs pixivflow

# 验证配置文件
docker run --rm \
  -v $(pwd)/config:/app/config \
  pixivflow:latest \
  node -e "console.log(JSON.stringify(require('./config/standalone.config.json'), null, 2))"
```

### 2. 无法下载文件

**可能原因**：
- 网络连接问题
- 需要配置代理
- 权限问题

**解决方法**：
- 检查网络连接
- 配置代理环境变量
- 检查卷挂载权限

### 3. 配置文件修改后不生效

**解决方法**：
```bash
# 重启容器
docker-compose restart pixivflow
```

### 4. 如何更新镜像

```bash
# 拉取最新代码
git pull

# 重新构建镜像
docker-compose build

# 重启服务
docker-compose up -d
```

### 5. 查看容器内文件

```bash
# 进入容器
docker exec -it pixivflow sh

# 查看日志
docker exec pixivflow cat /app/data/pixiv-downloader.log
```

### 6. 清理数据

```bash
# 停止并删除容器
docker-compose down

# 删除数据（谨慎操作）
rm -rf data downloads

# 重新启动
docker-compose up -d
```

### 7. WebUI 无法显示下载历史或预览文件

**可能原因**：
- 数据库中的文件路径是宿主机路径，但容器需要使用容器内路径
- 路径配置不正确

**解决方法**：
1. **检查环境变量配置**：确保 `docker-compose.yml` 中已正确配置路径环境变量：
   ```yaml
   environment:
     - PIXIV_DATABASE_PATH=/app/data/pixiv-downloader.db
     - PIXIV_DOWNLOAD_DIR=/app/downloads
     - PIXIV_ILLUSTRATION_DIR=/app/downloads/downloads/illustrations
     - PIXIV_NOVEL_DIR=/app/downloads/downloads/novels
   ```

2. **重启服务**：
   ```bash
   docker-compose restart pixivflow-webui
   ```

3. **验证路径**：
   ```bash
   # 检查容器内的路径配置
   docker exec pixivflow-webui env | grep PIXIV
   ```

**说明**：
- 系统会自动将数据库中的宿主机路径转换为容器内路径
- 如果仍有问题，检查卷挂载是否正确：`docker-compose ps` 和 `docker-compose config`

### 8. Docker 网络问题：容器无法访问主机代理

**问题描述**：
在 macOS 上使用 Docker 时，如果代理软件（如 Clash、Surge、V2Ray 等）只监听在 `127.0.0.1`，Docker 容器无法直接访问。

**解决方案**：

#### 方案 1：使用 host.docker.internal（推荐）

使用 `host.docker.internal` 是 Docker Desktop 推荐的方式，可以自动解析到主机 IP：

```yaml
environment:
  - HTTP_PROXY=http://host.docker.internal:7890
  - HTTPS_PROXY=http://host.docker.internal:7890
```

**说明**：
- `host.docker.internal` 是 Docker Desktop 提供的特殊主机名，指向宿主机
- 将 `7890` 替换为你实际的代理端口
- 在 Linux 上，Docker 20.10+ 也支持 `host.docker.internal`

#### 方案 2：使用代理转发服务

如果方案 1 不工作，可以使用代理转发服务：

1. **启动代理转发服务**（在主机上运行）：
   ```bash
   # 使用自动启动脚本（推荐）
   ./scripts/start-proxy-forwarder.sh 6154 127.0.0.1:6152
   
   # 或手动启动
   node scripts/proxy-forwarder.js 6154 127.0.0.1:6152
   ```

2. **配置 Docker 使用转发端口**：
   ```yaml
   environment:
     - HTTP_PROXY=http://host.docker.internal:6154
     - HTTPS_PROXY=http://host.docker.internal:6154
   ```

3. **验证转发服务**：
   ```bash
   # 在主机上测试
   curl -v -x http://127.0.0.1:6154 https://www.google.com
   ```

**注意事项**：
- 代理转发服务需要持续运行
- 如果代理端口不是 6152，请相应修改转发服务的参数
- 查看日志：`tail -f /tmp/proxy-forwarder-6154.log`

#### 方案 3：使用 Docker 网关 IP（Linux）

在 Linux 上，可以使用 Docker 默认网关：

```yaml
environment:
  - HTTP_PROXY=http://172.17.0.1:7890
  - HTTPS_PROXY=http://172.17.0.1:7890
```

**说明**：
- `172.17.0.1` 是 Docker 默认网桥的网关 IP
- 可以通过 `./scripts/get-docker-gateway.sh` 获取实际的网关 IP

#### 故障排除

如果仍然无法连接：

1. **检查转发服务是否运行**：
   ```bash
   lsof -i :6154
   ```

2. **检查容器是否能访问网关**：
   ```bash
   docker-compose run --rm pixivflow ping -c 1 172.17.0.1
   ```

3. **检查转发服务日志**：
   ```bash
   tail -f /tmp/proxy-forwarder-6154.log
   ```

4. **尝试直接测试代理**：
   ```bash
   curl -x http://127.0.0.1:6152 https://www.google.com
   ```

### 9. 随机下载相关问题

**问题描述**：
在使用 Docker 执行随机下载时，可能遇到以下问题：
1. Token 刷新超时
2. 容器内无法进行交互式登录
3. 代理连接可能失败

**解决方案**：

#### 1. 确保 Token 在主机上有效

在运行 Docker 命令之前，先在主机上验证 token：

```bash
node -e "const { loadConfig, getConfigPath } = require('./dist/config'); const { TerminalLogin } = require('./dist/terminal-login'); const config = loadConfig(getConfigPath()); TerminalLogin.refresh(config.pixiv.refreshToken).then(() => console.log('✓ Token is valid')).catch(e => console.log('✗ Token is invalid:', e.message))"
```

如果 token 无效，在主机上重新登录：

```bash
node dist/index.js login
```

#### 2. 使用便捷脚本

使用 `scripts/docker.sh` 脚本执行随机下载：

```bash
# 随机下载一张图片
./scripts/docker.sh random

# 随机下载一篇小说
./scripts/docker.sh random --novel

# 随机下载5个作品
./scripts/docker.sh random --limit 5
```

脚本会自动：
- 验证 token 是否有效
- 使用 docker-compose 运行（自动使用代理和配置）
- 提供清晰的错误提示

#### 3. 增加网络超时时间

如果遇到超时问题，可以在配置文件中增加超时时间：

```json
{
  "network": {
    "timeoutMs": 30000,
    "retries": 3,
    "retryDelay": 1000
  }
}
```

#### 4. 常见问题

**Q: 为什么容器内无法登录？**

A: 容器内没有图形界面，无法打开浏览器进行交互式登录。需要在主机上登录后，将 token 更新到配置文件中。

**Q: Token 刷新超时怎么办？**

A:
1. 增加配置文件中的 `timeoutMs` 值
2. 检查网络连接和代理设置
3. 确保代理服务正常运行

### 10. Docker 构建时无法连接 Docker Hub

**可能原因**：
- 网络连接问题
- 需要配置 Docker Desktop 的代理

**解决方法**：

#### 方法 1：配置 Docker Desktop 代理（推荐）

1. 打开 Docker Desktop
2. 进入 Settings → Resources → Proxies
3. 启用 "Manual proxy configuration"
4. 填入代理地址（如 `http://127.0.0.1:7890`）
5. 点击 "Apply & Restart"

#### 方法 2：使用环境变量配置代理

在构建前设置代理环境变量：

```bash
# macOS/Linux
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
docker-compose build

# Windows PowerShell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
docker-compose build
```

#### 方法 3：手动拉取镜像

如果网络暂时无法连接，可以稍后重试：

```bash
# 手动拉取基础镜像
docker pull node:18-alpine

# 然后再构建
docker-compose build
```

#### 方法 4：使用国内镜像源（仅限国内用户）

创建或编辑 `~/.docker/daemon.json`：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

然后重启 Docker Desktop。

---

## 🔒 安全建议

1. **不要将配置文件提交到 Git**
   - 确保 `config/standalone.config.json` 在 `.gitignore` 中

2. **使用环境变量存储敏感信息**
   - 考虑使用 Docker secrets 或环境变量文件

3. **限制容器资源**
   - 在 `docker-compose.yml` 中设置资源限制

4. **定期备份数据**
   - 定期备份 `data/` 和 `config/` 目录

---

## 📚 更多信息

- [项目 README](../../README.md)
- [配置指南](../guides/CONFIG_GUIDE.md)
- [快速开始](../getting-started/QUICKSTART.md)
- [WebUI 使用指南](../webui/WEBUI_README.md)

---

## 💡 提示

- 首次使用建议先运行单次下载模式测试配置
- 使用 `docker-compose logs -f` 实时查看日志
- 定期检查容器健康状态：`docker-compose ps`
- 建议使用 Docker Compose 管理服务，更方便

---

**需要帮助？** 查看 [常见问题](#常见问题) 或提交 [GitHub Issue](https://github.com/zoidberg-xgd/pixivflow/issues)

