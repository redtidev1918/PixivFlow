# Slot Outcome Taxonomy

Business-purpose: **“没有内容可发布”不是系统故障。**

`no_candidate` / `duplicate_exhausted` / `filter_exhausted` are normal business
endpoints. System failures (pixiv API, network, download, processing,
delivery) are a separate set and must be monotone — it is illegal for a
business no-content verdict to transition into `internal_error`.

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

## Events

- `candidate_exhaustion` (INFO): structured business event emitted when a
  scheduled target terminates `no_candidate`:
  `{stage, result, reason, searched, duplicates, filtered, attempted, slot_ids}`.
- `schedule.outcome` adds `business_status` derived verdict.
- `system_errors` is reserved for SYSTEM failures; `duplicate_exhausted` /
  `no_candidate` are never recorded there as ERROR.
