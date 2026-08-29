# Docker 部署指南

> **English:** This guide covers deploying PixivFlow with Docker Compose: prerequisites,
> the five-minute deployment route (.env setup, credential injection, `docker compose up`),
> enabling the WebUI service, the two-service topology with shared volumes, the full
> environment variable reference, data persistence and backup, upgrade and rollback
> procedures, and a troubleshooting table for common container failures. All commands use
> Compose V2 syntax. Read top to bottom for first-time setup, or jump to a section for
> maintenance tasks.

> **联合部署套件**：如果还需要 TelePost（Telegram 频道投稿机器人），推荐使用
> [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy)
> —— 一套 Compose 同时启动 PixivFlow + TelePost，支持 Polling/Webhook 双模式，
> 可选 Mihomo 代理（国内服务器），以及 Fly.io 低成本托管。

本文档面向通过 Docker 在服务器或 NAS 上长期运行 PixivFlow 的用户，覆盖部署、登录、升级与排障全流程。
所有命令基于 Compose V2（`docker compose`）。非容器环境的原生安装见[快速开始](./QUICKSTART.md)。

## 适用场景

服务器持续挂机收集时，Docker 提供裸跑 Node.js 难以得到的保障：进程崩溃或宿主机重启后由 `restart: unless-stopped` 自动拉起、内置健康检查、以及隔离的运行时（Node 18、Chromium、gppt 打包在镜像内，宿主机无需安装依赖）。
只想临时手动下载几个作品，不必上 Docker。

## 服务组成

`docker-compose.yml` 定义两个服务，共用同一本地构建镜像（标签 `pixivflow:latest`）：

| 项目 | pixivflow | pixivflow-webui |
| --- | --- | --- |
| 定位 | 定时下载任务（守护进程） | Web 管理界面 |
| 启动命令 | `node dist/index.js scheduler`（镜像默认 CMD） | `node dist/webui/index.js` |
| 监听端口 | 无 | 容器内固定 3000 |
| 宿主机端口 | 无 | `${WEBUI_PORT:-3000}` 映射到 3000 |
| 健康检查 | 检查 `/app/data/pixiv-downloader.db` 文件是否生成 | shell 形式 wget 探测 `/api/health`（后端同时注册了 `/health` 别名） |
| 启动依赖 | 无 | `depends_on` 要求 pixivflow 先进入 healthy 状态 |

两个服务共享同一组绑定挂载卷：

| 宿主机目录 | 容器内路径 | 权限 | 内容 |
| --- | --- | --- | --- |
| `./config` | `/app/config` | 只读 | 配置文件等 |
| `./data` | `/app/data` | 读写 | SQLite 数据库、日志 |
| `./downloads` | `/app/downloads` | 读写 | 下载产物 |

注意：`./config` 以只读方式挂载，所以 WebUI 不能回写；但宿主机可直接原子替换
`config/standalone.config.json`。调度器会自动校验并热重载 Cron、targets、delivery
和 download 设置，无需重启容器。`pixiv`、`network`、`storage` 变更仍需执行
`docker compose restart pixivflow`。字段含义见[配置手册](./CONFIG.md)。

推荐用临时文件加 `mv`，避免调度器看到编辑到一半的内容：

```bash
cp /path/to/new-config.json config/standalone.config.json.new
mv config/standalone.config.json.new config/standalone.config.json
```

## 内存实测（256 MB cgroup）

`mode: "topic"` 语义主题下载已按 256 MB 内存限制真实验证（Fly 256 MB 机器、
Linux cgroup、生产联合镜像、真实 Pixiv API、`NODE_OPTIONS=--max-old-space-size=128`）：

| 场景 | 结果 | 峰值 RSS（全进程） |
| --- | --- | --- |
| topic 发现（cache miss + refresh） | 成功 | 106 MB |
| topic 采集 + Metadata 过滤 + 热度排名 | 成功 | 106 MB |
| illustration + novel 双 target 同一计划下载 | 成功 | 106 MB |

