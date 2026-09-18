# Candidate Supply RFC (Phase 5 — Topic Profile + Candidate Inventory)

状态：Accepted（本文件为 Phase 5 实施蓝图；后续以「实施状态」持续同步）
范围：PixivFlow（worker + scheduler + delivery）→ TelePost（审核群渲染）
依赖：Phase 1–3（Candidate Report / Empty Result Projection / Target-labeled UX）已上线。

## Problem

生产事故不是「下载任务没开始」，而是**发布承诺与内容供给不匹配**：

- `bot1-daily`（ボテ腹）3 天 lookback 内候选已被消费干净；
- 1 天内多次 empty `no_candidate` / `duplicate_exhausted`；
- 管理员能看到 funnel（Phase 1–3 已修复），但**用户等待的是「作品或明确通知」，
  而不是「funnel 报告」**。
- 只要发布把「每日定时」当作契约，稀疏主题必然制造「等了没等到」的体验失败。

阶段目标：

1. **不再对空结果静默**（已完成：终态通知 + 漏斗 + target-labeled 按钮）。
2. **给主题建立供给库存**：跨窗口收集尚未发布的合格作品，作为空窗期兜底。
3. **把供给库存做成一等可见资源**：审核群不再用「今天没有」回答用户，
   而是「今天没有新作，待发池还有 N 条，预计可用到 X 日」。
4. 发布策略改动必须**默认关闭、按主题开启、可回滚**。

## Current Architecture（Phase 1–3 之后）

```text
Scheduler
  -> Target (topic)
    -> TopicPipeline.selectWorks(day)   # 单日搜索 + 去重 + metadata 过滤
    -> DownloadPlanner 去下载历史       # 已下载 ⇒ 丢弃
    -> pipeline.run(...)               # 候选 → 下载 → delivery enqueue
    -> 空窗时只能 no_candidate（虽有 funnel）
```

候选生命周期到此为止：**没有被交付的合格作品没有归宿**，下一轮也从零开始。

## Design

### Phase 4 — TopicProfile（配置层：种子 + 关联 + 供给策略）

在 `TargetConfig` 上新增可选 `topicProfile`，不替代既有 `topic` / `topicDiscovery`：

```jsonc
{
  "id": "bot1-illust",
  "mode": "topic",
  "topic": "ボテ腹",
  "topicProfile": {
    "primary": ["ボテ腹"],
    "related": ["妊娠", "pregnant"],
    "strategy": {
      "freshnessWeight": 0.4,
      "popularityWeight": 0.3
    },
    "inventory": {
      "enabled": true,
      "maxAgeDays": 30,
      "reserveSize": 20,
      "fallback": true
    }
  }
}
```

选择器仍以「新鲜优先」为主：`strategy.freshnessWeight` + `popularityWeight`
保留给未来实现优先级列；**本期不重写 TopicPipeline 的排序**，只把配置与校验落下来
（避免「为了 TS 而 TS」）。

### Phase 5 — CandidateInventory（持久化待发池）

新增 **同一 SQLite 数据库** 内的一张表（不建第二状态源）：

```sql
CREATE TABLE candidate_inventory (
  pixiv_id       TEXT NOT NULL,
  work_type      TEXT NOT NULL,
  topic          TEXT NOT NULL,
  target_id      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|selected|submitted|filtered|expired
  snapshot_json  TEXT NOT NULL,                    -- 全文元数据，供兜底启用时直接交付
  first_seen_date TEXT NOT NULL,
  last_seen_date TEXT NOT NULL,
  seen_count     INTEGER NOT NULL DEFAULT 1,
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT NOT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pixiv_id, work_type, topic, target_id)
);
CREATE INDEX idx_cinventory_pending ON candidate_inventory(status, first_seen_date, expires_at);
```

生命周期：

```text
TopicPipeline.selectWorks
   └─ 每个通过过滤的 work
        ├─ 已下载 / 已投递  → 不进入 inventory
        └─ 否则            → UPSERT pending（幂等）
                                │
        handleTopicWithLookback
        ├─ 当日/回看有交付 ⇒ 正常路径
        └─ 无交付 & inventory.enabled
             └─ claimNext(topic, target_id, reserveSize, maxAgeDays)
                  ├─ 标记 selected → pipeline.run 再试
                  │   ├─ submitted ⇒ 标记 submitted（并从待发池移除）
                  │   └─ skipped / filtered ⇒ 标记 filtered 或 attempt_count+1
                  └─ 依然无候选 ⇒ no_candidate（funnel 附带 inventory 库存）
```

约束：

- **默认关闭**，`candidateInventory.enabled` 为 false 时行为完全不变。
- 兜底发布是**逐条幂等**：DB 主键 + delivery idempotency ledger 保证不会重发。
- maxAgeDays 默认 30；过期项只能被 `evictExpired`，不会自动发布。
- CandidateSupplyReport 增加 `inventory`：
  `{ pendingCount, reserveSize, maxAgeDays, oldestSeenDate }`，随既有
  `candidate_report` 字段一起到 TelePost。
- TelePost 空结果消息增加一行：`待发池：N 条（预计可用到 YYYY-MM-DD）`。

### 为什么不在本期做的事

- 不自动修改频道承诺文案；由运营在描述中决定「每日」说辞。
- 不引入 Watchdog/独立告警服务；终态通知已覆盖「是否运行成功」，
  缺少的是「供给还有多少」。
- 不做跨主题自动换内容（bot1 空 → bot2）——那是业务策略变化，不是基础设施。

## 事件 / 可观测性字段

`CandidateSupplyReport` 演进（向后兼容，旧消费者忽略新增字段）：

```jsonc
{
  "fetched": 120,
  "selected": 0,
  "rejected": 118,
  "reasons": [{ "code": "duplicate", "count": 118 }],
  "inventory": {
    "pendingCount": 6,
    "reserveSize": 20,
    "maxAgeDays": 30,
    "oldestSeenDate": "2026-09-03"
  }
}
```

## Validation Requirements

每次改动必须走完整链路：

```text
Code -> Tests -> PR -> Merge -> Release -> Deploy -> Runtime Verification
```

Production Verification：

1. 更新后的 `candidate_report` 在 bot1 `no_candidate` 时含 `inventory`；
2. TelePost 空结果消息显示 `待发池：N 条`；
3. 未开启 inventory 的 target 行为完全不变（回归）；
4. 开启后磁盘/DB 迁移幂等，滚动重启不停机；
5. 旧 recovery callback 不变。

## 实施状态

### Phase 4 — TopicProfile
- [x] 配置类型 + schema 校验 + 文档
- [x] 默认关闭 / 每 target 可选（生产已为 bot1/bot2 开启）

### Phase 5 — CandidateInventory
- [x] 迁移：`candidate_inventory` 表 + 索引
- [x] `CandidateInventoryRepository`（upsert / claimNext / markSubmitted / count / evict）
- [x] Illustration / Novel 的 topic 扫描写入 pending inventory
- [x] 空窗 fallback：`claimNext` → 按 target 再跑 `pipeline.run`
- [x] `CandidateSupplyReport.inventory` 字段 + 持久化
- [x] TelePost 空结果消息渲染 `待发池：N 条`

## Final Report 模板

- Problem / Root Cause / Architecture Decision / Documentation Updated / Changes /
  Tests / Release / Deployment / Runtime Verification / Remaining Risks
