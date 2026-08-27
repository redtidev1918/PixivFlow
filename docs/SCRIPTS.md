# 脚本指南

> **English:** This document catalogs every executable script in the
> `scripts/` directory. Scripts fall into three groups: user-facing entry
> points (setup, login, download, Docker), development/maintenance helpers
> (security checks, code analysis, diagnostics), and CI/release pipeline
> scripts (publishing, tag cleanup, version management). A table maps npm
> script aliases to their underlying shell scripts.

本文档覆盖 `scripts/` 目录下全部脚本的用途与用法。脚本分三类:用户脚本开箱即用,维护/开发脚本用于安全检查与代码分析,CI/发布链脚本支撑 npm 与 GitHub 发布。示例基于 macOS/Linux shell;全局安装用户优先使用 `pixivflow` 命令,Docker 场景见各节说明。

---

## 总览

| 脚本 | 类别 | 一句话用途 |
| --- | --- | --- |
| `pixiv.sh` | 用户 | 主控制入口,封装全部核心命令 |
| `pixiv-cli.sh` | 用户 | 直接调用 `dist/index.js` 的 CLI 封装(自动构建) |
| `login.sh` | 用户 | 交互式/无头登录 Pixiv 账号 |
| `quick-start.sh` | 用户 | 首次使用一键流程:环境检查→登录→配置→测试下载 |
| `easy-setup.sh` | 用户 | 三步交互式配置向导,写入配置文件 |
| `docker.sh` | 用户 | Docker 构建、部署与容器管理 |
| `download-ranking.sh` | 用户 | 按 Pixiv 排行榜下载作品或小说 |
| `download-with-config.sh` | 用户 | 以命令行 JSON 或文件临时覆盖下载目标 |
| `proxy-forwarder.js` | 用户 | HTTP 代理转发服务,供容器访问宿主机 127.0.0.1 代理 |
| `start-proxy-forwarder.sh` | 用户 | 启动代理转发并自动改写配置中的代理主机 |
| `get-docker-gateway.sh` | 用户 | 检测 Docker 网关 IP |
| `install-python-deps.sh` | 用户 | 安装 Python >=3.9 与 gppt 库(无头登录依赖) |
| `update-and-fix.sh` | 用户 | 备份后更新代码、依赖并修复常见问题 |
| `docker-healthcheck.sh` | 用户(Docker) | 容器健康检查:校验数据库文件与应用可运行 |
| `lib/common.sh` | 共享库 | 各脚本的通用函数与常量定义 |
| `check-sensitive-info.sh` | 维护 | 扫描仓库是否残留真实 token、密码等敏感信息 |
| `verify-git-safety.sh` | 维护 | 校验 .gitignore、pre-commit 钩子等 Git 安全措施 |
| `analyze-complexity.js` | 维护 | 统计 TypeScript 圈复杂度等质量指标 |
| `config-diagnostic.ts` | 维护 | 配置诊断与修复工具 |
| `test-all.sh` | 维护 | 运行全量脚本与功能测试 |
| `create-webui-package-json.js` | 维护(构建) | 在 dist/webui 写入 CommonJS package.json(build 自动调用) |
| `manage-versions.sh` | 发布链 | 列出/废弃/撤销 npm 版本 |
| `check-version-sync.sh` | 发布链 | 校验本地版本与 npm、Git 标签一致 |
| `create-release.sh` | 发布链 | 用 gh CLI 从 CHANGELOG 生成 GitHub Release |
| `create-releases-for-tags.sh` | 发布链 | 为既有标签批量补建 GitHub Release |
| `cleanup-github-tags.sh` | 发布链 | 只保留最新版本的 Git 标签 |
| `publish.sh` | 发布链 | 本地完成版本升级、测试、构建、npm 发布、推标签 |
| `publish-and-cleanup.sh` | 发布链 | 弃用旧 npm 版本 + 清理旧标签 + 推送当前版本 |
| `auto-deploy.sh` | 发布链 | 一键部署到服务器(native 或 docker 模式) |
| `add-github-topics.sh` | 发布链 | 用 gh CLI 为仓库添加 Topics(一次性) |

> "用户"指日常使用可直接运行;"维护"服务开发与安全检查;"发布链"通常只需维护者关注。

---

## 用户脚本

### pixiv.sh — 主控制入口

源码安装时的推荐入口。自动处理 Node/npm 环境检查、依赖安装与 TypeScript 编译;若全局装了 `pixivflow`,config/health 等高级命令会直接委托给全局 CLI,否则回退到本地构建的 `dist/index.js`。

```bash
./scripts/pixiv.sh <command>
# 或
npm run pixiv -- <command>
```

