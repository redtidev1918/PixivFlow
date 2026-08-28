# PixivFlow API 文档

> **English:** This document lists every REST endpoint exposed by the PixivFlow WebUI server and the Socket.IO events used for live log streaming. Endpoints are grouped by route prefix (`/api/auth`, `/api/config`, `/api/download`, `/api/stats`, `/api/logs`, `/api/files`, plus `GET /api/health`) with request/response examples. It also explains how to start the server, the error-code convention, and why the API has no authentication layer. All shapes are taken from the handler source code in `src/webui/routes/handlers/`.

本文档面向直接调用 WebUI HTTP 接口的开发者(前端开发、脚本集成、容器健康检查)。示例均从 `src/webui/websocket/` 与 `src/webui/routes/` 的源码整理;不确定的字段按保守描述,以源码为准。

## 启动与基础信息

- 本地启动:`pixivflow webui`(别名 `pixivflow w`);**生产默认端口 3000**(`src/webui/ports.ts` 中 `PORTS.PROD_API = 3000`,开发后端同为 3000)。可用选项与等价环境变量:

| 来源 | 说明 |
| --- | --- |
| `--port <n>` / `PORT` | 监听端口,默认 3000;端口被占用时启动失败(`EADDRINUSE`) |
| `--host <h>` / `HOST` | 监听地址,默认 `localhost` |
| `--static-path <dir>` / `STATIC_PATH` | 前端构建产物目录(需含 `index.html`),缺省时自动探测 `webui-frontend/dist`,找不到则只提供 API |

- Docker 启动:`docker-compose up -d pixivflow-webui`(服务定义见根目录 `docker-compose.yml`:内部 `PORT=3000`、`HOST=0.0.0.0`、`STATIC_PATH=/app/webui-frontend/dist`,宿主端口 `${WEBUI_PORT:-3000}:3000`)。

```bash
# 健康检查
curl http://localhost:3000/api/health
```

```json
{ "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z" }
```

未配置静态目录时,`GET /` 返回 JSON,列出全部 API 前缀与版本号。配置了静态目录后,非 `/api` 路径会走 SPA 回退返回 `index.html`;因此服务器同时注册了别名 **`GET /health`**(与 `/api/health` 同响应),供容器健康检查与反向代理直接探测 API 可用性,不必依赖 SPA 回退路径。

端口被占用时默认报错退出;设置环境变量 `PIXIV_WEBUI_AUTO_PORT=true` 后会自动改用下一个空闲端口并在日志中给出实际端口。

## 鉴权说明

**REST API 默认没有鉴权**:路由组未挂载任何登录态、API Key 或 JWT 中间件,凡是能访问到端口的客户端都可以调用。`/api/auth/*` 一组管理的是 **Pixiv 账号的 OAuth 令牌**(刷新令牌的获取/验证/清除),与保护本 API 无关。部署时请依赖端口绑定(本地默认 `localhost`;Docker 镜像内为 `0.0.0.0`,由端口映射决定暴露范围)做访问控制,CORS 默认放开(`origin: '*'`)。

**可选 Basic Auth(2.4.0 起)**:同时设置环境变量 `WEBUI_USERNAME` 与 `WEBUI_PASSWORD` 后,除 `/api/health`、`/health` 外的所有请求(含静态页与 Socket.IO 握手)都要求 HTTP Basic 认证。未设置则维持无鉴权行为。公网部署仍建议叠加反向代理与 TLS。

Pixiv 登录流程涉及的端点:`GET /api/auth/status` 检查令牌是否有效 → `POST /api/auth/login`(浏览器授权)或 `POST /api/auth/login-with-token`(已有刷新令牌)→ 之后可随时 `POST /api/auth/refresh` 刷新、`POST /api/auth/logout` 清除。

## REST 端点

以下 52 个端点对应 `src/webui/server/server-routes.ts` 挂载的全部路由。约定:多数响应带 `errorCode` 字段(枚举见 `src/webui/utils/error-codes.ts`);个别处理器在校验失败时仍返回 HTTP 200 并用 `data.success: false` 表达结果,文中已标注。

