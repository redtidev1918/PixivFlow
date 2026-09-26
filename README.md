# PixivFlow

**语言 / Language:** 中文 · [English](README.en.md)

> **Pixiv 下载、筛选与自动收集工具。**

[完整文档](https://redtidev1918.github.io/PixivFlow/)

可以直接下载单个 Pixiv 作品（插画、小说、动图），也可以按标签、热度、日期和收藏数等条件批量筛选，并通过 scheduler 定时自动收集。结果既能永久保存在本地，也能按需通过 HTTP 可靠交付给其他服务——下游是可选的，PixivFlow 自己就能跑完「发现 → 筛选 → 下载 → 保存」的完整链路。

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

## 目录

- [典型场景](#典型场景)
- [快速开始](#快速开始)
- [筛选与下载目标](#筛选与下载目标)
- [本地留存与缓存交付](#本地留存与缓存交付)
- [自动化与可靠性](#自动化与可靠性)
- [常用命令](#常用命令)
- [部署](#部署)
- [文档](#文档)
- [相关项目](#相关项目)
- [问题反馈](#问题反馈)
- [致谢](#致谢)
- [许可证](#许可证)

## 典型场景

**1. 下载一个链接。** 直接粘贴任意 Pixiv 链接——插画、小说、系列、用户主页都能识别：

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
```

**2. 按条件批量下载。** 在配置里定义要收集什么（标签、榜单、发布日期、收藏数下限），
一次跑完；已下载的作品由 SQLite 记录并自动跳过，重复运行不会重复拉取。
见[筛选与下载目标](#筛选与下载目标)。

**3. 定时自动收集并交付。** 用 cron 长期挂机：定时发现、下载，再按需把内容投递给
其他服务——对方确认收到后才删除本地副本。

```text
Pixiv ──► PixivFlow ──┬──► 本地永久保存（persistent）
                      └──► HTTP 交付（cache）──► TelePost / 其他兼容服务
```

## 快速开始

需要 Node.js 22.13 或更高版本；生产环境请使用仍受支持的 LTS。

```bash
npm install -g pixivflow
pixivflow --help
```

登录 Pixiv 账号（生成 OAuth 凭据，只需一次）：

```bash
pixivflow login                 # 本机有浏览器
pixivflow login-headless        # 无图形界面的服务器
```

下载一个作品——直接粘贴任意 Pixiv 链接（插画、小说、系列、用户主页均可识别）：

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
```

按配置批量下载并启动定时任务：

```bash
pixivflow download
pixivflow scheduler             # 按 cron 配置长期挂机自动收集
```

不想手写配置？运行交互式向导 `pixivflow setup` 一步步生成。图形界面用
`pixivflow web`（前端见 [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui)）。

下载 Pixiv 动图（ugoira）还需要 `python3` 和 `ffmpeg`：程序按逐帧延迟合成循环 GIF，
可直接作为动画交付给下游。官方 Docker 镜像已包含两者，详见
[配置说明](docs/CONFIG.md#pixiv-动图ugoira)。

从源码构建：

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
```

Termux / Android 环境见 [TERMUX_INSTALL.md](docs/TERMUX_INSTALL.md)。

## 筛选与下载目标

在配置文件的 `targets` 中定义要收集的内容，多个条件可以组合：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `type` | 内容类型：`illustration` 或 `novel` | `illustration` |
| `tag` | 搜索标签，支持多标签 OR | `"風景"` / `["水彩","厚涂"]` |
| `limit` | 单次下载数量上限 | `20` |
| `minBookmarks` | 最低收藏数 | `500` |
| `startDate` / `endDate` | 发布日期范围 | `"2025-01-01"` |

已下载的作品由 SQLite 数据库记录并自动跳过；文件存在但缺少记录时会自动补齐，
两者互不冲突。`mode: "topic"` 的插画任务会保留一个有界热度候选池：同一发布日期
重复执行时若第一名已经下载，会按热度自动递补下一部未下载作品，而不是空跑。

## 本地留存与缓存交付

每个 target（一个 tag / 计划）有两种保存方式：

- **`persistent`（默认）**：下载后永久留在本地。
- **`cache`**：下载后投给一个「交付目标」（比如投稿机器人），对方确认收到后才删本地文件，省磁盘。

「交付目标」就是一段配置：告诉 PixivFlow 把文件 POST 到哪个地址、带哪些字段。
它不绑定具体服务，可指向任意兼容的 HTTP 接口；
[TelePost](https://github.com/redtidev1918/TelePost) 与
[telepress](https://github.com/redtidev1918/TelePress) 只是示例下游。示例：

```json
{
  "delivery": {
    "outboxRetryBaseMs": 300000,
    "outboxRetryMaxMs": 21600000,
    "targets": {
      "sharing-api": {
        "type": "httpMultipart",
        "url": "https://your-domain.example/api/bot1/v1/submissions",
        "readinessUrl": "https://your-domain.example/ready",
        "notificationUrl": "https://your-domain.example/api/bot1/v1/notifications",
        "headers": { "Authorization": "Bearer ${SHARING_TOKEN}" },
        "fileField": "files",
        "fields": { "title": "{{title}}" },
        "success": { "statuses": [201], "jsonPath": "ok", "equals": true },
        "arrayFormat": "comma",
        "maxAttempts": 3,
        "retryDelayMs": 2000
      }
    },
    "deleteAfterDelivery": true
  },
  "targets": [
    { "type": "illustration", "tag": "收藏", "storageMode": "persistent" },
    {
      "type": "illustration",
      "tag": "更新",
      "storageMode": "cache",
      "delivery": {
        "target": "sharing-api",
        "fields": { "tags": ["公告", "更新"], "anonymous": false }
      }
    }
  ]
}
```

`headers`、`url` 和 `readinessUrl` 里可用 `${环境变量名}` 引用环境变量（Token 别写死进配置）。
插画 cache 投递会在 multipart 的 `previews` 字段携带 Pixiv 的低分辨率预览（与 `files`
一一对应），原图仍是权威素材；通用接收端可以忽略该可选字段。

运维通知可直接把 `notificationUrl` 指向 [Apprise API](docs/APPRISE.md)，由 Apprise 统一发送
Email、Telegram、Discord、ntfy 等渠道；PixivFlow 不实现这些通知协议。

- 上面的 `url` 指向任意兼容的 HTTP 投稿接口；示例里用的是 TelePost 的
  `/api/botN/v1/submissions`（把 `/gen_token` 得到的 `tp_...` 放进 `SHARING_TOKEN` 即可，
  这是示例服务自己的鉴权方式）。
- 同一目标也可指向 [telepress](https://github.com/redtidev1918/TelePress) 的 `/publish/gallery`，
  把插画自动发布成 Telegra.ph 相册，见 [CONFIG.md](docs/CONFIG.md) 的
  「Telegraph（telegra.ph）相册上传」。

## 自动化与可靠性

### 单进程多计划与配置热重载

`schedules[]` 可以为不同 target 组设置各自的 Cron。所有计划由一个 Node
进程托管，共享 Pixiv 客户端、SQLite 与文件服务；执行阶段使用有界串行队列，
适合 512 MiB 小内存机器（实测：`topic` 发现/采集/下载全程在 256 MB cgroup 限制下
稳定运行，峰值 RSS ≈ 106 MB、heapUsed ≈ 33 MB，无 OOM，见 [DOCKER.md](docs/DOCKER.md)）。
配置文件默认被监听，SSH/同步工具替换文件后会先完整校验，再一次性替换全部调度项；
无效 JSON、错误 Cron 或未知 target id 不会破坏当前运行中的计划。正在执行的任务
继续使用旧快照，下一次任务使用新快照。

```json
{
  "scheduler": { "enabled": false, "cron": "0 3 * * *" },
  "schedules": [
    { "id": "bot1", "enabled": true, "cron": "10 5 * * *", "targetIds": ["bot1-art", "bot1-novel"] },
    { "id": "bot2", "enabled": true, "cron": "30 5 * * *", "targetIds": ["bot2-art", "bot2-novel"] }
  ],
  "targets": [
    { "id": "bot1-art", "type": "illustration", "mode": "ranking", "rankingDate": "YESTERDAY" },
    { "id": "bot1-novel", "type": "novel", "mode": "ranking", "rankingDate": "YESTERDAY" }
  ]
}
```

旧的单 `scheduler` 配置继续兼容。`pixiv`、`network`、`storage` 涉及长生命周期
连接或路径，修改后需要重启；`schedules`、`targets`、`delivery`、`download` 可以
热重载。完整双 Bot 缓存投递模板见
[`config/fly-two-bots.example.json`](config/fly-two-bots.example.json)。

### 投递事务发件箱（Outbox）

投递和通知都先写入 SQLite 发件箱（outbox），再由后台 worker 泵送：对外副作用
（一次内容投递、一条通知）在 `outbox` 表各占一行，带幂等键和行级租约，保证
至少一次执行、最终只产生一次可见效果。

- 失败会自动重试：指数退避（默认 5 分钟起步、最长 6 小时）。
- 超过 `maxAttempts` 进入 `dead` 状态，可用 `pixivflow outbox` 查看和重试。
- 进程崩溃/重启后，残留的 `processing` 租约过期后会被新进程接管，重复发送同一个
  幂等意图；下游按幂等键收敛，不会在频道里出现重复消息。
- 旧的文件型 `delivery-outbox/*.json` 会在启动时自动一次性迁移进 SQLite（迁移幂等）。
- 「今天没有可投稿内容」这类通知与内容投递走同一张表、独立泵送，互不阻塞。
- **多平台投递（fan-out）**：`targets[].delivery.targets` 可以声明多个交付目标，同一个
  作品会为每个平台各写一条独立意图 + 独立 outbox 行。一个平台失败不影响其他平台，也
  不影响下载本身；重试只重发尚未确认的那个平台。`delivery.target`（单值）仍然可用，
  数组优先；两者都缺省时不投递，行为与历史版本一致。详见
  [投递运行时架构](docs/architecture/delivery-runtime.md)。
- **通用消息网关（`type: "webhook"`）**：PixivFlow 只做 **Messaging Gateway Client**——
  把一份平台无关的统一消息 JSON POST 给一个已有的消息网关（TelePost / AstrBot /
  Hermes / 自建服务），网关自己负责 QQ、微信、Telegram、Discord、飞书的登录与协议。
  PixivFlow **不实现任何平台协议、不生成配对二维码、不保存平台登录信息**。可选 HMAC
  签名与 `base64` 内联媒体。WebUI 的 `GET /api/gateways` 提供只读的网关与投递历史投影
  （endpoint 脱敏，`pairingSupported: false`）。运维侧有两条只读/可控命令：
  `pixivflow gateway list|status|test`（列出路由、看单条路由的账本 + outbox 状态、
  探测端点是否应答——**端点应答不等于投递成功**）与 `pixivflow delivery status|retry`
  （`retry` 默认只预览，需 `--yes`，且只重开仍欠投递的路由，已投递的绝不重发）。详见
  [投递运行时架构 §5.1/§7](docs/architecture/delivery-runtime.md) 与
  [配置说明](docs/CONFIG.md)。WebUI 另有只读的投递历史投影
  `GET /api/deliveries`（跨路由账本 + `outboxStatus`）与 `GET /api/deliveries/:id`
  （单条意图 + 事件轨迹）；**WebUI 里没有重试按钮**——人工重试是 CLI 的审计动作。想把作品投递到 QQ/飞书/自建服务，见 [外部网关投递指南](docs/GATEWAY.md)（统一消息 JSON、HMAC 验签、ACK 契约、OneBot 网关侧模式）。
  网关若自己提供配对端点，可用 `pairingUrl` 让 `GET /api/gateways/:name/pairing` 透传渲染
  （PixivFlow 不生成二维码、不存登录信息）。

配置 `readinessUrl` 后，worker 每次认领都会先检查依赖 `/ready`；非 2xx 只把 row
放回 pending，不增加 attempt。dead letter 通过正式 CLI 管理：

```bash
pixivflow outbox list --status dead
pixivflow outbox inspect <id>
pixivflow outbox retry <id>   # 只重试 dead row，保留幂等键
pixivflow outbox retry --dead
pixivflow outbox cancel <id>  # 只取消尚未执行的 row
```

`run-once` 会重新执行下载计划，不等价于 outbox replay，不要手动改 SQLite 的
`next_attempt_at`。长期体检与收敛用 `pixivflow doctor`（卡住的 slot/outbox
租约、pending 投递、dead 行，`--repair` 收敛）与 `pixivflow reconcile`
（把下游已确认的历史重复登记进投递账本，默认 dry-run）。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pixivflow download` | 按配置执行下载 |
| `pixivflow download --url <url>` | 通过 URL 直接下载 |
| `pixivflow random` | 随机下载热门作品 |
| `pixivflow scheduler` | 启动定时任务 |
| `pixivflow web` | 启动 WebUI |
| `pixivflow config` | 配置管理（查看 / 编辑 / 备份 / 恢复） |
| `pixivflow status` | 下载统计与最近记录 |
| `pixivflow health` | 健康检查：配置、目录可写性、连通性 |
| `pixivflow doctor` | 可靠性体检：卡住的 slot/outbox 租约、pending 投递、dead 行；`--repair` 收敛 |
| `pixivflow reconcile` | 把下游已确认的历史重复登记进投递账本（默认 dry-run，`--repair` 落库） |
| `pixivflow outbox` | 列出、检查、重放 dead letter 或取消尚未执行的 durable intent |
| `pixivflow tags discover <词>` | 发现相关 Tag（Pixiv 联想 + 作品标签共现），只列候选不改配置 |
| `pixivflow tags apply <清单> --target <id> --select <tag1,tag2>` | 人工确认后把所选 Tag 原子写入配置并触发热重载 |
| `pixivflow topic resolve <主题>` | 查看自动推导出的相关 Tag 空间（`--type illustration\|novel`、`--refresh`） |
| `pixivflow topic test <主题> --date YESTERDAY` | dry-run 预览某天的候选与 Top N，不下载 |

`tags discover` 会调用 Pixiv 标签联想接口，并抽样最近插画 / 小说统计共同出现的标签，结果缓存 7 天；它**不会**改动任何下载计划。确认候选后用 `tags apply` 显式选择，应用前会整份校验配置、自动备份并原子替换，运行中的 scheduler 经配置热重载生效。

其他用法见 [USAGE.md](docs/USAGE.md)；从 v1 升级到 v2 见 [迁移指南](docs/MIGRATION.md)。

## 部署

- **Docker / 服务器长期挂机**：见 [DOCKER.md](docs/DOCKER.md)。
- **Android / Termux**：见 [TERMUX_INSTALL.md](docs/TERMUX_INSTALL.md)。
- **与 TelePost 组合部署**：PixivFlow 与 TelePost 都可以独立使用；只有当你希望把两者
  组合成一套完整工作流时，才需要
  [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy)
  这个部署与运维套件。

## 文档

完整教程站点：[教程站点](https://redtidev1918.github.io/PixivFlow/)

| 文档 | 说明 |
| --- | --- |
| [📥 下载](docs/download.md) | 各平台安装包、npm 与 Docker 获取方式 |
| [QUICKSTART](docs/QUICKSTART.md) | 三分钟上手 |
| [CONFIG](docs/CONFIG.md) | 全部配置项说明 |
| [USAGE](docs/USAGE.md) | 功能详解 |
| [LOGIN](docs/LOGIN.md) | 账号登录相关 |
| [DOCKER](docs/DOCKER.md) | 容器化部署方案 |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 架构与技术实现 |
| [MIGRATION](docs/MIGRATION.md) | 从 v1 升级到 v2 |
| [RELEASING](docs/RELEASING.md) | npm 发版流程 |
| [CHANGELOG](CHANGELOG.md) | 版本更新日志 |
| [ACKNOWLEDGMENTS](docs/ACKNOWLEDGMENTS.md) | 参考与致谢:灵感来源、核心依赖与规范声明 |

English version: [README.en.md](README.en.md).

## 相关项目

PixivFlow 可以完全独立使用。下面是同一作者生态里与它相关的项目，以及各自负责什么：

| 项目 | 是什么 | 什么时候需要 |
| --- | --- | --- |
| [TelePost](https://github.com/redtidev1918/TelePost) | Telegram 频道投稿、审核与自动化发布平台 | 想把下载结果投进 Telegram 频道、先人工审核再发布时，把它配成 delivery 下游即可。这只是可选组合，PixivFlow 不依赖它 |
| [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy) | PixivFlow + TelePost 的部署与运维套件（Docker / VPS / 云平台） | 想一次性把上面两个项目部署并运维起来时。只跑 PixivFlow 不需要它 |
| [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) | PixivFlow 的 WebUI 前端 | 想用图形界面管理下载与计划 |
| [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) | PKCE OAuth 登录库与 CLI（`ptg`） | PixivFlow 的登录依赖；也可以单独用于获取 Pixiv token |

## 问题反馈

Bug 与功能建议请提交到
[Issues](https://github.com/redtidev1918/PixivFlow/issues)，
提交前建议先运行 `pixivflow health` 并附上输出（注意删除 token 等敏感信息，
配置文件中包含认证信息，请勿直接分享）。安全漏洞的处理方式见
[SECURITY.md](SECURITY.md)。

## 致谢

- [gallery-dl](https://github.com/mikf/gallery-dl) —— ugoira 与小说正文的实现参考
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) —— App API 端点语义
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) —— OAuth 登录流程参考
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) —— 登录库
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) —— WebUI 前端

本项目与 Pixiv Inc. 无关联。完整声明见 [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md)。

## 许可证

[MIT](LICENSE)
