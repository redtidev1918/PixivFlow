# PixivFlow 生态 Platform Contract

> 状态: **DRAFT (Phase 0)** — 文档落盘先行，实施按阶段 PR 逐步推进。
> 定位: 全生态跨仓库的权威契约文档。定义稳定边界（API / 配置 / 数据 / 内容 / 依赖发布 / 桌面），让独立仓库集演进为稳定、可插拔、向后兼容的平台。
> 拥有方: PixivFlow（本仓）为 API / 配置 / 数据边界契约正文；`pixivflow-telepost-deploy` 侧拥有「部署/生产契约」视图（`deployment-contract`、矩阵、SI 不变量、六位一致性）。二者引用互补、不冲突。

---

## 0. 兼容铁律（每个变更必须回答 5 问）

任何契约变更落地时，实现 PR 必须逐条回答：

1. **旧用户能否启动？**（既有 config/DB/CLI 是否仍可用，是否自举回填）
2. **Docker 是否受影响？**（compose/worker-sleep 默认、镜像、entry 是否仍可跑）
3. **WebUI 是否仍连？**（`/api`+`/socket.io` 同源契约是否不变）
4. **TelePost 是否仍对接？**（`/api/botN/v1/submissions`、refetch/recover、webhook 归属是否不变）
5. **是否触发数据迁移？**（若触发，必须「原位增补 + 绝不删库重建」）

不满足即不得合入。渐进式、增补式、向后兼容优先；严禁破坏既有 releasegraph 钉 SHA 工作流与生产部署。

---

## 1. 当前生态真实架构（现状基准）

| 组件 | 技术 / 版本 | 平面角色 | 对外 HTTP | 状态存储 | 配置 | 版本机制 |
|---|---|---|---|---|---|---|
| **PixivFlow** `redtidev1918/PixivFlow` | Node/TS + Express + Socket.IO + node:sqlite，**2.46.0**（HEAD `84078e3`） | 执行平面：抓取/调度/下载/交付 outbox；**不触碰 Telegram 凭据**（SI-1） | WebUI :3000 — 健康 `*/api/health,/health`；运行时契约 `*/api/status,/status,/api/version,/version`（P1 已落地，免认证）；`/api/auth(5)/config(16)/download(17)/stats(4)/logs(2)/files(4)/scheduler(5)/admin/*`；Socket.IO 日志流+下载状态。时钟面 :8090 —— `GET /health`、`/internal/schedules`、`POST /internal/schedules/:id/run`、`POST /internal/targets/:id/refetch`、`GET/POST recover`、`POST /internal/outbox/drain`（bearer `SCHEDULER_TRIGGER_TOKEN` / refetch 用 `PIXIVFLOW_REFETCH_TOKEN`，缺失 fail-closed；202/202/200/503） | SQLite `./data/pixiv-downloader.db`（16 表：`schedule_slots` 槽账本、`schedule_slot_items` 幂等 cell、`deliveries`、`outbox` 持久事务、`tokens`、`config_history`…，WAL） | **无 `schemaVersion`**；缺失即自举 `generateDefaultConfig` | **无 DB 版本/迁移框架**——`DatabaseMigration` 纯声明式幂等（建表+列探测 ALTER） |
| **pixivflow-webui** | React/TS + vite(`base ./`) **1.1.0** | WebUI 控制平面消费端 | 消费同源 `/api/*`(约 52) + `/socket.io` | localStorage `auth-storage` | — | 容器发布；**无后端版本锁**（能力图目标） |
| **pixiv-token-getter** | Node CJS **2.6.1**，node≥22.12 | 认证（登录期 token 获取） | 库 API：`getToken/resolveToken/login/refreshToken/status/logout/importGppt` + `onEvent(cache_hit/refreshed/refresh_failed…)`；宿主注入 `tokenStore`；错误按 `error.code` 分支（`REFRESH_ERROR` 等） | `tokens/<profile>.token.json`(0600) | env / profile | 无 store 版本迁移（仅路径迁移 `paths.migrateLegacyBrowserProfile`） |
| **TelePost** `redtidev1918/TelePost` | Python/aiohttp + python-telegram-bot 21.10 + aiosqlite，**2.67.0**（`3c7a58b`） | 业务/发布平面：**唯一 Telegram 凭据持有者**（SI-2）、唯一可推送频道 | :8080 — `GET /health,/live,/ready,/version,/status`；`/api/botN/*`→子进程 `/api/v1/*`（**投稿 `POST /api/botN/v1/submissions`**，`idempotency_key` 幂等，510MiB 上限）；`/webhook/botN`（webhook 属主=TelePost）；`/internal/*`→PixivFlow :8090（同机反代） | 每 bot SQLite `submissions.db`(20+ 表)；`runtime-policy.json`（CHANNEL/REVIEW/各 REVIEW_REQUIRED） | config.ini + env（BOTn_TOKEN…，生产 env 优先） | **无正式迁移**：`CREATE IF NOT EXISTS`+幂等 ALTER+手跑 `migrate_*.py` |
| **releasegraph** | Go 单二进制 | 发布事务权威 | — | 各仓 `.release-policy.yml`（自发布） | | `dependsOn` **仅编排、不开下游升级 PR** |
| **pixivflow-telepost-deploy** | Go CLI `deploy` **1.13.0** | 部署/分发权威 | — | `deployment.manifest.json`（**拓扑**清单，非版本锁）；PIXIVFLOW_REF=40 位 commit、PIXIVFLOW_VERSION；TELEPOST_IMAGE=发布标签 | 预置矩阵 + SI-1..7 | 双外部时钟（cron-job.org PRIMARY + Cloudflare 工控 plane SECONDARY，+2min 偏差）；`verify-images` 六位一致性 |
| 支撑 | telepress==0.14.1（Telegraph 阅读页）/ pixiv-media-proxy（CF worker i.pximg.net 放行） | 预览/图床 provider | — | — | — | — |