### GET /api/health(别名 `/health`)

无条件返回 `{"status":"ok","timestamp":"<ISO 时间>"}`,不做任何资源检查。

### Auth 组:`/api/auth`

| 方法 | 路径 | 说明 | 主要参数/请求体 |
| --- | --- | --- | --- |
| GET | `/status` | 认证状态:读取配置中的刷新令牌并实际调用 Pixiv 校验有效性 | 无 |
| POST | `/login` | 浏览器/Puppeteer 登录获取令牌,成功后写回配置文件 | body:`username?`、`password?`、`headless`(默认 true)、`proxy?`;headless 模式下 username/password 必填 |
| POST | `/refresh` | 刷新访问令牌;返回的若为新 refresh token 会自动写回配置 | body:`refreshToken?`(缺省时依次取配置文件 → 统一存储) |
| POST | `/login-with-token` | 直接提交刷新令牌,先校验再保存 | body:`refreshToken`(必填) |
| POST | `/logout` | 清除配置文件与统一存储中的令牌 | 无 |

```json
// GET /api/auth/status
{
  "data": {
    "authenticated": true,
    "hasToken": true,
    "tokenValid": true,
    "isAuthenticated": true,
    "user": { "id": "1234567", "name": "<用户昵称>" }
  }
}

// POST /api/auth/login-with-token  请求体
{ "refreshToken": "<pixiv 刷新令牌>" }
// 成功响应
{
  "success": true,
  "errorCode": "AUTH_LOGIN_SUCCESS",
  "data": {
    "accessToken": "<访问令牌>",
    "refreshToken": "<刷新令牌>",
    "expiresIn": 3600,
    "user": { "id": "1234567", "name": "<用户昵称>" }
  }
}
```

错误:`AUTH_USERNAME_PASSWORD_REQUIRED`(400)、`AUTH_LOGIN_FAILED`(401)、`AUTH_REFRESH_TOKEN_REQUIRED`(400)等;`user` 字段仅在有效校验时非空。

### Config 组:`/api/config`

| 方法 | 路径 | 说明 | 主要参数/请求体 |
| --- | --- | --- | --- |
| GET | `/` | 当前配置(`refreshToken`/`clientSecret` 掩码为 `***`);若有激活的历史快照会先合并应用 | 无;附带 `_meta.configPath`,校验失败时含 `_validation` |
| PUT | `/` | 更新配置并写回文件,同时按日期名自动存入历史 | body:`StandaloneConfig` 子集(JSON);占位符字段不会覆盖真实值 |
| POST | `/validate` | 校验提交的配置(会尝试从统一存储补齐令牌) | body:完整配置对象 |
| GET | `/backup` | 把当前配置另存为 `*.backup.<时间戳>.json` | 无 |
| POST | `/restore` | 用备份覆盖当前配置文件 | body:`backupPath`(必须存在) |
| GET | `/diagnose` | 解析当前配置,返回统计/告警/字段清单 | 无 |
| POST | `/repair` | 自动修复配置文件 | body:`createBackup`(默认 true) |
| GET | `/history` | 配置历史列表 | 无 |
| POST | `/history` | 保存一份历史快照 | body:`name`、`description?`、`config` |
| GET | `/history/:id` | 单条历史详情(含完整 `config_json`) | 路径参数数字 id |
| DELETE | `/history/:id` | 删除一条历史 | 路径参数 id |
| POST | `/history/:id/apply` | 应用某条历史到当前配置文件 | 路径参数 id |
| GET | `/files` | 列出候选配置文件 | 无 |
| POST | `/files/switch` | 切换当前使用的配置文件 | body:`path` |
| POST | `/files/import` | 导入新配置文件 | body:`config`、`name` |
| DELETE | `/files/:filename` | 删除指定配置文件 | 路径参数 filename(仅允许安全文件名) |
| GET | `/files/:filename/content` | 读取指定配置文件内容 | 路径参数 filename |
| PUT | `/files/:filename/content` | 覆盖写入指定配置文件内容 | body:`content`(字符串) |

