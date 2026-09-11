# Pixiv Client Kit（`@redtidev/pixiv-client`）

[English](./PIXIV_CLIENT_KIT_EN.md) | **中文**

Pixiv 协议 / 网络层代码是一个独立的内置 npm 工作区包，位于 [`packages/pixiv-client`](../packages/pixiv-client)。PixivFlow 是该 kit 的使用方；kit 对 PixivFlow 一无所知。

> 该 kit **尚未**拆分为独立的 GitHub 仓库 —— 见
> [何时拆分到独立仓库](#何时拆分到独立仓库)。

## 依赖规则

```
PixivFlow (product)  ──▶  @redtidev/pixiv-client (kit)  ──▶  Pixiv HTTP API
       │                          │
       │                          └ no TargetConfig, StandaloneConfig, SQLite,
       │                            puppeteer, scheduler, logger impl, delivery
       │
       └ host adapters: PixivFlowPixivClient, TargetSearchRunner,
         PixivAuthTokenProvider, SQLiteRateLimitStateStore
```

仅单向依赖。包内的 `src/__tests__/independence.test.ts` 会在 kit 引用宿主符号（`TargetConfig`、`StandaloneConfig`、`better-sqlite3`、`puppeteer` 等）或导入自身 `src` 之外的任何内容时让构建失败。

## Kit 提供的能力

- **传输层** —— 单一 HTTP 栈（`globalThis.fetch` + undici `ProxyAgent` 用于
  HTTP/HTTPS 代理；仅 SOCKS 使用 axios + `socks-proxy-agent`，因为 undici
  不支持 SOCKS）。通过 `AbortController` 实现单请求超时、调用方
  `AbortSignal` 透传、瞬时 HTTP 重试、401 单次刷新、二进制媒体获取返回
  `ArrayBuffer`（绝不写文件）。
- **App API 服务** —— `illustrations`、`novels`、`tags`、`users`、`media`，
  附带类型化的选项 DTO（`IllustSearchOptions`、`RankingOptions` 等）。保留协议
  怪癖：小说详情 v2→v1 回退，小说正文三级回退
  （`/webview/v2/novel` 标记解析 → `/v1/novel/text` → `ajax/novel/{id}`，
  使用浏览器 UA，不带认证 / App 头）。
- **类型化错误** —— `PixivError` 层级（`PixivHttpError`、
  `PixivRateLimitError`、`PixivNotFoundError`、`PixivTimeoutError`、
  `PixivCircuitOpenError` 等），携带 `status`、`retryAfterMs`、`endpoint`。
  不必再写 `message.includes('429')`。
- **分页** —— `paginate(fetchPage, opts)` / `firstPage`；有界遍历，可中断。
- **请求合并** —— 相同的在途 GET 合并为一次请求。
- **事件** —— `onEvent` 发出重试 / 速率限制 / 熔断状态变化；不包含令牌
  或带密钥的 URL。

### 公开接口

只有 `package.json` 的 `exports`（`.` → `dist`）是公开的，其余皆为内部实现。
入口包括：`createPixivClient(options)`、`PixivClient`、`RateLimitGate`、
错误类、模型类型、选项 DTO、`AccessTokenProvider` 端口、
`RateLimitStateStore` 端口、`paginate`。

## 429 设计（单一全局闸门）

每个 `PixivClient` 有且**仅有**一个闸门；每个请求都要先获取一个槽位。

1. **真正的槽位预约，而不是突发式 sleep。** 预约通过 promise 链互斥串行化；
   并发调用方获得严格递增的截止时间（A→0ms、B→1000ms、C→2000ms…），
   绝不会共享同一波突发。
2. **保守默认值。** `minIntervalMs: 1000` + 25% 抖动；首次 429 冷却
   **60s**；指数退避 60→120→240→480，上限 15min。`Retry-After` 响应头
   被当作**下限**（`max(retryAfter, ladder)`），绝不作为缩短冷却的许可。
3. **惩罚衰减。** 一次成功**不会**重置惩罚等级；需连续成功达到可配置次数
   （`decaySuccesses`，默认 20）才逐级下调。状态通过 `RateLimitState`
   在请求之间保持。
4. **熔断器。** 反复 429 后 CLOSED → OPEN（`openThreshold`），此时以
   `PixivCircuitOpenError` 快速失败；冷却结束后允许一次 HALF_OPEN 探测；
   成功则关闭，失败则重新打开。
5. **持久化端口。** `RateLimitStateStore`（按 scope 读写）；默认内存实现。
   PixivFlow 提供 `SQLiteRateLimitStateStore`（`rate_limit_state` 表），
   因此 Fly 的挂起 / 恢复与重启都不会忘记仍在生效的 Pixiv 冷却。
6. **可观测性。** `client.getRateLimitStatus()` 返回剩余冷却时间、惩罚等级、
   熔断状态、最近一次 429。`doctor` 与 `health` 会将其暴露出来。
7. **重试归属（不嵌套重试）。** 传输层负责*瞬时 HTTP* 重试（连接重置、
   5xx，以及闸门健康时的一轮 429）。闸门负责 429 冷却 / 退避。
   调度器 / 下载流水线负责跨运行的*持久化*任务级重试。没有任何一层
   会把同一个失败重试三次。

### 宿主侧兼容性

- `PixivFlowPixivClient implements IPixivClient` —— 既有的产品接口，委托给
  kit。产品行为（TargetConfig 映射、标签 OR 合并、页间 `requestDelay`、
  感知日期的提前停止分页、超额抓取、最终排序）位于宿主的
  `TargetSearchRunner` / `query-mapper` 中，因为那是 PixivFlow 的行为，
  而非 Pixiv 协议。
- `PixivAuthTokenProvider` 把既有的 OAuth / refresh token `PixivAuth`
  （SQLite 缓存令牌，PKCE / python 登录不变）适配到 kit 的 3 方法认证端口。
- `createPixivFlowClient(auth, config, database)` 是所有命令、调度器运行时
  与 WebUI 使用的唯一构造路径。
- 旧的错误消费方仍然可用：`NetworkError` / `is404Error` / 恢复逻辑与并发代码
  通过 `src/utils/errors.ts` 中的辅助函数（`isRetryableNetworkError`、
  `rateLimitWaitMs`）接受 kit 的类型化错误。
- 配置保持向后兼容：`network.timeoutMs/retries/proxy` 直接透传。新增的可选
  `network.requestPacingMs` 会覆盖 kit 的 1000ms 默认值（设为 0 只关闭节流；
  无法关闭 429 冷却）。该安全默认值取代了旧的 500ms 节流。

## 文件

宿主（`src/`）：

| 文件 | 作用 |
| --- | --- |
| `pixiv-client/PixivFlowPixivClient.ts` | 基于 kit 的 `IPixivClient` 适配器 |
| `pixiv-client/TargetSearchRunner.ts` | 宿主侧的日期 / 标签 / 分页语义 |
| `pixiv-client/query-mapper.ts` | TargetConfig → kit 选项 DTO |
| `pixiv-client/PixivAuthTokenProvider.ts` | 认证端口适配器 |
| `pixiv-client/createPixivFlowClient.ts` | 单一工厂（config、logger、SQLite store、scope） |
| `auth/PixivAuth.ts` | OAuth / refresh token（从 `pixiv/AuthClient.ts` 迁移而来） |
| `storage/repositories/RateLimitStateRepository.ts` | SQLite 闸门状态适配器 |
| `pixiv/PixivClient.ts`, `pixiv/AuthClient.ts` | 已弃用的重导出垫片 |

已删除：`pixiv/PixivApiCore.ts`、`pixiv/RateLimitCoordinator.ts`、
`pixiv/client/*`（Illust/Novel/Media/Search 服务）、`pixiv/types.ts`、
`pixiv/IPixivRequestHandler.ts` 以及它们 2,400+ 行的旧测试。现在只剩
一套 Pixiv HTTP 栈。

依赖变化：新增 `undici`（kit）；移除未使用的 `https-proxy-agent`。

### 发布的产物保持自包含

`pixivflow` 由 Fly/Docker 部署直接从 npm 消费，因此 kit 被**打包进**发布
tarball，而不是从 registry 解析：根 `package.json` 在 `bundleDependencies`
中列出它，npm 会把工作区包放在 tarball 内的
`node_modules/@redtidev/pixiv-client`（其运行时依赖 —— axios、
socks-proxy-agent、undici —— 已经是 `pixivflow` 的直接依赖）。只有出现
需要直接使用它的外部消费方时，才需要单独发布该 kit；在那之前**不要**把这个
依赖改成普通的 registry 版本范围，否则每次 `npm install pixivflow` 都会
因 404 失败。

## 何时拆分到独立仓库

目前还不是时候。诚实的门槛条件如下：

1. **出现第二个真实消费方。** 目前 PixivFlow 是唯一消费方；适配器 / 宿主
   边界只在单向场景下被验证过。一个独立应用（CLI、bot、另一个服务）才能
   验证公开接口的整体形态是否合理。
2. **公开 API 稳定。** `createPixivClient`、各服务方法、选项 DTO、错误名称
   与 `getRateLimitStatus()` 需要一段无破坏性变更的时期，然后才进入
   1.0 语义化版本线。
3. **独立的 CI / 发布。** 拥有自己的 lint / test / typecheck / publish
   流水线（目前共用工作区）、带版本的变更日志、发布 tarball。
4. **协议覆盖度信心。** Web API 边界目前是有意留白的占位；请确认"仅 App API"
   对外部消费方可接受，或先补齐 Web 端点。

当以上四条全部满足时，抽取只是机械操作：把 `packages/pixiv-client` 移到
独立仓库，以 `@redtidev/pixiv-client` 发布，并把工作区依赖切换为已发布版本。
架构测试与 `exports` 接口面已经强制了这一边界，使该迁移是安全的。
