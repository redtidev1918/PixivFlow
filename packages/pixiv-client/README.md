# @redtidev/pixiv-client

[English](./README_EN.md) | **中文**

面向 TypeScript/Node.js 的独立、可复用的 **Pixiv App API 客户端 kit**。

它懂 Pixiv，但**不懂你的应用**：没有配置 schema、没有数据库、没有浏览器登录、
没有调度器。它目前作为 npm 工作区包存在于 PixivFlow 单仓库内，且有意
**尚未发布**（见下文「何时拆分到独立仓库」）。

```ts
import { createPixivClient, StaticTokenProvider } from '@redtidev/pixiv-client';

const pixiv = createPixivClient({ auth: new StaticTokenProvider(process.env.PIXIV_ACCESS_TOKEN!) });

const illust = await pixiv.illustrations.get(123_456);
const page   = await pixiv.illustrations.searchPage({ word: '風景', limit: 30 });
const bytes  = await pixiv.media.fetch(illust.meta_single_page!.original_image_url!);
```

## 特性

- **认证端口，而非登录实现** —— 注入任何实现了 `AccessTokenProvider`
  （可选 `RefreshableAccessTokenProvider`）的对象。浏览器 OAuth/PKCE、
  puppeteer 与 python 辅助逻辑留在宿主应用中。
- **单一传输层**服务所有调用：base URL、App 头、Bearer 认证、超时
  （`AbortController`）、HTTP(S) 代理（undici）与 SOCKS 代理
  （axios + socks-proxy-agent）、响应解析、类型化错误。
- **类型化错误** —— `PixivNotFoundError`、`PixivRateLimitError`、
  `PixivAuthenticationError`、`PixivServerError`、`PixivNetworkError`、
  `PixivTimeoutError`、`PixivCircuitOpenError` 等，用 `instanceof` 分类，
  绝不用 `message.includes('429')`。
- **单一 429 闸门** —— 一个全局限速器为所有请求节流，并施加同一份冷却。
  没有嵌套重试，也没有请求风暴。
- **槽位预约式节流** —— 并发调用方被串行化到 t、t+interval、
  t+2·interval…（旧的协调器会把它们在同一瞬间唤醒）。
- **保守默认值**：最小间隔 1000 ms，抖动 25 %，首次 429 冷却 60 s，
  指数退避 60→120→240→480 s，上限 15 min，Retry-After 始终作为下限被遵守。
- **惩罚衰减** —— 一次成功绝不会清除惩罚；需连续成功达到可配置次数
  （默认 20）后才衰减。
- **熔断器** —— 反复 429 会 OPEN 闸门；请求以 `PixivCircuitOpenError`
  快速失败；冷却结束后以一次半开探测检验恢复情况。
- **持久化状态端口** —— 注入 `RateLimitStateStore`（例如 SQLite 适配器），
  让重启 / 部署后仍记得生效中的冷却。默认是内存实现。
- **在途请求合并** —— 10 个并发的 `get(123)` 只会发出 1 次 HTTP 请求。
- **分页但不自动爬取** —— `searchPage`/`rankingPage` 加上可选的
  `paginate()` 辅助函数；始终受 `limit`/`maxPages` 约束，并支持
  `AbortSignal`。
- **结构化事件**（通过 `onEvent`）：`request_start`、`request_retry`、
  `rate_limited`、`circuit_opened`、`auth_refresh` 等。凭据绝不会被记录或发出。

## 重试归属

| 失败 | 归属方 |
| ------------------------------- | -------------------------------------------- |
| 网络重置 / 超时 / 5xx | 传输层重试（默认 2 次），线性退避 |
| 熔断处于 CLOSED 时的 429 | 传输层等待共享闸门冷却 |
| 超过熔断 OPEN 阈值后的 429 | 快速失败；持久化重试属于宿主（调度器 / outbox） |
| 401 | 一次 `refreshAccessToken()` + 重试，随后报错 |
| 400 / 403 / 404 | 永不重试 |

该 kit 绝不会在 429 时轮换代理或 IP，也绝不在 App API 与 Web API 之间
切换以规避速率限制。端点能力回退（小说正文 v2→v1/ajax 链）是允许的；
反速率限制的轮换不允许。

## API 接口面

- `createPixivClient(options)` / `new PixivClient(options)`
- `pixiv.illustrations` —— `get/detail`、`detailWithTags`、`searchPage`、
  `search`、`rankingPage`、`ranking`、`userWorksPage`、`listByUser`、
  `ugoiraMetadata`
- `pixiv.novels` —— `get/detail`、`detailCompatible`、`detailWithTags`、
  `searchPage`、`search`、`rankingPage`、`ranking`、`userWorksPage`、
  `listByUser`、`listSeries`、`text`
- `pixiv.tags.autocomplete(word)`
- `pixiv.users.user(userId)`（Pixiv 已移除 `/v1/user/profile`，因此没有「当前用户」端点）
- `pixiv.media.fetch(url)` → `ArrayBuffer`
- `pixiv.getRateLimitStatus()` —— `{ circuitState, cooldownRemainingMs, penaltyLevel, last429At, nextAllowedInMs }`

该包对宿主类型（`TargetConfig`、调度器、SQLite、投递等）一无所知。
把宿主查询映射为 kit 选项是宿主的职责，例如
`mapTargetToPixivQuery(target): IllustSearchOptions`。

## 何时拆分到独立仓库

**不要**现在就拆分。只有以下两条同时成立再拆：

1. 出现第二个真实消费方（另一个 bot、一个 Electron 客户端、一个独立
   下载器等）—— 仅靠 PixivFlow 不足以支撑跨仓库的版本协调。
2. 公开 API 已稳定运行一段时间，且宿主适配器已不再频繁变动。

到那时：用 history-split 把 `packages/pixiv-client` 拆到独立仓库 →
发布 `@redtidev/pixiv-client` 并依赖已发布版本。

## 许可证

MIT