| 子命令 | 说明 |
| --- | --- |
| `setup` | 编译项目并启动 easy-setup.sh 配置向导 |
| `login` | 调用 CLI 登录 Pixiv 账号 |
| `run` | 启动定时下载器(内部调用 scheduler) |
| `once` | 立即执行一轮下载任务 |
| `test` | 快速测试:下载文件验证配置是否可用 |
| `random` | 随机选择热门标签下载一个作品 |
| `status` | 基于 sqlite3 输出下载数量与最近记录 |
| `stop` | 终止运行中的 scheduler 进程 |
| `logs` | 查看 data/pixiv-downloader.log |
| `check [--fix]` | 环境体检;`--fix` 自动修复缺失项并编译 |
| `build` / `clean` / `update\|fix` | 编译、清理产物、一键更新修复(update 调 update-and-fix.sh) |
| `config` / `health` / `monitor` / `maintain` | 委托给 CLI 对应命令 |
| `docker <cmd>` | 委托给 docker.sh |

```bash
./scripts/pixiv.sh check --fix   # 环境检查并自动修复
./scripts/pixiv.sh once          # 手动下载一次
./scripts/pixiv.sh update        # 更新代码并修复
```

何时用:克隆仓库后的本地开发与部署。已全局安装且不写代码的用户直接用 `pixivflow` 即可。

### login.sh — 登录

```bash
./scripts/login.sh                            # 交互式(默认,打开浏览器窗口)
./scripts/login.sh --headless -u foo -p bar   # 无头模式(需要账号密码)
npm run login                                 # npm 别名
export PIXIV_USERNAME=... PIXIV_PASSWORD=...  # 无头模式也可用环境变量
```

选项:`-i/--interactive`(默认)、`--headless`、`-u/--username`、`-p/--password`、`-c/--config <path>`、`-j/--json`。无头登录依赖 Python gppt(`install-python-deps.sh`)。令牌获取成功后存入凭据存储,后续下载不再需要浏览器。

### quick-start.sh 与 easy-setup.sh

```bash
bash scripts/quick-start.sh   # 环境→依赖→登录→配置→测试 一次走完
bash scripts/easy-setup.sh    # 仅三步交互向导,生成 config/standalone.config.json
```

首次使用选 quick-start;只想重新填配置选 easy-setup。两个脚本都只写仓库内 `config/standalone.config.json`,与 WebUI 无关。

### docker.sh — Docker 管理

```bash
./scripts/docker.sh setup     # 初始化环境(含示例配置创建)
./scripts/docker.sh deploy    # 构建镜像 + 启动服务
./scripts/docker.sh logs -f   # 跟踪日志
./scripts/docker.sh shell     # 进入容器 Shell
./scripts/docker.sh random --novel --limit 5
```

命令全集:`build`、`deploy`、`up/down/restart/status/logs/shell/exec`;管理类 `setup/login/test/random(rd)/check/clean/clean-all`。`random` 在容器内执行,token 或代理有问题时按脚本末尾提示排查。Docker 全流程参见 [DOCKER.md](./DOCKER.md)。

### download-ranking.sh — 排行榜下载

```bash
./scripts/download-ranking.sh --type illustration --limit 10
./scripts/download-ranking.sh --tag "風景" --mode week
./scripts/download-ranking.sh --tag "オリジナル" --date 2024-01-15 --limit 20 --type novel
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--type` | `illustration` | `illustration` 或 `novel` |
| `--mode` | `day` | `day/week/month/day_male/day_female/day_ai` |
| `--limit` | `10` | 下载数量 |
| `--tag` / `--date` | 空 | 筛选标签;排名日期(YYYY-MM-DD,默认今天) |
| `--config` | 空 | 自定义基础配置文件路径 |

### download-with-config.sh — 临时指定下载目标

不改配置文件,用一段 targets JSON 覆盖本轮下载:

```bash
./scripts/download-with-config.sh '{"targets":[{"type":"novel","tag":"アークナイツ","limit":5,"mode":"ranking"}]}'
./scripts/download-with-config.sh --file my-targets.json
```

脚本把传入 JSON 合并进基础配置生成临时文件,结束后自动删除(`mktemp` + trap 清理)。合并优先用 jq;没有 jq 时回退到 python3。传参接受完整 `targets` 数组或单个 target 对象(后者自动包装成数组)。

### 代理转发三件套(Docker 访问宿主机代理)

宿主机代理只监听 127.0.0.1 时,容器无法直连,需要转发:

```bash
node scripts/proxy-forwarder.js 6154 127.0.0.1:6152   # 监听端口 目标代理
./scripts/start-proxy-forwarder.sh                    # 封装版:检测网关 IP 并改写配置
./scripts/get-docker-gateway.sh                       # 单独输出网关 IP
```

转发启动后写入 /tmp/proxy-forwarder-6154.log 与 PID 文件;macOS 上 start-proxy-forwarder.sh 会把配置中的 proxy host 改成 `host.docker.internal`。配合容器内代理端口使用前先确认 docker-compose.yml 的 HTTP_PROXY 设置。

### 其余用户脚本