```json
// GET /api/config(节选)
{
  "data": {
    "logLevel": "info",
    "pixiv": { "refreshToken": "***", "clientSecret": "***" },
    "storage": { "databasePath": "./data/pixiv-downloader.db" },
    "targets": [],
    "_meta": { "configPath": "/app/config/standalone.config.json", "configPathRelative": "config/standalone.config.json" }
  }
}

// POST /api/config/validate  请求体与响应
{ "logLevel": "info", "targets": [{ "type": "illustration", "tag": "風景", "limit": 10 }] }
→ 200
{ "valid": false, "errors": ["CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED"] }
```

### Download 组:`/api/download`

任务互斥:同一时刻只允许一个活动任务,冲突返回 **409 + `DOWNLOAD_TASK_ALREADY_RUNNING`**。

| 方法 | 路径 | 说明 | 主要参数/请求体 |
| --- | --- | --- | --- |
| POST | `/start` | 启动下载任务(后台执行) | body:`targetId?`(targets 下标或 tag)、`config?`(部分配置覆盖)、`configPaths?`(多配置合并 targets) |
| POST | `/stop` | 停止运行中的任务 | body:`taskId` |
| GET | `/status` | 任务状态:内存任务 + 数据库历史合并;带 `taskId` 查单个,无则返回全部 | query:`taskId?`;404 时错误码包在 `data.errorCode` 中 |
| GET | `/logs` | 单个任务的内存日志 | query:`taskId`(必填)、`limit?` |
| GET | `/history` | 数据库任务历史(分页) | query:`page`(默认 1)、`limit`(默认 20)、排序过滤参数 |
| DELETE | `/history/:taskId` | 删除一条任务历史 | 路径参数 taskId |
| DELETE | `/history` | 清空全部任务历史 | 无;返回 `deletedCount` |
| POST | `/run-all` | 执行所有 targets(等同 `pixivflow download`) | body:`configPaths?` |
| POST | `/random` | 从内置热门标签中随机挑选一个下载一张图/一篇小说 | body:`type?`(`illustration` 默认 或 `novel`);响应带选中的 `tag` |
| POST | `/url` | 按 Pixiv URL/纯 ID 下载单件作品 | body:`url`(支持 `artworks/`、`novel/show.php?id=`、`illust_id=`、短链 `/i/` 等) |
| POST | `/batch-url` | 批量按 URL 下载 | body:`urls`(非空数组);响应含 validUrls/invalidUrls 统计 |
| POST | `/parse-url` | 仅解析 URL,不触发下载 | body:`url`;解析失败仍是 HTTP 200,`data.success:false` |
| GET | `/incomplete` | 未完成任务列表(execution_log 中 failed/partial) | 无 |
| DELETE | `/incomplete` | 清空未完成任务记录 | 无;返回 `deletedCount` |
| DELETE | `/incomplete/:id` | 删除一条未完成任务记录 | 路径参数数字 id |
| GET | `/incomplete/test` | 连通性自检端点 | 无;返回 taskCount 与样例 |
| POST | `/resume` | 按 tag+type 重跑目标 | body:`tag`、`type`;目标不存在返回 404 |

```json
// POST /api/download/start  请求体
{ "targetId": "0" }
// 成功响应
{ "success": true, "taskId": "task_1735689600000", "errorCode": "DOWNLOAD_START_SUCCESS" }

// GET /api/download/status(节选)
{
  "data": {
    "activeTask": {
      "taskId": "task_1735689600000",
      "status": "running",
      "startTime": "2025-01-01T00:00:00.000Z",
      "progress": { "current": 3, "total": 10, "message": "已下载 插画 12345 (3/10)" },
      "logs": []
    },
    "allTasks": [],
    "hasActiveTask": true
  }
}
```