**生产验证唯一拓扑**：`split-worker`（`productionProven=true`）；`single-host` stable 未生产证明；`remote-worker` beta；`single-machine-worker-sleep` **experimental 不可部署**。生产钉：PixivFlow 2.46.0 / commit `326b8c0`；TelePost 2.67.0。

**当前发布链路**：各业务仓自带 `.release-policy.yml` → releasegraph（`reusable-release.yml` 钉 SHA）推送发布；PixivFlow npm+ghcr+GitHub tgz；webui 仅 ghcr 容器；TelePost git tag+ghcr+PyInstaller 二进制；deploy 仓滚参不发布组件。**端到端自动化缺环**：releasegraph `dependsOn` 不触发下游依赖升级 PR。

---

## 2. 现有问题清单（平台级）

1. **配置无版本、数据库无迁移框架**（核心基建缺口）：PixivFlow 与 TelePost 都靠「列/键存在即跳过」的声明式幂等约定；无 `schemaVersion`、无 `PRAGMA user_version`、无 migration 账本 → 跨仓库、跨 release 的安全 schema/config 演进不可追溯。
2. **版本钉散落且不一致**：compose/worker-sleep 默认 ARG 漂移（`2.12.0`/`2.64.2` vs 生产 `2.46.0`/`2.67.0`）；`.env.example` 过期（`2.15.0/2.12.0`）；`worker-sleep:latest`、`caddy:2-alpine`、基础镜像 `node:24/golang:1.22/python:3.12` 浮动；`deploy.go:591` `:latest` 回退与 systemd `npm @latest` 为高风险。生产主链路版本确已锁死，风险集中在 compose/worker-sleep 默认与回退分支。
3. **无结构化组件依赖/版本锁图**：releasegraph 侧全仓无 `provides/requires`；webui 无后端能力锁；`pixivflow-desktop` 未入 fleet。
4. **Token 双轨分裂**：登录期走 pixiv-token-getter；PixivFlow 运行期在 `PixivAuth.ts` 自持 clientId 自行刷新（refresh token 存 `.pixiv-refresh-token`），不经本库。无统一 Account 契约。
5. **备份无工具**：deploy 备份只有契约，无 `deploy backup` 子命令/快照工具。
6. **文档漂移**：PixivFlow `src/version.ts` 2.17.0 过期（vs package 2.46.0）、`.nvmrc=18`（engines 22.13）、`actions/checkout@v7` 浮动；deploy `.env.example` 过期。
7. **无端到端自动升级**：releasegraph `dependsOn` 仅编排；desktop 自动更新需 hook releasegraph postRelease/dispatch workflow_call，**不可** hook `release:published` webhook（GITHUB_TOKEN 发布不触发）。

---

## 3. 长期目标架构

把「独立仓库集」演进为稳定可插拔平台：单份 Platform Contract 为跨仓库权威，定义稳定边界 + 一条轻量依赖编排 + 桌面接入层。全部向后兼容、渐进、不破坏生产。

```
        [时钟] cron-job.org(PRIMARY) + Cloudflare 工控(SECONDARY)
              │ POST /internal/schedules/{id}/run (bearer, 幂等)
   ┌──────────▼─────────┐   POST /api/botN/v1/submissions (idempotency_key)
   │   PixivFlow 执行    │────────────────────────────────► TelePost 业务/发布 ──► Telegram
   │ exec plane /16 表   │ ◄── refetch / recover ─────────┐  (唯一 Telegram 凭据)
   └──┬────────▲─────────┘                               │      ▲
      │        │ /internal/* 同机反代                    │ WebUI(52 REST+/socket.io)
   WebUI(同源 /api+/socket.io)   pixiv-token-getter(登录期) │  Desktop(Tauri 读锁)
   └────────────── 单一 Platform Contract：Runtime│Config│Data│Content│Dependency│Desktop 边界
```

