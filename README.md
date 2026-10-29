# PixivFlow

语言 / Language：中文 · [English](README.en.md)

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

PixivFlow 是一个开源的 Pixiv 命令行下载工具，支持插画、漫画、动图和小说下载，也支持按标签、排行榜等条件批量收集作品，以及定时自动执行。下载的文件保存在你自己的电脑或服务器上。

[安装](#安装) · [快速开始](#快速开始) · [核心功能](#核心功能) · [批量下载](#批量下载) · [定时下载](#定时下载) · [WebUI](#webui) · [常见问题](#常见问题) · [完整文档](https://redtidev1918.github.io/PixivFlow/)

## 安装

```bash
npm install -g pixivflow
```

要求 Node.js 22.13 或更新版本（npm 9+）。使用前需要一个 Pixiv 账号，并且当前网络能访问 Pixiv，部分网络环境需要设置代理。交互式登录会打开本机的 Chrome / Chromium。

安装后运行 `pixivflow --help` 能看到帮助信息，说明命令已经可用。

## 快速开始

```bash
pixivflow login
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
pixivflow dirs
```

- `login`：打开浏览器登录 Pixiv。凭据保存在本地，之后的命令会自动使用。
- `download --url "<作品链接>"`：下载单个作品。插画、漫画、动图、小说、小说系列和作者主页链接都可以。
- `dirs`：显示实际使用的配置文件、数据库和下载目录。

> **注意凭据保护。** `login` / `login-headless` / `refresh` 不会在终端打印访问令牌或刷新令牌（`--json` 输出同样不含凭据），凭据只写入所选配置文件——请像保护密码一样保护该配置文件。分享终端输出、日志或截图前仍建议先检查是否含敏感信息。

服务器登录和使用已有令牌的方式见 [登录指南](docs/LOGIN.md)，`--url` 支持的链接格式见 [使用指南](docs/USAGE.md)。

## 核心功能

| 功能 | 说明 |
| --- | --- |
| URL 下载 | 粘贴作品、小说、系列或作者主页链接即可下载 |
| 批量下载 | 按标签、榜单、发布日期、收藏数等条件收集作品，可排除 AI 作品、限定小说语言 |
| 定时下载 | 用 cron 表达式和时区设定执行计划，也可以配置多个互相独立的计划 |
| 去重与历史 | 下载记录保存在本地数据库，已经下载过的作品会跳过 |
| 文件管理 | `pixivflow dirs` 查看保存目录，`pixivflow status` 查看下载统计 |
| 标签发现 | `pixivflow topic resolve "<主题词>"` 用标签和作品元数据展开相关标签，不调用大语言模型 |
| 外部投递 | 下载完成后通过 Webhook 或 HTTP Multipart 投递到自建服务或 [TelePost](https://github.com/redtidev1918/TelePost) |

日常使用只有一条链路：登录 Pixiv → 选择作品或设置收集条件 → 下载 → 保存到本地。需要长期自动收集时，会多出筛选和投递环节。

## 批量下载

按条件收集多个作品。首次使用时运行配置向导：

```bash
pixivflow setup
pixivflow download
```

已经下载过的作品会被跳过，所以每次新增数量可能少于设置的上限。

<details>
<summary>手动设置收集条件（插画和小说示例）</summary>

已有配置时，先备份再编辑：

```bash
pixivflow config backup
pixivflow config edit
```

将当前配置的 `targets` 替换为下面的数组，保留已有的登录和其他字段。这个片段每次最多下载 10 个插画作品和 5 篇小说：

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 10 },
    { "type": "novel", "tag": "ファンタジー", "limit": 5 }
  ]
}
```

保存后先检查配置，再执行下载：

```bash
pixivflow config validate
pixivflow download
```

</details>

常用筛选字段：

| 字段 | 含义 |
| --- | --- |
| `type` | `illustration` 下载插画 / 漫画，`novel` 下载小说 |
| `tag` | 要搜索的 Pixiv 标签，可优先使用作品页面上已有的标签 |
| `limit` | 每次最多下载多少个作品 |
| `mode` | `search`（按标签搜索）、`ranking`（按榜单）或 `topic`（按主题解析标签） |
| `minBookmarks` | 最低收藏数，用于筛选热门作品 |
| `startDate` / `endDate` | 发布日期范围，格式为 `YYYY-MM-DD` |
| `excludeAI` | 是否排除 AI 生成作品 |

更多例子见 [批量下载教程](docs/QUICKSTART.md#按标签批量下载)，完整筛选条件见 [配置参考](docs/CONFIG.md)。

## 定时下载

先确认批量下载能够正常运行，再设置定时任务。可以在 `pixivflow setup` 向导中设置，也可以直接编辑配置。

<details>
<summary>手动设置时间：每天北京时间凌晨 3 点</summary>

在当前配置中设置 `scheduler`：

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

这是配置片段，合并到已有配置即可。保存并验证后启动：

```bash
pixivflow config validate
pixivflow scheduler
```

需要在一天中执行多次、或者不同目标使用不同时间时，用 `schedules` 数组配置多个独立计划；存在 `schedules` 时旧的 `scheduler.cron` 会被忽略。字段说明见 [配置参考](docs/CONFIG.md)。

</details>

定时任务需要这个命令持续运行。电脑关机或休眠期间不会执行下载；默认情况下，进程在开机或重启后会补跑一次错过的执行，具体行为见 [配置参考](docs/CONFIG.md)。需要在服务器上长期运行，参考 [Docker 部署指南](docs/DOCKER.md)。

## 配置与文件位置

```bash
pixivflow dirs      # 配置文件、数据库和下载目录的实际路径
pixivflow config    # 查看当前配置，子命令包括 show / validate / edit / set
pixivflow status    # 下载统计与最近记录
```

- 默认使用 `persistent` 模式，下载的文件保留在本地。
- 配置成 `cache` 模式并接入投递目标时，接收服务确认成功后可以自动清理本地文件，投递失败的文件会保留。

保存位置、整理方式和清理策略见 [配置参考](docs/CONFIG.md)。

## WebUI

PixivFlow 自带可选的浏览器界面，由同一个 npm 包提供：

```bash
pixivflow web
```

默认地址是 `http://localhost:3000`，包含前端文件，不需要单独安装。界面可以查看下载记录和调度状态、管理下载任务、直接粘贴 URL 下载。使用期间保持命令运行，按 `Ctrl+C` 停止。