任务状态取值:`running` / `completed` / `failed` / `stopped`(`DownloadTaskManager.TaskStatus`,同步持久化到 `task_history` 表)。

### Stats 组:`/api/stats`

| 方法 | 路径 | 说明 | 主要参数/查询 |
| --- | --- | --- | --- |
| GET | `/overview` | 总览统计(`data` 含 totalDownloads、illustrations、novels、recentDownloads) | 无 |
| GET | `/downloads` | 按时间段列出下载记录 | query:`period`,支持 `7d`/`30d`/`1y`,其他值回落 `7d` |
| GET | `/tags` | 标签维度 Top N | query:`limit`(默认 10) |
| GET | `/authors` | 作者维度 Top N | query:`limit`(默认 10) |

```json
// GET /api/stats/tags?limit=2
{ "data": { "tags": [ { "name": "風景", "count": 128 }, { "name": "オリジナル", "count": 96 } ] } }

// GET /api/stats/downloads?period=30d(节选)
{ "data": { "period": "30d", "downloads": 42, "data": [ { "pixiv_id": "123456", "type": "illustration", "tag": "風景", "title": "...", "file_path": "...", "downloaded_at": "2025-01-01T00:00:00.000Z" } ] } }
```

### Logs 组:`/api/logs`

| 方法 | 路径 | 说明 | 主要参数/查询 |
| --- | --- | --- | --- |
| GET | `/` | 分页读取日志文件文本行 | query:`page`(默认 1)、`limit`(默认 100)、`level?`(按 `[LEVEL]` 子串匹配行)、`search?`(大小写不敏感子串) |
| DELETE | `/` | 清空日志文件(截断为空) | 无 |

日志文件定位顺序:数据库绝对路径所在目录 → 工作目录 `data/pixiv-downloader.log` → 项目根 `data/` → 回退工作目录。

```json
// GET /api/logs?page=1&limit=50&level=error&search=scheduler
{ "data": { "logs": ["[2025-01-01T00:00:00.000Z] [ERROR] Scheduled Pixiv download job failed ..."], "total": 1, "page": 1, "limit": 50 } }
```

### Files 组:`/api/files`

涉及相对路径的端点都做了目录穿越检查(拼接后的路径必须仍在插画/小说基础目录内)。`type` 取值 `illustration`(默认)或 `novel`。

| 方法 | 路径 | 说明 | 主要参数/请求体 |
| --- | --- | --- | --- |
| GET | `/recent` | 最近下载记录(数据库),逐一检查文件是否仍存在 | query:`limit`(默认 50)、`type?`、`filter?`(`today`/`yesterday`/`last7days`/`last30days`) |
| GET | `/list` | 浏览下载目录 | query:`path?`(相对子目录)、`type`、`sort`(`name` 默认/`time`/`downloadTime`)、`order`(`asc`/`desc`) |
| GET | `/preview` | 文件预览:图片按 MIME 返回,文本内联 | query:`path`(必填,绝对或相对)、`type?` |
| DELETE | `/:id` | 删除单个已下载文件(不删数据库记录) | 路径参数 id;query:`path?`(相对路径)、`type?` |
| POST | `/normalize` | 规范化/重排文件并同步数据库路径 | body:`dryRun?(false)`、`normalizeNames?(true)`、`reorganize?(true)`、`updateDatabase?(true)`、`type?('all')` |

```json
// GET /api/files/recent?filter=today&type=illustration(节选)
{
  "files": [
    {
      "pixivId": "123456",
      "type": "illustration",
      "tag": "風景",
      "title": "夕日の海",
      "filePath": "/app/downloads/illustrations/123456_夕日の海_1.jpg",
      "author": "<作者名>",
      "userId": "7654321",
      "downloadedAt": "2025-01-01T00:00:00.000Z",
      "exists": true,
      "size": 1048576,
      "name": "123456_夕日の海_1.jpg",
      "extension": ".jpg"
    }
  ],
  "total": 1,
  "filter": "today",
  "type": "illustration"
}

// POST /api/files/normalize { "dryRun": true }
{ "data": { "success": true, "result": { "totalFiles": 120, "processedFiles": 118, "movedFiles": 10, "renamedFiles": 4, "updatedDatabase": 0, "errors": [], "skippedFiles": 2 } } }
```