- 全部场景 `exit 0`、`oom_killed=false`、无重启；距 256 MB 上限余量约 150 MB。
- 堆使用峰值 ≈ 33 MB（heapUsed），远低于 128 MB 堆上限。
- 关键保障：相关 Tag ≤ 12、采样 ≤ 100、候选池 ≤ 250、串行低并发请求、
  候选对象字段裁剪、`limit=1` 用 O(n) 选取、API 响应随迭代释放。

## 前置要求

- Docker Engine 与 Compose V2 插件；验证命令 `docker compose version`。
- 本仓库源码。镜像从源码构建，官方未发布 registry 镜像，无法直接 pull。
- **WebUI 前端源码**：仓库只带一个 `webui-frontend/.gitkeep` 占位目录，Dockerfile 构建时会自动按优先级处理——上下文中已有完整前端源码则直接使用；缺失时浅克隆官方前端仓库 [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) 后再构建（需要构建机可访问 GitHub）。镜像默认开箱即用；空气隔离环境可跳过前端：

```bash
# 本地已有前端源码时手动放置:
git clone https://github.com/redtidev1918/pixivflow-webui.git webui-frontend

# 或完全跳过前端,产出仅含 API 的镜像:
docker compose build --build-arg SKIP_WEBUI_BUILD=true
```

准备数据目录并自检版本：

```bash
mkdir -p data downloads
docker compose version   # 应输出 v2.x
```

## 五分钟部署路线

### 第 1 步：初始化环境变量

```bash
cp docker-env.example .env
```

`.env` 同时承担两个角色：Compose 的变量插值来源，以及经 `env_file:` 注入两个容器的环境变量。
最常编辑的字段：

```bash
# 时区
TZ=Asia/Shanghai

# Pixiv 凭据（字段名固定为此形式，详见「登录与凭据」）
PIXIV_REFRESH_TOKEN=你的_refresh_token

# 代理运行在宿主机时（示例为 macOS）
HTTP_PROXY=http://host.docker.internal:6152
HTTPS_PROXY=http://host.docker.internal:6152
```

