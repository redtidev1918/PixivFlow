---
name: pixivflow-release
description: PixivFlow 的可重复发布流程（npm test → PR → CI → release-please → 产物 → deploy 仓 pin → fly deploy → 验收）。3.7.1/3.7.2 两班次已验证。
---

# PixivFlow 发布流程

1. **工作树**：`git status` 干净（`config/.current-config` 是本机路径，不提交）；
   从最新 `master` 切分支，命名 `codex/<topic>`（branch-contract 要求）。
2. **测试**：定向 `npx jest --runTestsByPath src/__tests__/<area>/...`；
   全量 `npm test`（test:kit + jest --runInBand，~1 分钟）；
   `npx tsc --noEmit`；lint 按 CI 提示。
3. **PR**：`gh pr create --base master`（中文正文：根因/修复语义/兼容性/测试计划）。
4. **CI**：`gh pr checks <n> --watch` 直至全绿（Test Node 22/24 ×3 平台、镜像构建、
   branch-contract、gitleaks、release build-plan）。
5. **合并**：`gh pr merge <n> --squash`。
6. **release-please**：合并后自动开 `chore(master): release X.Y.Z` PR；等 CI 全绿后合并。
7. **产物核对**：`gh release view vX.Y.Z`（tgz + RELEASE-METADATA.json + SHA256SUMS）；
   发版 commit = squash merge 后 master HEAD（`git rev-parse origin/master`）。
8. **部署 pin**：deploy 仓 `fly/deploy.pixivflow.toml` 更新
   `PIXIVFLOW_REF`（40 位 commit）+ `PIXIVFLOW_VERSION` + 注释块（含 Rollback 行），
   走 PR → CI → 合并。
9. **部署**：deploy 仓执行 `fly deploy -c fly/deploy.pixivflow.toml --ha=false`
   （DNS AAAA 告警是既有传播延迟提示，可忽略）；空闲自停属设计。
10. **验收（只读）**：`curl https://pixivflow-scheduler.fly.dev/health`
    （version/commit 短哈希）——GET 会经 auto_start 唤醒机器（冷启 ~8s 属正常）。
    本机 `smoke-pixivflow.sh` 曾因 fly 表格前导空格误报，修复后以脚本为准。
11. **跨仓顺序**：协议增量字段与 TelePost 消费者兼容时任意顺序；行为变更
    （新增状态/改文案语义）先发 Provider 再发 Consumer，最后 deploy 仓基线。

## 约束

- 生产操作仅走上述通道；`--ha=false` 必须保留（单机执行面）。
- 回滚 = deploy 仓 pin 改回上一 commit 并重新 `fly deploy`。
- 发版后同步 deploy 仓 `docs/operations/current-state.md` 与本仓 `.agent/STATUS.md`。