注意:`GET /files/list` 的响应包裹在 `data` 中(`{ files, directories, currentPath }`,文件项额外带 `downloadedAt`);`GET /files/recent` 则不带 `data` 包裹(`{ files, total, filter, type }`),前端消费时留意差异。

## Socket.IO 实时事件

来源:`src/webui/websocket/LogStream.ts`(日志流)与 `src/webui/websocket/DownloadStatus.ts`(下载状态流),均在 `WebUIServer` 构造时挂载。客户端仍无任何自定义上报事件,断开连接后服务器端的每个连接级定时器都会清理。

### 事件 `logs`(日志流)

- 连接建立且日志文件存在时,发送最近日志:`{ "type": "initial", "lines": ["[...] ..."] }`(最多保留 1000 行);
- 之后每秒轮询日志文件大小,新增内容逐行推送:`{ "type": "new", "line": "[...] ..." }`;
- 日志文件定位与 `GET /api/logs` 相同(数据库绝对路径目录优先,否则 `<cwd>/data/pixiv-downloader.log`)。

### 事件 `download`(任务状态流)

任务启动、进度推进、追加日志、完成/失败/停止时实时广播快照(经服务端 150ms 合并去抖):

```json
{
  "kind": "snapshot",
  "status": {
    "hasActiveTask": true,
    "activeTask": { "taskId": "task_1712345678", "status": "running", "progress": { "current": 3, "total": 20 } },
    "allTasks": []
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

说明:

- 字段形状与 `GET /api/download/status` 完全一致,可直接复用同一类型定义;
- 快照只含**内存中**的近期任务(最多 10 条),已完成历史的水合交给 REST 接口;
- 另有 5 秒一次的服务器端兜底重推(仅在有客户端在线时),错过单条推送也不会卡住 UI。

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");
socket.on("download", (payload) => {
  console.log(payload.status.hasActiveTask, payload.status.activeTask?.progress);
});
```

## 错误码约定

业务错误通过 `errorCode` 字符串承载(完整枚举见 `src/webui/utils/error-codes.ts`),前端据此映射本地化文案。需要记住的三条规则:

1. 全局兜底:未被捕获的异常进入统一 `errorHandler`,返回 **500** 与 `{"error":"Internal Server Error"}`(`NODE_ENV=development` 时附带 `message`)。
2. 部分处理器故意返回 **HTTP 200 + `data.success:false`** 表示业务失败(如 `POST /api/download/parse-url`);判断成败要看 success/errorCode,不能只看状态码。
3. 状态码语义化程度不一:`409` 表示已有活动下载任务,其余多为 400/404/500;兼容做法是同时检查状态码与 errorCode 字段。

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
 
前
端
仓
库
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
 
官
方
前
端
消
费
方
,
R
E
S
T
/
实
时
事
件
的
参
考
实
现
;
组
件
与
数
据
契
约
对
照
见
其
 
[
C
O
M
P
O
N
E
N
T
_
G
U
I
D
E
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
/
b
l
o
b
/
m
a
s
t
e
r
/
d
o
c
s
/
C
O
M
P
O
N
E
N
T
_
G
U
I
D
E
.
m
d
)

- [架构文档](./ARCHITECTURE.md) —— 服务端各模块如何协作
- [使用指南](./USAGE.md) —— CLI 与 WebUI 日常操作
- [Docker 部署](./DOCKER.md) —— 容器端口与环境变量
- [快速开始](./QUICKSTART.md) —— 从安装到首次下载
- [项目自述](../README.md) —— 功能总览
