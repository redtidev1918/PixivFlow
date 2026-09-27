# Example OneBot v11 adapter（QQ）

一个**零依赖**的 OneBot v11 投递适配器，把 [Gateway Contract v1](../../docs/GATEWAY_CONTRACT.md)
的三个端点翻译成 OneBot v11 的 HTTP API 调用。它是 [docs/GATEWAY.md](../../docs/GATEWAY.md) §5.3
所描述的「最小转换进程」的**可运行实例**。

```
PixivFlow ──POST /deliver（契约 v1，带签名/幂等键）──▶ 本进程
                                                      │ POST /send_group_msg
                                                      ▼
                                  NapCat / Lagrange / LLOneBot ──▶ QQ
```

## 它不是什么

- **不实现 QQ 协议**，也不实现 OneBot 本身：QQ 会话属于你已经在跑的 OneBot 实现。
- **不做扫码登录**：二维码由 NapCat 自己的面板显示，凭据不会经过本进程，也不会经过 PixivFlow
  （见 GATEWAY.md §5.1/§5.2）。
- **不做重试**：重试由 PixivFlow 的 outbox 负责；本进程只负责把一次请求翻译成一次 OneBot 调用，
  并把「成功 / 待定 / 永久失败」如实翻译回契约词汇。
- **不按平台长分支**：这就是适配器独立成进程的原因 —— PixivFlow 侧的契约里没有 QQ。

只想先验证「契约本身通不通」、还不想碰 QQ，请先用
[`examples/gateway/`](../gateway/README.md)（它只打印消息，不接平台）。

## 跑起来

```bash
# 1. 先让 NapCat（或其它 OneBot v11 实现）的 HTTP API 在 3000 端口可用，并记下它的 token
# 2. 起适配器
ONEBOT_URL=http://127.0.0.1:3000 \
ONEBOT_TOKEN=<napcat-token> \
ONEBOT_TARGET=group:987654 \
ADAPTER_TOKEN=<给 PixivFlow 用的 token> \
node examples/onebot-adapter/server.mjs

# 自检：起一个假 OneBot，跑完三个端点与去重逻辑，打印结果并退出（0 = 通过）
node examples/onebot-adapter/server.mjs --selftest
```

启动时会拒绝「半配置」：`ONEBOT_URL` 缺失或 `ONEBOT_TARGET` 还是占位值 `group:0` 时，
进程会打印 `config.problem` 并以退出码 2 结束 —— 发错群比不启动更糟。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `PORT` | 监听端口（默认 `8791`） |
| `HOST` | 绑定地址（默认 `127.0.0.1`） |
| `ADAPTER_TOKEN` | **给 PixivFlow 用的** token，校验 `Authorization: Bearer <token>`；未设置只告警（端点无鉴权） |
| `ADAPTER_SECRET` | 设置后强制校验 `X-Webhook-Signature`（对**原始字节**做 HMAC，5 分钟时间窗） |
| `ONEBOT_URL` | OneBot HTTP API 基址，如 `http://127.0.0.1:3000` |
| `ONEBOT_TOKEN` | **给 OneBot 用的** token（与 `ADAPTER_TOKEN` 不要复用同一个值） |
| `ONEBOT_TARGET` | 投递目标：`group:987654`（默认）或 `private:987654` |
| `ONEBOT_TIMEOUT_MS` | 单次 OneBot 调用超时（默认 `15000`） |
| `ONEBOT_MIN_SEND_INTERVAL_MS` | 两次 OneBot 调用之间的最小间隔（默认 `500`），用于限速 |
| `ONEBOT_STATE_FILE` | 幂等账本（默认 `./.onebot-adapter-state.jsonl`，追加写 JSONL） |

## 端点

| 端点 | 行为 |
| --- | --- |
| `POST /deliver` | 验签 → 校验 Bearer → 解析 JSON → 校验 `schemaVersion` → 按 `idempotencyKey` 去重 → 发送消息段 → 上传附件 → 回契约 ACK 词 |
| `GET /pairing` | 调 `get_login_info`：成功 `{status:"connected", account, nickname}`；可达但未登录 `{status:"waiting", reason}`（HTTP 200）；不可达 HTTP 503 `{status:"unreachable"}` |
| `GET /health` | 调 `get_status`：`data.online !== false && data.good === true` 时 `{status:"connected", contractVersion:1, gateway:"pixivflow-onebot-adapter", onebot:{…}}`，否则 HTTP 503。**供运维用**，PixivFlow 的投递链路从不调用它 |

