# Operational Result Contract

状态：Accepted（最小兼容演进）

## 背景与当前问题

PixivFlow 已经拥有 `TargetOutcome`、durable Slot/Cell、terminal reason、Recovery 和
Outbox；TelePost 已经拥有 schedule outcome 接收端和管理员消息 renderer。生产缺口不是
缺少一套 Failure 系统，而是现有原因在 HTTP schedule-outcome adapter 中被丢弃：持久化
payload 有原因，发给 TelePost 时却只保留目标、类型、状态和作品 ID。管理员因此仍可能只看到
“执行失败”，无法区分下载、认证、限流、配置或投递问题。

## 当前传播链

```text
Candidate scan / Download / Delivery
  -> TargetOutcome
  -> SlotCoordinator transition
  -> schedule_slot_items (terminal_reason_code/message)
  -> NotificationPolicy
  -> durable Outbox notification
  -> HttpMultipartDelivery schedule outcome
  -> TelePost /schedule/outcomes
  -> review/admin Telegram message
```

`TargetOutcome` 是一次 target 执行的业务结论；Slot/Cell 是 durable 状态权威；Outbox 只负责
可靠传输；TelePost 只负责认证、幂等接收与管理员展示。任何一层都不得创建平行失败账本。

## 已有字段与生命周期

| 字段 | 权威位置 | 生命周期 |
| --- | --- | --- |
| `kind/status` | `TargetOutcome` -> cell | target 执行到终态 |
| `retryable` | failed `TargetOutcome` | 执行期重试/恢复决策 |
| `error` | outcome/cell | 内部诊断；不得直接作为管理员契约 |
| `terminal_reason_code` | cell | durable、机器可读一级根因 |
| `terminal_reason_message` / `reason` | cell/outbox | 安全的业务摘要 |
| `errorClass/retryAfterMs` | batch execution result | 进程级退避诊断 |

## 缺口

- schedule-outcome HTTP adapter 丢弃 terminal reason，TelePost 无法稳定展示根因。
- 管理员契约缺少明确的阶段、是否值得再次尝试、以及下一步建议。
- `bot1` 失败而 `bot2` 成功只能靠日志串联，结果消息不能直接指出失败阶段。
- raw `error` 仍可能成为 renderer 的 fallback；它不应成为跨服务公共契约。

## 最小方案

扩展现有 schedule outcome target，不增加 endpoint、表或状态机：

```json
{
  "status": "failed",
  "terminal_reason_code": "download_failed",
  "stage": "download",
  "reason": "图片下载失败",
  "retryable": true,
  "operator_hint": "可稍后重试；若持续发生，请检查网络与存储空间。"
}
```

沿用仓库已有 lower_snake_case code，避免引入第二套 `DOWNLOAD_FAILED` 枚举。HTTP 状态、次数等
证据未来可放入可选 `metadata`，但不得包含凭据、路径、堆栈或未经清洗的响应体。

这里的 `retryable` 表示“未来或人工再次执行可能成功”，不表示当前 terminal slot 仍有自动重试
在排队。自动恢复是否仍在进行继续由 Slot/Recovery FSM 决定。

`stage/retryable/operator_hint` 由 durable `terminal_reason_code` 派生，不另行持久化。这样历史行
无需迁移，展示策略可以独立演进。旧 PixivFlow 不发送新字段时，TelePost 保持旧渲染；新
PixivFlow 对旧 TelePost 也只是增加可忽略 JSON 字段。

## bot1 / bot2 差异诊断路径

按以下顺序比较，且不得输出凭据值：

1. config：target、schedule、filter、delivery target 与资源 profile 是否不同；
2. auth：两者绑定的 `pixiv.accountId` 及认证是否“就绪/失效”；
3. execution context：slot、occurrence、recovery mode 与代码版本；
4. resource admission：资源 key、容量、等待和实际准入次序；
5. concurrency：是否共享同一受限账号，是否出现 429/timeout；
6. candidate：扫描数、过滤/重复分布、最终候选；
7. download：阶段、超时/HTTP 类别、产物数量和存储可用性。

bot/schedule 名不是并发资源身份；资源治理继续只使用 `pixiv-account:<accountId>`。

## 替代方案

- 新建 Failure API/表：拒绝，会产生第二状态权威和新的恢复一致性问题。
- 直接发送异常字符串：拒绝，不稳定、不可自动判断，并可能泄漏内部信息。
- 重写为统一语言或迁移到 Cloudflare：与此缺口无关且扩大风险面。

## 风险、灰度与回滚

- 风险：`retryable` 被误解为自动重试仍在运行。字段注释和管理员文案必须明确区分。
- 风险：建议文案过度承诺。建议只描述检查或恢复动作，不断言未经观测的根因。
- 灰度：先部署 TelePost（容忍可选字段），再部署 PixivFlow；观察一轮真实 occurrence。
- 回滚：回滚 PixivFlow transport 字段即可；TelePost 对缺失字段保持兼容，无数据迁移。

## 验证

- download failure 跨 Outbox/HTTP 后仍带 code、stage、summary、retryable、operator hint；
- TelePost 管理员消息不能只包含“执行失败”；
- bot1/bot2 的 endpoint 与 slot 成员隔离，单方失败不污染另一方结果；
- 全量单元/集成测试、类型检查和构建通过；生产验收必须读取真实 terminal 通知与 durable 行。