**五原语集合**（对 releasegraph/deploy 之上叠加，非改造）：① Runtime Contract（P1 已落地）；② Deployment Contract（deploy 仓已自带）；③ Config Contract（`schemaVersion`+迁移，新增）；④ Data/Storage Contract（DB 版本化迁移，新增）；⑤ Dependency/Release Contract（`provides/requires` + fleet 版本锁 + upgrade-PR，新增）；⑥ Content Contract（五平面内容模型，固化）；⑦ Desktop Contract（接口）。

---

## 4. 契约正文

### 4.1 Runtime Contract（✅ P1 已实现并推送 `b2e267f`）
- `GET /api/status` `/status` → `{schemaVersion:1, state:'ok', pid, startedAt, uptimeSec, version}`
- `GET /api/version` `/version` → `{schemaVersion:1, name:'pixivflow', version}`
- version/name 权威源 = `package.json`（启动时读取，`runtime-meta.ts`），**非**生成的 `src/version.ts`（可漂移）。
- 载荷刻意非敏感；四路径与 `/api/health` 同入 basic-auth 免认证集。
- 消费方：Desktop Shell（探活/生命周期）、webui、外部监控；deploy 的 smoke/verify 脚本。
- 兼容：全部 5 问 = 是/否改动/是/是/否（纯增补，无 DB/config 变更）。

### 4.2 Deployment Contract（deploy 仓已自带，声明在此确保权威一致）
- 权威：`pixivflow-telepost-deploy` 的 `deployment-manifest`（**拓扑**清单）、预置矩阵、SI-1..7、`verify-images` 六位一致性（merged code / release / artifact / image tag+digest / Deploy pin / fly toml pin）。
- 硬规则：生产镜像仅两类钉——TelePost=发布标签（TELEPOST_IMAGE）、PixivFlow=40 位 commit（PIXIVFLOW_REF）；`PIXIVFLOW_REVISION=${PIXIVFLOW_VERSION}+${PIXIVFLOW_REF}` 为字面量构建参；**永不分支/浮动标签**；`latest` 仅首试，落库须不可变钉。
- 本契约不重复正文，仅锚定「部署契约权威在 deploy 仓」这条边界。

### 4.3 Config Contract（新增，Phase P2）
- 目标：PixivFlow 配置顶层增加 `schemaVersion`；loader 在版本不匹配时走 `config-migrate`（**增补式**：保留未知键、回写 `config_history`、绝不破坏性删除）。
- 规则：旧配置无版本字段 = legacy，回填默认并盖当前 `schemaVersion`，写入历史；`generateDefaultConfig` 自举继续生效。
- 同步：deploy 仓清理 `.env.example` 过期钉（`2.15.0/2.12.0`）与 compose/worker-sleep 默认 ARG 漂移，落到不可变值。
- 兼容（P2）：旧用户启动=是；docker=否改动；webui=是（端点不变）；telepost=否；数据迁移=否（仅配置回写）。

### 4.4 Data/Storage Contract（新增，Phase P3）
- 目标：引入版本化迁移账本（`PRAGMA user_version` 或 migration 表），把 PixivFlow / TelePost 现行的「声明式幂等自举」固化为**种子迁移**，既有库存位升级。
- 铁律：**原位增补，绝不删库重建**；迁移幂等；WAL 行为不变。
- TelePost：把 `migrate_*.py` 手跑脚本收编为账本步骤（保持脚本清单，仅加版本记录）。
- pixiv-token-getter：补 token store 格式版本迁移。
- 兼容（P3）：旧用户启动=是；docker=是（重构建时执行种子迁移）；webui=是；telepost=是（端点不变）；数据迁移=原位增补式。

### 4.5 Content Contract（Phase P4，主要固化文档 + 类型化接口）
- 五平面内容模型：`Work → MediaAsset → Artifact → DeliveryVariant`。
- 硬不变量：**`MediaAsset != Local File`**（TelePost 已有 `media_asset_refs`，PixivFlow `pixiv_metadata`/`candidate_inventory` 承接）。
- 外部图床（Catbox/Telegra.ph→412/400，P0）与 telepress 均为 **provider**，非领域实体；Rich Novel 本地 TXT/ZIP/MD，不依赖外部图床。
- 兼容：纯文档 + 增补类型，无数据迁移。

