# Architecture Principles

本文档是 PixivFlow / TelePost / TelePress 生产生态的长期维护准则。后续任何 Agent
接手时以此为准，不重新猜测。

## Content Supply Is A First-Class Operational Concern

A scheduled content system must distinguish:

- execution failure
- no content
- insufficient supply
- policy rejection

"No candidate" is not an error.
It is an operational state requiring explanation.

当看到「bot1 没内容」时，不允许直接改 retry / 改 API / 改 scheduler；先按序检查：

1. 供给（Candidate Supply）；
2. 候选漏斗（Candidate Funnel）；
3. 主题健康度（Topic Health）；
4. 内容库存（Candidate Inventory）。

## Observability 是现有执行事实的增强表达

任何新增 observability 能力都必须是已有执行事实的增强表达，不是平行系统。禁止：

- 重写 scheduler；
- 创建第二套状态系统；
- 创建第二数据库；
- 创建新的 Failure API；
- 修改业务边界；
- 破坏 Slot Ledger / Outcome Contract。

必须复用：Slot Ledger、Execution、TargetOutcome、Candidate、Delivery、Outbox、
Notification、Existing Recovery。

## 空结果是结果，不是沉默

每次 schedule 终态都必须能回答三个问题：发生了什么、是正常还是异常、下一步做什么。
管理员消息不得只剩「没有合适的新作品」。

## 文档同步

每完成一个阶段，必须更新
`docs/architecture/candidate-supply-observability-rfc.md` 的当前状态/已实现/未实现/下一阶段。
禁止只改代码不改文档。
