# Slot Outcome Taxonomy

Business-purpose: **“没有内容可发布”不是系统故障。**

`no_candidate` / `duplicate_exhausted` / `filter_exhausted` are normal business
endpoints. System failures (pixiv API, network, download, processing,
delivery) are a separate set and must be monotone — it is illegal for a
business no-content verdict to transition into `internal_error`.

## Two dimensions — never conflate

```text
slot.status      = execution lifecycle (pending / running / success / partial / failed)
business_status  = business result    (success / partial_success / no_candidate / duplicate_only / failed)
```

Rule (documented contract):

> **禁止使用 `business_status` 驱动 scheduler 状态转换。**
> `slot.status` 描述执行是否结束；`business_status` 描述业务结果。
> 把 `duplicate_only` 当作失败去驱动调度/重试，会把正常空结果变成事故。

## Derived business status

`classifySlotBusinessStatus` projects the durable terminal cell ledger into one
verdict (stored slot phase machine is untouched for compatibility):

| business_status | rule | admin meaning |
| --- | --- | --- |
| `success` | every cell submitted | all good |
| `partial_success` | some submitted + others no-content or system | partially good |
| `no_candidate` | nothing submitted, all cells business no-content (no_match, maybe + duplicate) | no new work |
| `duplicate_only` | nothing submitted, every non-submitted cell duplicate | all candidates already published |
| `failed` | system failure (`executor_failed`/`delivery_failed`) and nothing submitted | needs attention |

## Legal transitions

```
success ─────────────── fine
partial_success ─────── fine
no_candidate/duplicate_only ── never -> internal_error
  (these are terminal business no-ops)
failed ─────────────── system retry/backoff
```

```txt
Pixiv timeout/5xx ── retry (retryable=true)
Pixiv 429 ──────── backoff (retryable=true)
Pixiv 403/401 ──── PIXIV_AUTH_FAILED (retryable=false)
download 404 ───── PIXIV_NOT_FOUND (retryable=false)
candidate all duplicate ── duplicate_exhausted, no fallback
```

## Why duplicate-only must NOT fallback

A fallback is only legal when it can surface NEW candidates. If the scan
attempted 0 and every skip is `duplicate`, the same stale duplicate pool is
returned every retry — retrying only burns the scheduler budget and ends in a
misleading `OperationCancelledError`/`internal_error`. See
`isDuplicateOnlyDeadEnd` / `candidate_exhaustion` event.

## User-facing copy (never leak internal names)

| outcome | user message |
| --- | --- |
| `success` | 任务完成，已发布本轮内容。 |
| `partial_success` | 任务部分完成，部分内容已发布。 |
| `no_candidate` | 本轮没有找到符合条件的新作品，任务已正常结束。 |
| `duplicate_only` | 本轮没有找到新的作品：搜索结果中的候选均已发布过。任务已正常结束。 |
| `failed` | 本轮任务遇到系统异常，请稍后重试或检查日志。 |

Admin still sees full stack / trace_id / pixiv_id / stage / retryable in logs and
`system_errors`.

## 告警规则（alertable）

`alertable` 只在 `business_status === 'failed'` 为 true。监控只对 `failed`
报警；`success / partial_success / duplicate_only / no_candidate` 都不是故障。

| business_status | alertable | 说明 |
| --- | --- | --- |
| success | false | 正常 |
| partial_success | false | 部分投递成功，其余为无内容（不报警） |
| duplicate_only | false | 无新内容，业务正常 |
| no_candidate | false | 无新内容，业务正常 |
| failed | true | 含 pixiv/network/download/processing/delivery 失败 |

## Events

- `candidate_exhaustion` (INFO): structured business event emitted when a
  scheduled target terminates `no_candidate`:
  `{stage, result, reason, searched, duplicates, filtered, attempted, slot_ids}`.
- `schedule.outcome` adds:
  - `outcome_version: 1`（taxonomy version; bump when new business codes are added）
  - `business_status` derived verdict
  - `alertable: boolean`（only `failed` = system failure）
- `system_errors` is reserved for SYSTEM failures; `duplicate_exhausted` /
  `no_candidate` are never recorded there as ERROR.

## Manual recovery outcome (「放宽条件重试」)

A manual recovery (`POST /internal/targets/:targetId/recover`) opens a dedicated
`<schedule>@recover-<requestId>` slot and reports through the normal
`schedule-outcome` channel. The recovery business verdict is NOT the raw cell
status — the UI (Mini App / Telegram card) must translate via
`RecoveryOutcome.recoveryOutcomeFor`:

| recovery_state | raw cell evidence | user copy |
| --- | --- | --- |
| `recovery_pending` | no cell yet | 正在等待恢复任务... |
| `recovery_running` | pending/selected/artifact_ready/delivery_pending | 正在尝试扩大搜索范围... |
| `recovery_success` | submitted | 恢复成功，已找到并发布新作品。 |
| `recovery_no_candidate` | no_candidate (other) | 扩大搜索范围后，仍未找到符合条件的新作品。任务已正常结束。 |
| `recovery_duplicate_only` | no_candidate/duplicate with duplicate_exhausted | 扩大搜索范围后，找到的作品均已发布过。没有新的内容可发布。 |
| `recovery_failed` | failed | 恢复任务执行失败。请查看日志或稍后重试。 |

Idempotency: the slot id is deterministically derived from `requestId`
(`<scheduleId>@recover-<requestId.lower>`); a repeated click with the SAME
`requestId` converges to the same slot and returns `already_completed` when it
already terminated — it never opens a second task, so a double tap cannot
double-publish. A DIFFERENT `requestId` is a distinct new business request by
design.