### 4.6 Dependency/Release Contract（新增，Phase P5）
- releasegraph：各仓 `.release-policy.yml` 补 `provides:` / `requires:` 空白串（非冲突）；不动既有 `reusable-release.yml` 钉 SHA、branch-contract、release 工作流。
- fleet 版本锁清单：从 `pixivflow-desktop/desktop-manifest.json`（`{"components":{"pixivflow":"2.46.0","pixivflow-webui":"1.1.0"}}`）扩展为多消费方可读的版本锁 = 目标状态；deploy 的钉 = 生产权威（两者并存，锁做期望、钉做事实）。
- 轻量下游升级护栏原语：provider 发布 → 向依赖仓 dispatch `workflow_call` 升级工作流 → bump 锁 + 开 **merge-queue 升级 PR** → `verify-images` 六位一致 → **人工 `deploy` 才推进生产**。绝不自动发布/自动合并未测试版本；绝不自动改生产拓扑。
- desktop 自动更新经 Tauri updater 读 GitHub Releases；触发源 = releasegraph postRelease/dispatch workflow_call，**非** `release:published` webhook。

### 4.7 Desktop Contract（Phase P6，接口优先、零实现正文）
- Desktop Shell 消费 4.1 Runtime Contract 探活并管理后端生命周期（start/stop/restart/healthCheck）。
- 读 `desktop-manifest.json` 版本锁；锁由下游升级 PR 驱动 bump。
- 自动更新经 Tauri updater 读 GitHub Releases（无自建 updater）。
- **desktop 在升级流程跑通前不入 fleet**（维持 F6 延后）。

**宿主集成事实（F4.1 实测，任何桌面 / 启动器实现方都必须遵守）**：

- **必须设 CWD**：存储路径**不能**靠环境变量注入——`src/utils/config-path-migrator/auto-fix.ts` 会把 `process.cwd()` 之外的绝对路径改回默认 `./data`、`./downloads`。宿主应把后端 CWD 设为用户数据根（如 `app_local_data_dir()/pixivflow`），让后端自身的相对默认值落位，`config/`、`data/`、`downloads/` 随 CWD 归位。
- **环境契约只有 `PORT` / `HOST` / `STATIC_PATH`**；宿主不注入、不解析任何业务配置。
- **不要用 `--version` 探活版本**：入口是服务进程，探测会真的把服务起起来；版本以发布清单或 `/api/version` 为准。
- **探活**用 4.1 的免认证路径 `GET /api/health`（期望 `200`）。
- **静态面（方案 A）**：宿主把 WebUI 构建产物以 `STATIC_PATH` 交给后端同源托管，宿主窗口只加载 `http://127.0.0.1:{port}/`；不复制 webui 源码、不做第二套前端。
- **重入语义**：宿主崩溃 / 强退不会执行 stop，下次启动应「先探活再接管（adopt）」，而不是把「端口被占」当作致命错误。
- 运行时清单 `runtime-manifest.json`（`version` / `platform` / `command[]` / `args[]` / `health` / `staticPath` / `servesWebui`）是**下游自有格式**，本仓库只提供发布产物，不消费它。

---

## 5. 分阶段路线图

| Phase | 主题 | 产物 | 兼容 5 问 | 生产推进 |
|---|---|---|---|---|
| P0（本阶段，✅） | 契约落盘 | 本 `docs/platform-contract.md` + Desktop F0 + Phase-1 审计入库 | 零代码 | — |
| P1（✅） | Runtime Contract | `/api/status` `/api/version`（`b2e267f`） | 全过 | — |
| P2 | Config Contract | `schemaVersion`+migration + deploy 默认钉清理 | 见 4.3 | — |
| P3 | Data Contract | PixivFlow/TelePost 版本化迁移账本 + token-getter store 版本 | 见 4.4 | — |
| P4 | Content Contract | 五平面模型 + 类型化接口 | 见 4.5 | — |
| P5 | Dependency/Release | `provides/requires` + fleet 锁 + upgrade-PR | 纯增补，无迁移 | 需人工 `deploy` |
| P6 | Desktop 接入 | Desktop 入 fleet（升级流程跑通后） | — | 需人工确认部署 |

每个 P 阶段内：先最小设计 + 逐项兼容确认 → 再实现；实现 PR 必须附 5 问答案。

---

## 6. 开放问题 / 已知未决
- `docs/platform-contract.md` 落点已定 PixivFlow（本仓）；若后期需 meta 文档仓可平移（保留链接）。
- P2 是否对 TelePost `config.ini`/`runtime-policy.json` 同步加策略版本（当前仅 PixivFlow config，TelePost 策略延后评估）。
- deploy 仓仍无备份工具（Backup Contract 只有契约正文）——属 deploy 仓待办，不在本契约代码范围。
- 外部图床 P0 阻塞项（Catbox/Telegra.ph）不阻塞本契约，另走 Media Architecture 待办。

---

*本契约随各 P 阶段实现而演进；每次演进须在对应 PR 记录本契约修订与被推翻旧条。*