未知路由回 `404 {status:"invalid"}`。

## 翻译规则（这是整个文件的重点）

**消息段**（契约 `message.parts` → OneBot `message` 数组，顺序保留）：

| 契约 part | OneBot 段 |
| --- | --- |
| `{kind:"text"}` | `{type:"text", data:{text}}` —— 文案取自 `message.text`（契约里正文只出现在 `message.text`，`parts` 里只是一个位置标记），只消费一次 |
| `{kind:"image", media}` | `{type:"image", data:{file}}` |
| `{kind:"video", media}` | `{type:"video", data:{file}}` |
| `{kind:"album"}` | PixivFlow 会展开成 N 个各自带 `media` 的 part，因此这里就是 N 个 `image`/`video` 段 |
| `{kind:"file", media}` | **不是消息段**：走 `upload_group_file {group_id, file, name}`，再补发一条 `📎 附件：<name>` 提示消息 |

`media.file` 的取值：`base64://<...>`（`base64` 传输，永远可用）或 `file://<绝对路径>`
（`reference` 传输，要求 OneBot 能读到 PixivFlow 的磁盘 —— 这正是该传输的取舍，不做静默降级）。

**ACK 映射**（OneBot 的 HTTP 状态码几乎永远是 200，成败在 `retcode`；契约的规则是「先看词，再看码」）：

| OneBot 回答 | 本适配器回给 PixivFlow | 结果 |
| --- | --- | --- |
| `retcode 0` | `200 {status:"accepted", id:<message_id>}` | `delivered`，`remote_id` 就是平台消息号 |
| `status:"async"` 或 `retcode 1` | `200 {status:"pending", reason}` | 保持待投递，**绝不报成功** |
| `retcode 100/102/103/104/105/1400/1404` | `200 {status:"failed", reason}` | 永久失败，进死信，不无限重试 |
| 未知 `retcode` | `502 {reason}`（**无状态词**） | 可重试，不猜 |
| 网络不可达 / 超时 / HTTP ≥ 500 | `502 {reason}`（无状态词） | 可重试 |
| HTTP `401/403/404` | 原样 4xx（无状态词） | 令牌/地址写错，修好即可重试 |
| HTTP `429` | `429`（无状态词） | 限速，可重试 |
| 非 JSON 响应体 | `502 {reason}`（无状态词） | 可重试 |

**「无状态词」是刻意的**：契约里状态词优先于 HTTP 码，一旦回了 `failed` 就会进死信；
所以凡是「请求本身有问题、但改配置后能成功」的情形，都只回一个裸 HTTP 码，让 PixivFlow 继续重试。

## PixivFlow 侧配置

```json
{
  "delivery": {
    "targets": {
      "qq-main": {
        "type": "webhook",
        "url": "http://127.0.0.1:8791/deliver",
        "token": "${QQ_ADAPTER_TOKEN}",
        "pairingUrl": "http://127.0.0.1:8791/pairing",
        "capabilities": {
          "maxTextLength": 4000,
          "maxAttachmentsPerMessage": 9,
          "album": true,
          "albumMin": 2,
          "albumMax": 9,
          "minSendIntervalMs": 500
        }
      }
    }
  }
}
```

跨机部署时把 `url`/`pairingUrl` 换成适配器所在主机的地址；若两者不在同一台机器上，
`reference` 传输的本地路径对端读不到，请改用 `base64`
（见 GATEWAY.md §6「`reference` 传输的文件可见性」）。

## 验证

| 层 | 命令/动作 | 证明的是什么 |
| --- | --- | --- |
| 适配器自身 | `node examples/onebot-adapter/server.mjs --selftest` | 段构造、ACK 映射、去重、`/pairing`、`/health`（假 OneBot，不接 QQ） |
| 契约到底 | `npx jest src/__tests__/delivery/onebot-adapter-e2e.test.ts` | **真**投递运行时 → outbox → 适配器进程 → OneBot HTTP：`remote_id`、`pending` 不落地、`failed` 进死信、重放 `duplicate_existing` |
| QQ 登录态 | NapCat 自己的面板 | 账号在线；**不证明** PixivFlow 能投递 |
| 真实投递 | 跑一次下载 + `pixivflow delivery status` | 账本上的 `delivered` 与群里的那条消息 |

`--selftest` 与上面的 jest 套件都不需要 QQ、不需要 NapCat：它们证明的是**翻译**正确，
不是「QQ 已经通了」。
