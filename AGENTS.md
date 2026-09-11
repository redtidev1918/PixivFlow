# AGENTS.md

面向在本仓库工作的 AI agent 与开发者。动手前先读本文件，再读
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与 [docs/CONFIG.md](docs/CONFIG.md)。

## 职责

PixivFlow 负责 Pixiv 侧的一切：Pixiv App API 访问、下载计划与调度、Slot 幂等、下载执行、
存储组织，以及把产出投递给下游。它不负责 Telegram 交互、投稿审核与发布。

三仓组合的边界（唯一权威描述是 pixivflow-telepost-deploy 仓库的 `docs/ARCHITECTURE.md`）：

- PixivFlow：Pixiv domain、schedule execution、Slot、outbox、delivery
- TelePost：Telegram、submission、review、publish
- pixivflow-telepost-deploy：只负责 deployment glue

不要把 Telegram Bot 逻辑、审核队列或频道发布搬进本仓库，也不要在这里重新实现部署编排。

## 核心目录

| 路径 | 职责 |
| --- | --- |
| `src/cli/`、`src/commands/` | 命令注册与各子命令实现 |
| `src/scheduler/` | 调度与 Slot 幂等 |
| `src/download/`、`src/batch/` | 下载执行与批量任务 |
| `src/delivery/` | 投递（含 outbox） |
| `src/storage/` | 目录组织与持久化 |
| `src/pixiv/`、`packages/pixiv-client/` | Pixiv App API 客户端；429 限流闸门在 `packages/pixiv-client` |
| `src/webui/` | WebUI 后端；前端源码在 pixivflow-webui 仓库 |
| `config/` | 配置示例与说明，见 `config/README.md` |
| `docs/` | 项目文档，导航见 `docs/README.md` |

## 常用命令

```bash
npm run build        # 构建：子包 + 版本注入 + tsc + webui 包元数据
npm run typecheck    # 类型检查
npm test             # 子包与应用测试
pixivflow health     # 运行期自检
```

改动下载管线或调度时至少跑 `npm run typecheck` 与 `npm test`。

## 约束

- 运行时要求 Node.js >= 22.13.0；使用 npm workspaces，`@redtidev/pixiv-client` 是工作区子包
- Pixiv 429 限流只允许一个闸门，实现在 `packages/pixiv-client`，不要在调用方各写一份
- `docs/download.md`、`docs/en/download.md`、`docs/download-preview.md` 由
  `.github/workflows/update-download-page.yml` 自动生成，不要手改
- `CHANGELOG.md` 由 release-please 生成，不要手改；发版流程见 `docs/RELEASING.md`
- 改动文档后同步 `docs/_sidebar.md` 与 `docs/en/_sidebar.md`，并检查相对链接
