# 会话交接（PixivFlow）

## 2026-10-29 Markdown 正式导出任务

P-17~19 已完成并本地全绿（149 suites / 1637 tests + typecheck）：`md` 格式、
`.novel.md` 命名、`markdown-export` variant、图片离线化、系列合订、离线重导出、
中英文文档与 `.agent/` 记录。边界见 DECISIONS D-10。待办 P-20：PR → CI →
（用户授权后）发版 → deploy pin。用户在会话中给出产品层提醒：优先保证
「结果可信/作品库可迁移/失败可恢复」，md 验收按用户价值（完整正文、图片可用、
系列顺序、换机可读、重导出不破坏 TXT）执行——已由测试覆盖；首次使用体验与
结果汇总报告属后续独立立项，不在本 PR 范围。

## 2026-10-27 当前投递可靠性任务

P-13~15 进行中：小说重复插图资产是本次 400 根因；实现与本地回归已完成，
双仓 CI 门禁/PR/发行/部署待闭环。以 STATUS/TASKS 和 deploy current-state 为准，
下方为历史交接。保留用户 config/.current-config 改动，不提交。

## 2026-10-26 集中式优化轮交接（已闭环）

- 生产 **3.7.2**（`bd188cb`）不变——本轮 PR #214（`refactor:`）CI 全绿已合并，
  零行为/协议变化不触发发版，deploy pin 无需更新；`pixivflow recovery-status`
  CLI 已入 master，随下次功能发版进入镜像。
- 已完成：架构盘点、词表 SSOT 收敛、死抽象删除、`recovery-status` CLI 同源化、
  `.agent/` 体系、三操作语义审计、deploy 仓 smoke 三处误报修复（PR #276）。
- 任务明细与 DEFERRED 清单见 TASKS.md；决策见 DECISIONS.md（D-01~D-07）。
- 悬而未决（用户侧）：TelePost 审核 #212（恢复链头，作品 151271923，4 图）待
  用户在审核群批准发布；#112（bot2，25 天前空载荷 failed）从未被恢复。
- 本轮集中治理**正式结束**，回归正常功能迭代；后续任务从 TASKS.md 的
  DEFERRED 项按需立项。
