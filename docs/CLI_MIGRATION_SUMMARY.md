# v1 → v2 CLI 迁移指南

> **English:** Migration notes for users upgrading from the v1 shell-script
> workflow to the v2 `pixivflow` CLI. It covers what changed (command entry
> point, config file location, output behavior), a side-by-side command
> mapping table, how to run the config path migration command, and answers
> to common upgrade questions.

本文档面向从 v1(shell 脚本工作流)升级到 v2 的用户。读完即可在 v2 下完成登录、下载与配置管理,不需要了解内部实现。

---

## v2 有什么变化

### 命令入口

- **v1**:必须在仓库目录运行 `./scripts/pixiv.sh <command>`,脚本负责编译和委派。
- **v2**:`npm install -g pixivflow` 后,`pixivflow` 是一个独立可执行命令(`package.json` 的 bin 字段指向 `dist/index.js`),任意目录可用。
- Shell 脚本仍然保留,作为本地开发的备用入口;全局安装用户可以完全不碰它们。

不带子命令直接运行 `pixivflow` 时,行为取决于配置:`scheduler.enabled` 为真则启动定时任务,否则执行一次下载。这与旧版 `npm start` 等价。

### 配置文件位置

v1 统一使用仓库内 `config/standalone.config.json`。v2 按运行场景解析配置路径:

| 优先级 | 来源 | 路径 |
| --- | --- | --- |
| 1 | 命令行参数或环境变量 | `--config` 参数 / `PIXIV_DOWNLOADER_CONFIG` 环境变量指定的文件 |
| 2 | 部署目录 | 当前目录(或脚本所在目录向上查找)是有效部署项目根时,`<root>/config/standalone.config.json` |
| 3 | 全局安装 | 存在 `~/pixivflow/` 则用 `~/pixivflow/config/`,否则 `~/.pixivflow/config/` |
| 4 | 开发目录/兜底 | 同样回退到 home 目录下的上述位置 |

找不到任何配置时,v2 会自动生成一份默认配置再继续,而不是报错退出。多数"从 v1 升级后找不到配置"的问题,是目录切换触发了优先级变化——用 `pixivflow config show` 末尾输出的 Configuration file 一行确认当前实际使用的文件。

### 输出行为

- v2 CLI 输出统一为英文;`scripts/` 里的包装脚本仍输出中文。
- 未知命令会给出最接近的候选命令提示;命令失败时进程以非零码退出,便于脚本化。`pixivflow help [command]` 查看任意命令用法。

---

## 新旧命令对照

| v1 操作 | v2 命令 | 说明 |
| --- | --- | --- |
| `./scripts/easy-setup.sh` | `pixivflow setup` | 交互式配置向导(v2 版) |
| `./scripts/login.sh` | `pixivflow login`(别名 `l`) | 打开浏览器的交互式登录 |
| `login.sh --headless -u ... -p ...` | `pixivflow login-headless`(别名 `lh`) | 无头登录 |
| 直接粘贴 refresh token | `pixivflow refresh`(别名 `r`) | 用 refresh token 登录,适合无 GUI 服务器 |
| `./scripts/pixiv.sh once` | `pixivflow download` | 执行一轮配置中的下载任务 |
| — | `pixivflow download --url <url>` | 不改配置,按 URL 直链下载 |
| `./scripts/download-with-config.sh` | `download --targets` / 临时改配置文件 | JSON 目标传参,行为略有差异 |
| `./scripts/download-ranking.sh` | 无一对一命令,保留脚本可用 | 排行榜批量下载 |
| `./scripts/pixiv.sh run` | `pixivflow scheduler` | 启动定时下载器 |
| `./scripts/pixiv.sh random` | `pixivflow random` | 随机下载(`--novel` 下载小说) |
| `./scripts/pixiv.sh status` | `pixivflow status`(别名 `stats`) | 下载数量与最近记录 |
| `./scripts/pixiv.sh logs` | `pixivflow logs` | 查看日志 |
| `./scripts/pixiv.sh stop` | `Ctrl+C`(前台)/进程管理器控制 | v2 默认前台运行,无内置 stop 命令 |
| `config-manager.sh`(旧) | `pixivflow config show/validate/set/edit/backup/restore/list/diff` | 配置管理子命令全集 |
| `auto-backup.sh`(旧) | `pixivflow backup`(别名 `backup-data`) | 备份配置与数据 |
| `auto-maintain.sh`(旧) | `pixivflow maintain`(别名 `cleanup`) | 日志清理、数据库维护等 |
| `auto-monitor.sh`(旧) | `pixivflow monitor`(别名 `watch`) | 进程状态监控 |
| `health-check.sh`(旧) | `pixivflow health`(别名 `check`) | 环境与健康诊断 |
| 手工数文件 | `pixivflow dirs`(别名 `paths`) | 列出下载/数据库等目录信息,`--verbose` 更详细 |
| `node dist/index.js --version` | `pixivflow version`(别名 `v`) | 版本信息 |