| 脚本 | 用法 | 何时用 |
| --- | --- | --- |
| `pixiv-cli.sh` | `./scripts/pixiv-cli.sh download` | 不需要环境体检包装时直连 CLI(dist 缺失会先 build) |
| `install-python-deps.sh` | `./scripts/install-python-deps.sh` | 无头登录前置:装 Python>=3.9 与 gppt |
| `update-and-fix.sh` | `./scripts/update-and-fix.sh`(同 `pixiv.sh update`) | 更新代码后自动备份 config/db 并修依赖、重新构建 |
| `docker-healthcheck.sh` | 由 Dockerfile HEALTHCHECK 自动执行 | 容器 Unhealthy 时可进容器手动跑它定位问题 |

---

## 维护/开发脚本

| 脚本 | 用法示例 | 作用 |
| --- | --- | --- |
| `check-sensitive-info.sh` | `./scripts/check-sensitive-info.sh` | 按敏感模式扫描配置、`.env*`、token 文件;发现真实凭据被 Git 跟踪即报错退出 |
| `verify-git-safety.sh` | `./scripts/verify-git-safety.sh` | 检查 .gitignore/pre-commit/.gitattributes 是否就位、敏感文件确被忽略,顺手修复钩子权限 |
| `analyze-complexity.js` | `npm run analyze:complexity` | 报告圈复杂度>10、函数>80 行、文件>500 行的位置 |
| `config-diagnostic.ts` | `npm run build && node dist/scripts/config-diagnostic.js --fix` | 校验/修复配置结构;支持 `--file --list --validate --info --repair --backup` |
| `test-all.sh` | `./scripts/test-all.sh` | 串起全部脚本级与功能级自检 |
| `create-webui-package-json.js` | 由 `npm run build` 自动调用 | 在 dist/webui 写入 CommonJS package.json,规避 ES 模块冲突 |

提交代码前至少跑前两项:敏感信息检查 + Git 安全检查是防泄漏闸门。

## CI/发布链脚本

供 npm/GitHub 维护者使用,完整流程见 [RELEASING.md](./RELEASING.md):

| 脚本 | 典型用法 | 作用 |
| --- | --- | --- |
| `publish.sh` | `./scripts/publish.sh patch`(可选 `minor/major/x.y.z`) | 完整发版:确认→测试→构建→升级版本号→提交→建标签→本地 npm publish→推送触发 Publish 工作流 |
| `create-release.sh` | `./scripts/create-release.sh [version]` | 从 CHANGELOG 提取对应章节,gh CLI 创建/更新 GitHub Release |
| `create-releases-for-tags.sh` | `./scripts/create-releases-for-tags.sh` | 为所有缺 Release 的远程标签批量补建 |
| `check-version-sync.sh` | `npm run check:version` | 比对 package.json、npm 已发版本与 Git 标签三者一致 |
| `manage-versions.sh` | `npm run versions:list` 等 | `list/deprecate/deprecate-old [N]/unpublish/unpublish-old [N]`,管理 npm 历史版本 |
| `cleanup-github-tags.sh` | `npm run tags:cleanup:dry-run` | 远程 v* 标签只保留 package.json 当前版本对应的一个;先 dry-run 预览再真删 |
| `publish-and-cleanup.sh` | `./scripts/publish-and-cleanup.sh` | 组合动作:弃用旧 npm 版本+清理旧标签+推送当前版本 |
| `auto-deploy.sh` | `./scripts/auto-deploy.sh production native` | 服务器部署向导(native 或 docker) |
| `add-github-topics.sh` | `./scripts/add-github-topics.sh` | gh CLI 补充仓库 topics(一次性) |

---

## npm scripts 别名

`package.json` 中映射到脚本的别名(CLI 命令别名见 [USAGE.md](./USAGE.md)):

| npm 别名 | 实际执行 |
| --- | --- |
| `npm run pixiv` | `./scripts/pixiv.sh` |
| `npm run pixiv:setup` / `run` / `once` / `test` / `status` | `./scripts/pixiv.sh` 对应子命令 |
| `npm run pixiv:health` | `./scripts/pixiv.sh health` |
| `npm run login` | `./scripts/login.sh` |
| `npm run analyze:complexity` | `node scripts/analyze-complexity.js` |
| `npm run release` / `release:create` | `./scripts/create-release.sh` |
| `npm run publish:patch/minor/major` | `./scripts/publish.sh patch/minor/major` |
| `npm run check:version` | `./scripts/check-version-sync.sh` |
| `npm run versions:list/deprecate/deprecate-old/unpublish/unpublish-old` 系列 | `./scripts/manage-versions.sh` 对应子命令 |
| `npm run tags:cleanup[:dry-run]` | `./scripts/cleanup-github-tags.sh [--dry-run]` |

带参数时注意两层转发,例如:`npm run pixiv -- check --fix`。日常高频操作建议直接用 `pixivflow` 命令或 `./scripts/pixiv.sh`。

---

## 相关文档

- [USAGE.md](./USAGE.md) — `pixivflow` 全部 CLI 命令详解
- [DOCKER.md](./DOCKER.md) — docker compose 部署与数据持久化
- [CONFIG.md](./CONFIG.md) — standalone.config.json 字段参考
- [QUICKSTART.md](./QUICKSTART.md) — 第一次跑通的完整流程
- [RELEASING.md](./RELEASING.md) — 发布链脚本的协作方式
