# PixivFlow

语言 / Language：中文 · [English](README.en.md)

![PixivFlow](.github/social-preview.png)

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

**把喜欢的 Pixiv 插画、漫画、小说和动图保存到本地；也可以按标签、榜单等条件批量收集，并定时自动下载。**

下载的文件保存在你自己的电脑或服务器上，不需要注册额外账号。

[界面预览](#界面预览) · [能做什么](#能做什么) · [选择安装方式](#选择安装方式) · [快速开始](#快速开始) · [批量下载](#批量下载) · [定时下载](#定时下载) · [常见问题](#常见问题) · [完整文档](https://redtidev1918.github.io/PixivFlow/)

## 界面预览

在浏览器中打开 `pixivflow web`，可以完成大部分日常操作。下面是实际界面。

输入作品链接直接下载，也可以每行一个链接批量解析：

![URL 直接下载](docs/assets/readme/webui-url-download.zh.png)

启动、停止和查看下载任务，并显示文件保存路径：

![下载任务管理](docs/assets/readme/webui-download-tasks.zh.png)

仪表盘汇总下载数量与最近记录：

![仪表盘](docs/assets/readme/webui-dashboard.zh.png)

## 能做什么

**保存单个作品。** 粘贴作品、小说、小说系列或作者主页链接即可下载。多页插画按页全部保存；动图会合成 GIF；小说保存为 TXT，正文中的插图一并下载。

**按条件批量收集。** 用标签、榜单、发布日期、最低收藏数等条件筛选插画或小说，可以排除 AI 作品、限定小说语言。已经下载过的作品会跳过，因此每次新增数量可能少于设置的上限。

**定时自动执行。** 用 cron 表达式和时区设定执行时间，也可以配置多个互相独立的计划。执行状态保存在本地数据库中，进程重启后按账本继续，而不是从头再跑一遍。

**在浏览器里管理。** `pixivflow web` 提供下载记录、任务控制、配置查看和调度状态；调度中心会显示每个目标的执行状态和终态原因（例如候选为空、作品已下载）。

**发现相关标签。** `pixivflow topic resolve <主题词>` 把一个主题词展开成 Pixiv 上相关的标签。它只使用标签与作品元数据统计，不调用大语言模型。

**把文件投递出去。** 下载完成后可以通过 Webhook 或 HTTP Multipart 投递到自建服务，也可以接入 [TelePost](https://github.com/redtidev1918/TelePost) 投稿到 Telegram 审核群。PixivFlow 负责获取、筛选和下载，TelePost 负责投稿、审核与发布。

## 工作方式

日常使用只有一条链路：

```text
登录 Pixiv → 选择作品或设置收集条件 → 下载 → 保存到本地
```

需要长期自动收集时，会多出筛选和投递环节：

```text
设置筛选规则 → 设定执行计划 → 按条件发现候选并排序去重
→ 下载 → 需要时投递到下游服务 → 在界面中查看结果
```

## 选择安装方式

| 使用方式 | 适合谁 | 说明 |
| --- | --- | --- |
| 命令行 + 浏览器界面（推荐起点） | 想尽快下载或批量收集 | 从 npm 安装，网页界面已包含在安装包内 |
| Docker / 服务器常驻 | 想让它在服务器上长期运行 | 仓库提供 `Dockerfile`、`Dockerfile.scheduler` 与 `docker-compose.yml`，按 [Docker 部署指南](docs/DOCKER.md) 自行构建 |
| 桌面客户端 | 希望用独立桌面程序 | 由独立仓库 [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) 维护，安装包与完成度以该仓库为准 |
| Android / Termux | 想在手机上运行 | 按 [Termux 安装指南](docs/TERMUX_INSTALL.md) 安装 |

下面的快速开始以命令行版为例；安装完成后同样可以打开浏览器界面。网页界面的前端源码在 [WebUI 前端仓库](https://github.com/redtidev1918/pixivflow-webui)。

## 快速开始

只下载一个作品时，完成这四步就够了。Windows 打开 PowerShell，macOS / Linux 打开终端，代码框中的命令逐行复制执行。

开始前请确认：

- 有一个 Pixiv 账号，并且当前网络能访问 Pixiv（部分网络环境需要代理）。
- 已安装 [Node.js](https://nodejs.org/) 22.13 或更新版本；npm 随 Node.js 一起安装，需要 9 或更新版本。
- 桌面登录需要 Chrome 或 Chromium 浏览器。

### 1. 安装

安装 Node.js 后重新打开终端，先用前两条命令检查版本，再安装 PixivFlow：

```bash
node -v
npm -v
npm install -g pixivflow
pixivflow --help
```

`pixivflow --help` 能显示帮助信息，就说明命令已安装成功。

### 2. 登录 Pixiv

```bash
pixivflow login
```

命令会打开本机的 Chrome / Chromium，按提示登录你的 Pixiv 账号。登录成功后凭据保存在本地，之后下载会自动使用。

> **注意凭据泄露风险。** 登录命令会在终端打印访问令牌（access token）、刷新令牌（refresh token）等信息。请不要把包含这些内容的终端输出、日志或截图发到 Issue、群聊或公开平台。需要求助时先删除敏感信息。

服务器登录、导入已有登录令牌的方式见 [登录指南](docs/LOGIN.md)。

### 3. 下载第一个作品

在 Pixiv 打开想保存的作品，复制浏览器地址栏中的链接，替换下面引号里的示例地址（保留两侧的英文双引号）：

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

小说、小说系列和作者主页链接同样可以下载：

```bash
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=12345678"
```

`--url` 支持的链接格式见 [使用指南](docs/USAGE.md)。

### 4. 找到下载的文件

```bash
pixivflow dirs
```

输出中会列出配置文件和保存目录的实际路径，用文件管理器打开对应目录即可。不同安装方式的保存位置可能不同，以这条命令显示的路径为准。

想查看下载数量和最近记录，运行 `pixivflow status`。

## 在浏览器中使用

运行：

```bash
pixivflow web
```

在浏览器中打开终端显示的地址，默认是 [http://localhost:3000](http://localhost:3000)。npm 发布包已包含网页界面。

界面可以查看下载记录、配置和任务结果。使用期间保持命令运行，按 `Ctrl+C` 停止；端口被占用时可以指定其他端口：

```bash
pixivflow web --port 8080
```

如果在服务器上运行，建议按 [Docker 部署指南](docs/DOCKER.md) 设置访问凭据后再对外暴露；默认监听本机地址。

## 批量下载

想一次收集多个作品，可以按标签、榜单、发布日期和收藏数设置条件。首次使用时运行向导：

```bash
pixivflow setup
```

完成配置后执行下载：

```bash
pixivflow download
```

已下载过的作品会被跳过，所以新增数量可能少于设置的上限。

<details>
<summary>手动设置收集条件：插画和小说示例</summary>

已有配置时，先备份再编辑：

```bash
pixivflow config backup
pixivflow config edit
```

将当前配置的 `targets` 替换为下面的数组，保留已有登录和其他字段。这个片段每次最多下载 10 个插画作品和 5 篇小说：

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

需要在一天中执行多次、或者不同目标用不同时间时，使用 `schedules` 数组配置多个独立计划（存在 `schedules` 时旧的 `scheduler.cron` 会被忽略）。字段说明见 [配置参考](docs/CONFIG.md)。

</details>

定时任务需要这个命令持续运行；电脑关机或休眠期间不会执行下载。默认情况下，进程在开机或重启后会补跑一次错过的执行，具体行为见 [配置参考](docs/CONFIG.md)。

需要在服务器上长期运行，查看 [Docker 部署指南](docs/DOCKER.md)。

## 文件保存在哪里

- 默认使用 `persistent` 模式：下载的文件保留在本地。
- 配置成 `cache` 模式并接入投递目标时，文件在接收服务确认成功后可以自动清理，失败的文件会保留。
- 运行 `pixivflow dirs` 查看当前实际使用的配置、数据库和下载目录。

保存位置、整理方式和清理策略见 [配置参考](docs/CONFIG.md)。

## 常见问题

| 遇到的问题 | 可以怎么处理 |
| --- | --- |
| 提示找不到 `pixivflow` 命令 | 重新打开终端，确认全局安装成功，并检查 npm 全局可执行文件目录是否在 `PATH` 中 |
| 登录失败或提示认证过期 | 重新运行 `pixivflow login`；服务器环境见 [登录指南](docs/LOGIN.md) |
| 无法连接 Pixiv | 运行 `pixivflow health` 检查；需要代理时按 [网络配置](docs/CONFIG.md#network-网络与代理) 设置 |
| 下载了 0 个作品 | 检查标签、日期和收藏数条件；也可能是符合条件的作品已经下载过，或候选全部被过滤 |
| 不知道文件存在哪里 | 运行 `pixivflow dirs` 查看实际路径 |
| 必须一直开着电脑吗 | 是的。`pixivflow scheduler` 需要进程持续运行；关机或休眠期间不会执行，开机后可补跑错过的执行。想 24 小时运行请用服务器或 Docker |
| 下载动图时缺少依赖 | 动图合成 GIF 需要 `python3` 和 `ffmpeg`；合成失败时原始帧文件会保留。本仓库自带的 Docker 镜像已包含两者，见 [动图配置](docs/CONFIG.md#pixiv-动图ugoira) |
| 定时任务没有执行 | 确认进程仍在运行、`scheduler.enabled` 为 `true`，并检查 cron 表达式和时区 |
| 桌面客户端和浏览器界面有什么区别 | 浏览器界面由本仓库的 npm 包提供，运行 `pixivflow web` 即可；桌面客户端是独立项目，见 [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) |
| 能装在服务器上吗 | 可以。参考 [Docker 部署指南](docs/DOCKER.md)，长期运行时还需要保证进程不被系统回收 |

仍有问题时，请在 [Issues](https://github.com/redtidev1918/PixivFlow/issues) 附上复现步骤、版本、系统和脱敏后的错误输出。安全漏洞请按 [安全说明](SECURITY.md) 反馈。

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

## 文档

| 你想了解什么 | 文档 |
| --- | --- |
| 完整上手流程 | [快速开始](docs/QUICKSTART.md) |
| 安装包与下载方式 | [下载页面](docs/download.md) |
| 登录与凭据维护 | [登录指南](docs/LOGIN.md) |
| 所有下载模式与参数 | [使用指南](docs/USAGE.md) · [配置参考](docs/CONFIG.md) |
| 服务器 / 容器部署 | [Docker 部署指南](docs/DOCKER.md) · [Termux 安装](docs/TERMUX_INSTALL.md) |
| 将作品投递到其他服务 | [外部网关投递指南](docs/GATEWAY.md) |
| 配置运维通知 | [Apprise 通知](docs/APPRISE.md) |
| 从旧版升级 | [迁移指南](docs/MIGRATION.md) · [更新日志](CHANGELOG.md) |
| 项目架构与排障 | [架构说明](docs/ARCHITECTURE.md) · [调度终态](docs/SLOT_OUTCOME.md) |
| npm 发版流程 | [发版说明](docs/RELEASING.md) |

从源码构建：

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
node dist/index.js --help
```

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
