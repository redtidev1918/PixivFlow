# Example gateway

一个**零依赖**的参考网关，实现 [Gateway Contract v1](../../docs/GATEWAY_CONTRACT.md) 的全部三个端点。
它的用途是让你在写真正的网关（OneBot / 飞书 / 自建）之前，先看到契约跑通：它收到消息后
**打印出来**，不连接任何平台。

```
PixivFlow ──POST /deliver──▶ 这个进程（打印）──✗ 不接平台
```

它**不是** QQ/OneBot 适配器，也不应该变成适配器 —— 平台映射属于独立的适配器进程，
这样 PixivFlow 的契约永远不会按平台长出分支。

## 跑起来

```bash
# 默认 127.0.0.1:8790
node examples/gateway/server.mjs

# 换端口 / 换绑定地址
PORT=9000 HOST=0.0.0.0 node examples/gateway/server.mjs

# 自检：起服务、打三个端点、打印结果、退出（0 = 通过）
node examples/gateway/server.mjs --selftest
```

## 端点

| 端点 | 行为 |
| --- | --- |
| `GET /health` | `{status:"connected", contractVersion:1, gateway:"pixivflow-example-gateway"}`。**供运维用**；PixivFlow 的投递链路从不调用它。 |
| `GET /pairing` | 按 `EXAMPLE_GATEWAY_STATUS` 返回：`waiting` → 带 1×1 PNG 的 `qrCode`；`connected` → `{status, account}`；`unreachable` → HTTP 503。 |
| `POST /deliver` | 验签 → 校验 `schemaVersion` → 按 `idempotencyKey` 去重 → 打印 → 回 `{status:"accepted", id}`；重复投递回 `{status:"duplicate_existing"}`。 |

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `PORT` | 监听端口（默认 `8790`） |
| `HOST` | 绑定地址（默认 `127.0.0.1`） |
| `EXAMPLE_GATEWAY_SECRET` | 设置后强制校验 `X-Webhook-Signature`（对**原始字节**做 HMAC） |
| `EXAMPLE_GATEWAY_TOKEN` | 设置后强制校验 `Authorization: Bearer <token>` |
| `EXAMPLE_GATEWAY_STATUS` | `/pairing` 报告的状态：`waiting` / `connected` / `unreachable` |
| `EXAMPLE_GATEWAY_ACCOUNT` | `connected` 时报告的账号名 |
| `EXAMPLE_GATEWAY_MEDIA_ROOT` | 设置后，`message.media[].path` 会在该目录下解析（剥掉开头的 `/`）并报告真实文件大小；**路径逃逸会被拒绝**。用于「网关不在 PixivFlow 同机」的场景。 |

## 接到 PixivFlow

```jsonc
{
  "delivery": {
    "targets": {
      "example": {
        "type": "webhook",
        "url": "http://127.0.0.1:8790/deliver",
        "pairingUrl": "http://127.0.0.1:8790/pairing",
        "signingSecret": "${EXAMPLE_GATEWAY_SECRET}",
        "mediaTransport": "base64",
        "timeoutMs": 30000
      }
    }
  }
}
```

验证分三层，**每一层只证明一层**：

```bash
node examples/gateway/server.mjs --selftest   # 契约本身通不通
pixivflow gateway test example                # PixivFlow 能不能摸到这个端点
pixivflow delivery status                     # 账本里到底成没成
```

`gateway test` 只证明可达性与鉴权，**绝不等于投递成功**。

这三层都有自动化的对应物，其中最后一层是本文件最重要的用法
—— 它把 PixivFlow 的投递运行时和这个参考实现**同时**跑起来：

```bash
npx jest src/__tests__/delivery/gateway-reference-e2e.test.ts
```

它启动 `server.mjs` 作为独立进程，用真实的 `DeliveryService` → outbox → `OutboxWorker`
投递，验证：落成 `delivered` 并带回本网关签发的 `example-<uuid>`；网关停掉时该投递保持欠账、
重启后带同一个 `idempotencyKey` 收敛；一条坏路由的失败不会影响另一条。写自己的网关时，
让这个文件继续通过就是「你接对了」的最强证据。

## 它有意不做什么

- 不保存任何东西到磁盘（去重表在内存里，进程重启即丢）—— 生产网关必须持久化，
  这是契约里明确要求网关负责的部分；
- 不连接任何平台；
- 不做真实二维码（用 1×1 PNG 占位）；
- 不实现 `/health` 之外的健康语义，也不期待 PixivFlow 在投递前探测它。