其余新增能力:`pixivflow normalize`(整理已下载文件)与 `pixivflow webui`(启动 WebUI 服务器,别名 `w`,支持 `--port/--host`)。v1 没有 WebUI 服务入口,此前由前端独立管理。

---

## 配置迁移步骤

`migrate-config`(别名 `mc`)的职责只有一个:**把配置文件中的存储路径从绝对路径改成相对路径**,涉及四个字段:`storage.databasePath`、`storage.downloadDirectory`、`storage.illustrationDirectory`、`storage.novelDirectory`。它不做新旧格式转换——v1 与 v2 使用同一份 `standalone.config.json` 结构,通常无需转换格式。

```bash
# 先预览将发生哪些改动,不写盘
pixivflow migrate-config --dry-run

# 确认无误后实际执行
pixivflow migrate-config

# CI 或自动化中读取 JSON 结果
pixivflow migrate-config --json

# 显式指定配置文件(否则按上表优先级自动解析)
pixivflow migrate-config --config ~/pixivflow/config/standalone.config.json
```

三点注意:

1. 相对路径相对于**配置文件所在目录**(而非当前工作目录)解析。
2. 即使不手动跑这条命令,每次加载配置时加载器也会对不存在于新环境的绝对路径做一次自动修复(auto-fix)。手动迁移的意义在于拿到明确的变更清单并提前备份。
3. 建议先 `pixivflow config backup` 再迁移,失败可 `config restore` 回滚。

典型场景:把整个 v1 目录拷贝到新机器,或在 Docker 挂载卷之后,宿主机绝对路径失效——此时跑一次 migrate-config 即可让配置恢复可移植。

---

## 常见问题

**Q: 升级后 token 还能用吗?**
A: 能。凭据存储没有变,v1 登录拿到的 refresh token 在 v2 中直接生效。若遇到认证错误(`AuthenticationError`),CLI 会提示重新执行 `pixivflow login` 或 `pixivflow login-headless`。

**Q: 我还需要克隆仓库吗?**
A: 不需要。`npm install -g pixivflow` 是完整产品。只有要改源码、跑 `scripts/` 辅助脚本(排行榜下载、Docker 管理等)才需要仓库。

**Q: Node.js 版本要求?**
A: engines 字段限定 Node ^18.14.0 / ^20 / ^22,npm >=9。

**Q: 下载一直去同一个目录,怎么确认 v2 实际写到了哪里?**
A: `pixivflow dirs` 显示全部存储路径及其是否存在;若不是预期位置,回到上文优先级表检查是否有别的配置被选中。

**Q: WebUI 怎么启动?**
A: `pixivflow webui`(或 npm 场景 `npm run webui:start`)。前端静态资源缺失时它会尝试定位 npm 全局安装路径内打包的前端,无法找到时会给出构建指引。

**Q: 原 v1 的 cron 表达式还认吗?**
A: 认。调度器仍读取 `scheduler.cron` 与 `scheduler.timezone`,字段含义见 CONFIG.md。

---

## 相关文档

- [USAGE.md](./USAGE.md) — v2 全部命令与下载方式详解
- [CONFIG.md](./CONFIG.md) — standalone.config.json 全字段说明
- [SCRIPTS.md](./SCRIPTS.md) — 若仍想使用 shell 入口
- [DOCKER.md](./DOCKER.md) — 从源码部署切到 docker compose 部署