凭据有三种注入方式，见[登录与凭据](#登录与凭据)，先让服务跑起来也无妨。

### 第 2 步：准备配置文件

```bash
cp config/examples/standalone.config.simple.json config/standalone.config.json
```

编辑其中 `targets` 数组定义要下载的内容。`pixiv.refreshToken` 可以保留占位符 `YOUR_REFRESH_TOKEN`，配合 `.env` 里的 `PIXIV_REFRESH_TOKEN` 使用——应用加载时会用环境变量覆盖配置文件的同名字段。

### 第 3 步：启动定时下载服务

```bash
docker compose up -d pixivflow
```

首次执行会自动构建镜像（数分钟），之后复用已有镜像秒级启动。

### 第 4 步：验证

```bash
docker compose ps                    # STATUS 应显示 Up (healthy)；start_period 内显示 starting 属正常
docker compose logs -f pixivflow    # 观察调度器输出，Ctrl+C 结束跟踪
docker compose exec pixivflow ls /app/data   # 应能看到数据库文件
```

两点须知：

- 健康检查只验证 `/app/data/pixiv-downloader.db` 文件存在，**不代表登录有效**；登录状态要看日志有无 `Authentication Error`。
- 对应宿主机目录应出现内容：`data/` 有数据库文件，下载发生一次后 `downloads/` 出现产物。

## 启用 WebUI

```bash
docker compose up -d pixivflow-webui
```

由于 `depends_on: condition: service_healthy`，这条命令会同时拉起 `pixivflow` 并等待其健康后才启动 WebUI 容器。只要 WebUI 不想被定时服务捆绑，可在 `docker-compose.yml` 中删除这段 `depends_on`。

浏览器访问 <http://localhost:3000>。更换宿主机端口的两种方式：

```bash
# 方式一：编辑 .env 后重建容器
WEBUI_PORT=8080
docker compose up -d pixivflow-webui
```

```yaml
# 方式二：改 docker-compose.yml 的 ports 段
ports:
  - "8080:3000"   # 左侧是宿主机端口，右侧容器内端口保持 3000
```

要点：

- `WEBUI_PORT` 只控制宿主机一侧映射。容器内监听端口由 compose 固定为 3000（`PORT`、`HOST`、`STATIC_PATH` 三个变量同样是固定值，见环境变量参考表），要改容器内端口需自行编辑 `docker-compose.yml` 的 `environment` 段。
- **公网访问务必加认证**：在 `.env` 中同时设置 `WEBUI_USERNAME` 与 `WEBUI_PASSWORD`，即为 WebUI 全站（静态页、API、Socket.IO）启用 HTTP Basic Auth（`/api/health` 除外）；或在反向代理层做认证 + TLS。两者都不做时，任何能访问该端口的人都可以读取配置中的 Pixiv 凭据并操控下载。
- 前端静态资源已构建进镜像内的 `/app/webui-frontend/dist`，无需额外挂载。
- 配置只读挂载带来的限制见「服务组成」一节。

## 登录与凭据

容器内不能交互式登录：compose 已强制注入 `PIXIV_SKIP_AUTO_LOGIN=true`，阻止调度器在无人值守环境下反复触发浏览器自动化（登录适配链为 pixiv-token-getter → Puppeteer → Python gppt，见[登录指南](./LOGIN.md)）。
正确做法是在容器外取得 refresh token，再送入容器。三种途径：

### 方式 A：写入 .env（推荐）

```bash
# .env
PIXIV_REFRESH_TOKEN=你的_refresh_token
```

```bash
docker compose up -d   # .env 改动需要重建容器才生效
```

应用启动时将 `PIXIV_REFRESH_TOKEN` 映射到配置的 `pixiv.refreshToken` 字段，不必动配置文件。客户端 ID/密钥已有内置默认值，通常不需要设置 `PIXIV_CLIENT_ID` 与 `PIXIV_CLIENT_SECRET`。

### 方式 B：写入配置文件

编辑宿主机 `config/standalone.config.json`：

```json
{
  "pixiv": {
    "refreshToken": "你的_refresh_token",
    "clientId": "MOBrBDS8blbauoSck0ZfDbtuzpyT",
    "clientSecret": "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj"
  }
}
```

然后重启服务：`docker compose restart pixivflow`。认证与网络属于不可热更新字段；
Cron、tag、交付地址等日常任务设置保存后会自动生效。`clientId`/`clientSecret`
用上方默认值即可，配置结构详见[配置手册](./CONFIG.md)。

### 方式 C：宿主机先登录

宿主机装有 Node.js 时可直接本机登录，再把生成的 token 放进上述任一位置：

```bash
# 在仓库根目录执行；本机有浏览器
npm run login

# 本机无图形界面，用账号密码
pixivflow login-headless -u 用户名 -p 密码

# 校验既有 token 并写入指定配置
pixivflow refresh <refresh_token> --config "$(pwd)/config/standalone.config.json"
```

三种登录方式的适用条件与细节见[登录指南](./LOGIN.md)。

安全须知：

- refresh token 等同于账号密码；泄露后立即修改 Pixiv 密码使其失效。
- `.env` 已列入 `.gitignore` 与 `.dockerignore`，不会进入版本库或镜像层。
- Token 过期（API 返回 401）后的处置见[登录指南 · 常见问题](./LOGIN.md)。

## 环境变量参考

下表覆盖 `docker-compose.yml` 与 `docker-env.example` 出现的全部变量。「来源」列说明注入层级。

| 变量 | 来源 | 说明 | 默认值 |
| --- | --- | --- | --- |
| `TZ` | .env → 插值 | 容器时区 | `Asia/Shanghai` |
| `WEBUI_PORT` | .env → 插值 | WebUI 宿主机映射端口 | `3000` |
| `WEBUI_USERNAME` / `WEBUI_PASSWORD` | — | 两者同时设置即启用 WebUI Basic Auth（全站含 Socket.IO；`/api/health` 除外） |
| `WEBUI_TLS_CERT` / `WEBUI_TLS_KEY` | — | 同时设置即以 HTTPS 监听（证书需容器内可读，如挂载 `./certs:/app/certs:ro`）；仅设置其一视为配置错误并拒绝启动 |
| `PORT` | compose 固定 | WebUI 容器内监听端口 | `3000` |
| `HOST` | compose 固定 | WebUI 容器内监听地址 | `0.0.0.0` |
| `STATIC_PATH` | compose 固定 | 前端静态资源目录（容器内） | `/app/webui-frontend/dist` |
| `PIXIV_DATABASE_PATH` | .env 可覆盖 | 数据库绝对路径（容器内视角） | `/app/data/pixiv-downloader.db` |
| `PIXIV_DOWNLOAD_DIR` | .env 可覆盖 | 下载总目录（容器内） | `/app/downloads` |
| `PIXIV_ILLUSTRATION_DIR` | .env 可覆盖 | 插画子目录（容器内） | `/app/downloads/illustrations` |
| `PIXIV_NOVEL_DIR` | .env 可覆盖 | 小说子目录（容器内） | `/app/downloads/novels` |
| `PIXIV_LOG_LEVEL` | .env 可覆盖 | 日志级别：debug / info / warn / error | `info` |
| `PIXIV_DB_CACHE_KB` | .env 可覆盖 | SQLite 页缓存，限制在 1024～65536 KiB | `8192` |
| `PIXIV_SCHEDULER_ENABLED` | .env 可覆盖 | 调度开关，仅对 pixivflow 服务有意义 | `true` |
| `PIXIV_SKIP_AUTO_LOGIN` | compose 固定 | 跳过容器内交互登录 | `true` |
| `PIXIV_REFRESH_TOKEN` | .env 可选 | 覆盖配置的 `pixiv.refreshToken` | 空 |
| `PIXIV_CLIENT_ID` | .env 可选 | 覆盖配置的 `pixiv.clientId` | 空 |
| `PIXIV_CLIENT_SECRET` | .env 可选 | 覆盖配置的 `pixiv.clientSecret` | 空 |
| `HTTP_PROXY` / `HTTPS_PROXY` | .env 可选 | HTTP(S) 代理地址 | 空 |
| `ALL_PROXY` | .env 可选 | SOCKS5 等通用代理 | 空 |
| 小写 `http_proxy` 等 | .env 可选 | 大小写两种形式都会读取 | 空 |

代理的三条应用层规则（源码行为）：

- 生效优先级为 `all_proxy` > `https_proxy` > `http_proxy`。
- 仅当配置文件中 `network.proxy.enabled` 未开启时才采用环境变量代理；两者同时存在以配置文件为准。
- 支持 HTTP 与 SOCKS5 地址，如 `socks5://host.docker.internal:6153`。

代理指向宿主机时的地址约定：

- macOS / Windows Docker Desktop：使用 `host.docker.internal`。
- Linux：也可用 `172.17.0.1`（默认网桥网关）；compose 已写入 `extra_hosts: host.docker.internal:host-gateway`，Linux 上同样可用域名形式。
- 代理只监听 `127.0.0.1` 时容器不可达，需改为监听 `0.0.0.0` 或对应网桥地址。

## 数据持久化与备份

全部持久化数据都在三个绑定挂载目录中，删除重建容器不影响：

| 内容 | 宿主机位置 | 说明 |
| --- | --- | --- |
| 配置 | `config/standalone.config.json` | 手工维护；含真实 token 时勿提交 Git |
| 数据库 | `data/pixiv-downloader.db` | SQLite 单文件，记录历史与去重依据 |
| 运行日志 | `data/pixiv-downloader.log` | 写在与数据库相同的目录 |
| 统一存储的 token | `data/.pixiv-refresh-token` | 加载到合法 token 后自动落盘，附带 `.backup` 备份 |
| 下载产物 | `downloads/` | 插画与小说分别落在子目录 |

备份前停止写入，避免拷贝 SQLite 半写状态：

```bash
docker compose stop pixivflow pixivflow-webui
tar -czf pixivflow-backup-$(date +%Y%m%d).tar.gz data/ config/ downloads/
docker compose start pixivflow pixivflow-webui
```

恢复即解包覆盖同名目录。CLI 还提供 `pixivflow backup` 与 `pixivflow maintain` 维护子命令，见[使用指南](./USAGE.md)。

## 升级与回滚

镜像来自本地构建（`pixivflow:latest`），没有官方远程镜像可拉取，升级即重新构建：

```bash
git pull
docker compose build
docker compose up -d
```

前端仓库更新时，在其目录内执行 `git pull` 后同样重新 `docker compose build`。

升级注意事项：

1. 跨版本升级前做一次完整备份（上一节的 tar 流程）。
2. 新版本代码直接打开既有的 SQLite 库文件；仓库不提供降级工具，**回滚前必须还原当时的 data 备份**。
3. 配置字段如有增删，对照[配置手册](./CONFIG.md)同步修改。

回滚流程：

```bash
docker compose down
git checkout vX.Y.Z                                              # 切回目标版本
docker compose build
tar -xzf pixivflow-backup-YYYYMMDD.tar.gz                        # 还原 data/config/downloads
docker compose up -d
```

## 故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 容器反复重启 | 配置校验失败导致进程退出，又被 `unless-stopped` 拉起 | `docker compose logs pixivflow` 找 `Configuration Error`：常见原因为缺 `targets`、JSON 语法错误、token 全部为空 |
| pixivflow 健康检查失败 | `start_period`（40 秒）内属正常；超时说明数据库文件一直没生成 | 查日志中的数据库初始化报错；确认宿主机 `./data` 目录可写 |
| pixivflow-webui 显示 unhealthy 但页面正常打开 | 健康检查从启动到首次探测最长有 `start_period`（40 秒）宽限期 | 超过宽限期仍 unhealthy 才是异常：看 `docker inspect --format '{{json .State.Health.Log}}' pixivflow-webui` 的最后一条输出；真实状态可用 `curl http://localhost:${WEBUI_PORT:-3000}/api/health` 验证 |
| 下载 0 个作品 | 条件过严（日期/收藏数/limit）、搜索词与站内写法不一致、token 失效 | 先用最小 targets 验证链路；设 `PIXIV_LOG_LEVEL=debug` 重启后看逐条过滤日志 |
| 连不上 Pixiv API | 未配代理或代理容器内不可达 | 按「环境变量参考」检查代理优先级和 `network.proxy.enabled` 冲突；确认监听地址可达；Linux 备选 `172.17.0.1` |
| WebUI 打不开 / 白屏 / 502 | 服务未启动、端口未映射、静态资源缺失 | `docker compose ps` 核对映射；日志搜 `[WebUI] STATIC_PATH` 行，确认解析路径存在且 `index.html exists: true`；反向代理应指向宿主机映射端口 |
| `Authentication Error` / 401 | refresh token 缺失或过期 | 重新获取 token，按「登录与凭据」三选一更新，再重启容器 |
| 日志时间不对 | `TZ` 未设置或与调度时区不一致 | `.env` 设置 `TZ`；定时频率的解释时区取配置内 `scheduler.timezone` |

常用排查命令：

```bash
docker compose ps                              # 各容器状态与端口映射
docker compose logs --tail 100 pixivflow       # 最近日志
docker stats pixivflow pixivflow-webui         # CPU/内存占用
```

CPU/内存限制的注释模板位于 `docker-compose.yml` 的 `deploy.resources` 一段，按需取消注释生效。

---

## 相关文档

-
 
[
p
i
x
i
v
f
l
o
w
-
w
e
b
u
i
]
(
h
t
t
p
s
:
/
/
g
i
t
h
u
b
.
c
o
m
/
r
e
d
t
i
d
e
v
1
9
1
8
/
p
i
x
i
v
f
l
o
w
-
w
e
b
u
i
)
 
—
—
 
构
建
镜
像
时
自
动
克
隆
的
前
端
源
码
来
源

- [快速开始](./QUICKSTART.md) — 非 Docker 场景的原生安装与首次运行
- [登录指南](./LOGIN.md) — 三种登录方式与 token 安全
- [配置手册](./CONFIG.md) — 配置文件全部字段与网络代理
- [使用指南](./USAGE.md) — 下载模式与全部子命令
- [README](../README.md) — 项目概览与文档索引