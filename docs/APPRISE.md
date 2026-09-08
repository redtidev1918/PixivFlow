# 通过 Apprise API 发送运维通知

PixivFlow 只产生运维事件并把小 JSON 可靠 POST 到 `notificationUrl`；Email、Telegram、Discord、ntfy、Gotify、Bark、Slack 等具体协议交给独立运行的 [Apprise API](https://github.com/caronc/apprise-api)。PixivFlow 不实现 SMTP，也不内嵌 Apprise。

## 适用边界

- **作品交付**：Pixiv 图片/小说仍走 `HttpMultipartDelivery` 的 multipart 投递，例如 TelePost `/submissions`。
- **运行通知**：计划失败、计划超时、数据库恢复、无候选、下载硬失败等小 JSON 走 Apprise。
- 不要让 Apprise 接收 Pixiv 文件或 Email 原图附件。
- PixivFlow 不承诺 Email exactly-once；它保证同一逻辑事件使用稳定 `idempotency_key`，outbox 重试不生成新的逻辑事件。

当前通知 payload 保持 TelePost 兼容：

```json
{
  "text": "⚠️ PixivFlow 定时任务失败……",
  "idempotency_key": "pixivflow:schedule-failure:morning:7"
}
```

Apprise API 要求字段名为 `body`。无需修改 PixivFlow：在 URL query 中使用 Apprise 的第三方 webhook remapping：

```text
:TEXT=BODY&:TYPE=WARNING&:IDEMPOTENCY_KEY=
```

含义：`text → body`，所有 PixivFlow 运维通知标记为 Apprise `warning`，并移除 PixivFlow 自己消费的 `idempotency_key`。

## 最快接入（无公网端口）

### 1. 启动 Apprise sidecar

复制渠道配置模板：

```bash
mkdir -p deploy/apprise
cp examples/apprise/pixivflow.example.cfg deploy/apprise/pixivflow.cfg
```

编辑 `deploy/apprise/pixivflow.cfg`，每行一个 Apprise URL，即一个通知渠道。然后从仓库根目录启动 sidecar：

```bash
APPRISE_CONFIG_FILE=./deploy/apprise/pixivflow.cfg \
docker compose \
  -f docker-compose.yml \
  -f docker-compose.apprise.example.yml \
  up -d apprise
```

示例把 Apprise 绑定到宿主机 loopback `127.0.0.1:8000`，PixivFlow 通过主 Compose 已有的 `host.docker.internal:host-gateway` 访问 `http://host.docker.internal:8000`，不对公网或 LAN 暴露。

### 2. 配置 PixivFlow

设置环境变量，避免把 Apprise 渠道 token 写入 PixivFlow 仓库：

```env
PIXIVFLOW_NOTIFICATION_URL=http://host.docker.internal:8000/notify/pixivflow?:text=body&:type=warning&:idempotency_key=
```

在既有投递目标中只改 `notificationUrl`：

```json
{
  "delivery": {
    "targets": {
      "telepost": {
        "type": "httpMultipart",
        "url": "http://telepost:8080/api/v1/submissions",
        "notificationUrl": "${PIXIVFLOW_NOTIFICATION_URL}",
        "headers": {
          "Authorization": "Bearer ${TELEPOST_TOKEN}"
        }
      }
    }
  }
}
```

TelePost 用户可继续把作品 `url` 指向 TelePost submission endpoint；旧的 TelePost `notificationUrl` 配置也完全有效，无需迁移。若已有严格 `success.statuses: [201]`，同时保留 TelePost 201 和 Apprise 200；key 未配置渠道时 Apprise 返回 204，应通过 `/json/urls/pixivflow` 修正配置。

### 3. 验证 Apprise 收到请求

```bash
curl -sS -X POST \
  'http://host.docker.internal:8000/notify/pixivflow?:text=body&:type=warning&:idempotency_key=' \
  -H 'Content-Type: application/json' \
  --data '{"text":"PixivFlow Apprise test","idempotency_key":"pixivflow:test:1"}'
```

在 Apprise 容器所在宿主机执行时，使用 `http://127.0.0.1:8000`；示例只监听 loopback，不对公网或 LAN 暴露。

## Apprise 渠道示例

更多 URL 形态以 Apprise 官方服务文档为准：<https://github.com/caronc/apprise/wiki#notification-services>。

### SMTP Email

常见 Gmail SMTP 示例：

```text
mailtos://smtp.gmail.com:465?user=you%40gmail.com&pass=APP_PASSWORD&to=ops@example.com&name=PixivFlow
```

其他 SMTP 供应商替换主机、端口、用户名和密码即可。不要把真实 `APP_PASSWORD` 提交到 PixivFlow 仓库。

### Telegram

```text
tgram://123456789:AA.../123456789/
```

第一段是 bot token，最后一段是 chat id。

### ntfy

```text
ntfy://ntfy.example.com/pixivflow_alerts
```

公有 `ntfy.sh` 应使用不可猜的 topic，并按 ntfy 文档配置访问控制。

### Gotify

```text
gotifys://gotify.example.com/A...
```

### 多渠道 fan-out

`pixivflow.cfg` 中放多行即可。一次 PixivFlow 通知会由 Apprise 同时发送到多个渠道：

```text
mailtos://smtp.gmail.com:465?user=you%40gmail.com&pass=APP_PASSWORD&to=ops@example.com&name=PixivFlow
tgram://123456789:AA.../123456789/
ntfy://ntfy.example.com/pixivflow_alerts
```

也可以使用 stateless endpoint `/notify`，但推荐 stateful key `/notify/pixivflow`：PixivFlow 只保存一个不含渠道密钥的 URL，所有渠道密钥留在 Apprise 配置中。

## Secrets 处理

- SMTP 密码、Telegram token、Discord webhook、ntfy/Gotify token 放在 Apprise 配置或 Apprise 所在环境中。
- PixivFlow 配置只保存 `notificationUrl`，用 `${ENV_NAME}` 插值。
- 如果 `notificationUrl` query 含敏感 token，PixivFlow 日志会隐藏 URL userinfo 和整个 query，只保留 origin/path。
- 不要把 Apprise API 直接暴露到公网；同机 Compose 使用 loopback 端口和 `http://host.docker.internal:8000`。需要跨主机时放到反向代理后，启用 HTTPS 和认证。
- Apprise 自带 Nginx basic auth 注入方式见官方 Apprise API README；PixivFlow 仍可通过 `headers` 增加认证头。

## 失败重试和幂等

PixivFlow 通知先写入数据库同级 `delivery-outbox/` 的持久 manifest，再调用 `DeliveryDispatcher → HttpMultipartDelivery.notify()`。

- HTTP 单次请求失败：provider 默认最多 3 次短时重试。
- 进程崩溃或 Apprise 长时间不可用：manifest 保留，下次运行执行 outbox replay。
- 持久退避：默认 5 分钟起步，指数退避，最长 6 小时；由 `delivery.outboxRetryBaseMs` 和 `outboxRetryMaxMs` 配置。
- 通知失败只记录/保留待重试，不改变作品下载结果，也不把下载标记为失败。
- 重试复用同一 manifest，因此 `idempotency_key` 稳定。

稳定 key 示例：

```text
pixivflow:schedule-failure:<scheduleId>:<executionNumber>
pixivflow:db-recovery:<YYYY-MM-DD>
pixivflow:no-match:<targetId>:novel:<startDate>:<endDate>
pixivflow:hard-fail:<targetId>:<type>:<YYYY-MM-DD>
```

Apprise/Email 端未必去重，所以文档和运维上只能称为 at-least-once HTTP 投递。

## Docker / VPS / Fly.io

### Docker Compose

低配置 VPS 使用 `APPRISE_WORKER_COUNT=1`。本次实测官方 `caronc/apprise:latest`：

- 镜像大小约 565 MB（拉取后的本地 image size）。
- 1 worker 空闲内存约 128 MiB。
- 容器启动后 `/status` 返回 `OK`。

256 MiB 级别机器若同时运行 PixivFlow 与 Apprise 内存紧张，优先把 Apprise 放到另一台小 VPS、内网主机或外部托管 Apprise API，不要因此在 PixivFlow 内重写通知渠道。

### Fly.io 或跨网络部署

把 Apprise 部署为独立 app，例如 `https://apprise.example.com`，并在反代层启用 HTTPS/Basic Auth 或其他访问控制。PixivFlow 配置：

```json
{
  "notificationUrl": "${PIXIVFLOW_NOTIFICATION_URL}",
  "headers": {
    "Authorization": "Bearer ${APPRISE_API_TOKEN}"
  }
}
```

如果使用 Basic Auth，也可把凭据放进 Apprise URL 的 userinfo，并通过环境变量注入；PixivFlow 日志会脱敏。

## 故障排查

| 现象 | 检查 |
| --- | --- |
| Apprise 返回 400 `Payload lacks minimum requirements` | URL query 缺少 `:text=body`，或 JSON 中没有 `text`。 |
| Apprise 返回 204 | stateful key 没有加载到有效渠道；检查容器内 `/config/pixivflow.cfg` 是否挂载且至少一行未注释。 |
| Apprise 返回 424 | 请求已到 Apprise，但一个或多个下游渠道失败；查看返回 JSON 的 `details`。 |
| PixivFlow outbox 一直重试 | 用 `curl` 直接请求同一 Apprise URL；检查 `host.docker.internal`、loopback 端口、认证和渠道 URL。 |
| 收得到测试消息但 PixivFlow 无通知 | scheduler 失败确认目标已配置到对应 schedule；no-match 还需 `noMatchPolicy.notify: true`。 |
| 想发送成功通知 | 当前版本默认不发送成功通知，避免噪音；本次没有引入 `schedule.completed`。 |

## 为什么不是在 PixivFlow 内增加 Provider

Apprise 已覆盖 150+ 服务、第三方认证、协议差异、格式适配和渠道错误。为 PixivFlow 增加 `EmailNotificationProvider`、`TelegramNotificationProvider`、`DiscordNotificationProvider` 会复制已有系统，还会引入更多密钥和失败模式。当前方案只保留通用 HTTP 通知能力，作品 delivery 与运维 notification 分离。
