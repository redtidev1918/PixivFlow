# Candidate Supply Observability RFC

状态：Accepted（分阶段实施，本文件持续同步）
范围：PixivFlow / TelePost / TelePress 生产生态
登录后 Agent 接手时以此为准，不重新猜测本次事故的根因。

## Problem

固定 tag + 固定 lookback + 每日实时搜索，无法保证长期内容供应。

典型案例：`bot1-daily` / ボテ腹。

- 内容池较小；
- 发布消耗速度高；
- 出现 duplicate exhaustion；
- 导致 daily `no_candidate` / `duplicate_exhausted`。

现象：scheduler 正常、API 正常、worker 正常，但没有候选；管理员只看到
「没有合适的新作品」，无法判断是系统故障 / 配置问题 / 内容不足 / 主题耗尽。

这不是单个 bug，而是 **Content Supply Observability 缺失**。

## Current Architecture

```text
Scheduler
  -> Target
  -> Candidate Search
  -> Filtering
  -> Selection
  -> Delivery
```

当前没有 Candidate Inventory；依赖实时搜索。候选漏斗（raw / deduplicated /
aiExcluded / accepted / duplicate / skipped）只在日志中存在，未持久化、未进入
Outcome Contract，因此审核群和后续 Agent 都看不到。

## Decision

未来演进方向：

```text
Topic Profile
  -> Candidate Collector
  -> Candidate Supply
  -> Ranking
  -> Scheduler
  -> Publication
```

但当前阶段不实现完整 Candidate Pool；先实现 **Candidate Supply Observability**。

约束：

- 不创建第二套状态系统；
- 不创建第二数据库；
- 不修改业务边界；
- 不破坏 Slot Ledger / Outcome Contract；
- 所有新增能力是已有执行事实的增强表达。

## Phase Plan

### Phase 1 — Candidate Report

把已有日志中的过滤漏斗提升为 Outcome Contract。不新建状态，数据来自现有
candidate pipeline。新增 `candidateReport`：

```json
{
  "fetched": 59,
  "selected": 0,
  "rejected": 59,
  "reasons": [
    { "code": "duplicate", "count": 30 },
    { "code": "ai_filtered", "count": 20 },
    { "code": "language_filter", "count": 9 }
  ]
}
```

不固定 `aiExcluded` / `languageExcluded` 等字段；未来 Novel / Illustration 过滤链
不同，必须支持扩展。

### Phase 2 — Empty Result Classification

保留已有 terminal code，不修改 `no_candidate` / `duplicate_exhausted`。

新增 projection（推断标签，不是新 terminal）：

- `no_content_today`：今天内容不足，如 fetched 很少。
- `policy_too_narrow`：过滤规则过严，如 language / score filter。
- `candidate_supply_low`：近期多次 duplicate + zero candidate + 低库存。

注意：不叫 `pool_saturated`，因为这是推断，不是事实。

### Phase 3 — Telegram UX Improvement

多 target 时旧按钮无法区分：

```text
[再试一次] [放宽条件重试]
[再试一次] [放宽条件重试]
```

改为带目标名：

```text
[重试·插画] [放宽·插画]
[重试·小说] [放宽·小说]
```

callback 保持 `target_id`，不改变协议。

消息改为运营报告，例如：

```text
⚠️ bot1-daily 内容供应不足

主题：ボテ腹
候选扫描：59
重复：30
过滤：29
最终候选：0
判断：candidate_supply_low
建议：扩大主题范围或调整发布频率
```

### Phase 4 — Topic Profile Design（RFC only，不实现）

未来以 `TopicProfile` 替代 `tag: string`：

```yaml
name: ボテ腹
primary:
  - ボテ腹
related:
  - 妊娠
  - pregnant
strategy:
  freshness_weight: 0.4
  popularity_weight: 0.3
```

目的：支持关联 tag、fallback、热度策略。当前仅记录设计，不实现。

### Phase 5 — Candidate Inventory（RFC only，不实现）

从「每天 search」演进为：

```text
Collector -> Candidate Inventory -> Reserve -> Publish
```

当前仅记录方向，不实现。

## Validation Requirements

每次修改必须走完整链路：

```text
Code -> Test -> PR -> Merge -> Release -> Deploy -> Runtime Verification
```

Production Verification 必须验证：

1. bot1 `no_candidate` 时管理员看到详细漏斗；
2. bot2 正常运行不受影响；
3. 旧 recovery 不受影响；
4. 旧 TargetOutcome consumer 不破坏。

## Documentation Synchronization Rule

每完成一个阶段，必须更新本文件：

- 当前状态
- 已实现
- 未实现
- 下一阶段

禁止只改代码不改文档。

## 实施状态（持续同步）

### Phase 0 — Docs

- [x] 本 RFC
- [x] docs/architecture/README.md 索引
- [x] docs/architecture/principles.md（Content Supply Is A First-Class Operational Concern）

### Phase 1 — Candidate Report

- [ ] 未开始

### Phase 2 — Empty Result Classification

- [ ] 未开始

### Phase 3 — Telegram UX Improvement

- [ ] 未开始

### Phase 4 — Topic Profile

- [ ] RFC only（已记录，待展开设计）

### Phase 5 — Candidate Inventory

- [ ] RFC only（已记录方向，待展开设计）

## Final Report 模板

输出时使用：

- Problem
- Root Cause
- Architecture Decision
- Documentation Updated
- Changes
- Tests
- Release
- Deployment
- Runtime Verification
- Remaining Risks

禁止使用「基本完成」；必须给出 Verified / Remaining Risk。