界面功能、访问凭据与对外访问的安全设置见 [WebUI 使用指南](docs/WEBUI.md)。前端源码在 [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) 仓库。

## 其他安装方式

- **Docker**：适合在服务器或 NAS 上长期运行定时任务。仓库提供 `Dockerfile`、`Dockerfile.scheduler` 和 `docker-compose.yml`，按 [Docker 部署指南](docs/DOCKER.md) 构建。
- **桌面客户端**：由独立仓库 [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) 维护，安装包与完成度以该仓库为准。
- **Android / Termux**：按 [Termux 安装指南](docs/TERMUX_INSTALL.md) 安装。
- **从源码构建**：

  ```bash
  git clone https://github.com/redtidev1918/PixivFlow.git
  cd PixivFlow
  npm install
  npm run build
  node dist/index.js --help
  ```

## 常见问题

<details>
<summary>登录失败或提示认证过期怎么办？</summary>

重新运行 `pixivflow login`。服务器等无法打开浏览器的环境，按 [登录指南](docs/LOGIN.md) 使用无头登录或导入已有令牌。

</details>

<details>
<summary>无法连接 Pixiv 怎么办？</summary>

运行 `pixivflow health` 检查网络与凭据。需要代理时按 [网络配置](docs/CONFIG.md#network-网络与代理) 设置。

</details>

<details>
<summary>为什么下载了 0 个作品？</summary>

检查标签、日期和收藏数条件是否过窄；也可能是符合条件的作品已经下载过，或者候选全部被过滤。运行 `pixivflow status` 查看最近记录。

</details>

<details>
<summary>文件保存在哪里？</summary>

运行 `pixivflow dirs`，输出中会列出配置文件和下载目录的实际路径。不同安装方式的保存位置可能不同，以这条命令显示的路径为准。

</details>

<details>
<summary>定时任务为什么没有运行？</summary>

确认 `pixivflow scheduler` 进程仍在运行、配置中 `scheduler.enabled` 为 `true`，并检查 cron 表达式和时区。电脑关机或休眠期间不会执行下载；想 24 小时运行请使用服务器或 Docker。

</details>

<details>
<summary>如何查看日志？</summary>

运行 `pixivflow logs` 查看运行日志，日志目录也可以用 `pixivflow dirs` 查看。投递队列相关的问题用 `pixivflow outbox` / `pixivflow delivery` 排查。

</details>

<details>
<summary>下载动图后没有 GIF？</summary>

合成 GIF 需要 `python3` 和 `ffmpeg`；合成失败时原始帧文件会保留。本仓库自带的 Docker 镜像已经包含两者，见 [动图配置](docs/CONFIG.md#pixiv-动图ugoira)。

</details>

<details>
<summary>常用命令速查</summary>

| 你要做什么 | 命令 |
| --- | --- |
| 查看帮助 | `pixivflow --help` |
| 登录账号 | `pixivflow login` |
| 下载一个链接 | `pixivflow download --url "<作品链接>"` |
| 按配置批量下载 | `pixivflow download` |
| 首次配置向导 | `pixivflow setup` |
| 编辑 / 检查配置 | `pixivflow config edit` / `pixivflow config validate` |
| 查看文件位置 | `pixivflow dirs` |
| 查看下载统计 | `pixivflow status` |
| 检查环境与连通性 | `pixivflow health` |
| 打开浏览器界面 | `pixivflow web` |
| 启动定时下载 | `pixivflow scheduler` |
| 主题解析为相关标签 | `pixivflow topic resolve "<主题词>"` |
| 投递队列排障 | `pixivflow outbox` / `pixivflow delivery` |

</details>

仍有问题时，请在 [Issues](https://github.com/redtidev1918/PixivFlow/issues) 附上复现步骤、版本、系统和脱敏后的错误输出。安全漏洞请按 [安全说明](SECURITY.md) 反馈。

## 文档

| 你想了解什么 | 文档 |
| --- | --- |
| 完整上手流程 | [快速开始](docs/QUICKSTART.md) |
| 安装包与下载方式 | [下载页面](docs/download.md) |
| 登录与凭据维护 | [登录指南](docs/LOGIN.md) |
| 所有下载模式与参数 | [使用指南](docs/USAGE.md) · [配置参考](docs/CONFIG.md) |
| 浏览器界面 | [WebUI 使用指南](docs/WEBUI.md) |
| 服务器 / 容器部署 | [Docker 部署指南](docs/DOCKER.md) · [Termux 安装](docs/TERMUX_INSTALL.md) |
| 将作品投递到其他服务 | [外部网关投递指南](docs/GATEWAY.md) |
| 配置运维通知 | [Apprise 通知](docs/APPRISE.md) |
| 从旧版升级 | [迁移指南](docs/MIGRATION.md) · [更新日志](CHANGELOG.md) |
| 项目架构与排障 | [架构说明](docs/ARCHITECTURE.md) · [调度终态](docs/SLOT_OUTCOME.md) |
| npm 发版流程 | [发版说明](docs/RELEASING.md) |

## 相关项目

- [TelePost](https://github.com/redtidev1918/TelePost) —— Telegram 投稿、审核与发布
- [pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy) —— 把两者组合部署的套件
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) —— 浏览器界面前端
- [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) —— 桌面客户端

职责边界：PixivFlow 负责 Pixiv 认证、候选发现与下载；TelePost 负责 Telegram 侧的投稿与审核；部署套件负责把两者接起来。

## 致谢

- [gallery-dl](https://github.com/mikf/gallery-dl) —— ugoira 与小说正文的实现参考
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) —— App API 端点语义
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) —— OAuth 登录流程参考
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) —— 登录库

本项目与 Pixiv Inc. 无关联。完整声明见 [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md)。

## 许可证

[MIT](LICENSE)
