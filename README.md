# PixivFlow

语言 / Language：中文 · [English](README.en.md)

**把喜欢的 Pixiv 插画、漫画、小说和动图保存到本地，也可以按条件批量收集、定时下载。**

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-22.13%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

- 下载链接：支持作品、小说系列和作者主页。
- 批量收集：按标签、榜单、发布日期和收藏数筛选插画或小说。
- 定时下载：设置执行时间，自动跳过已有下载记录的作品。
- 查看结果：在浏览器中查看下载记录和定时任务状态。

下载结果默认保存在本地。需要分享时，可配置 HTTP 投递，将作品发给其他服务。

[开始使用](#开始使用) · [批量下载](#批量下载) · [定时下载](#定时下载) · [常见问题](#常见问题) · [完整教程](https://redtidev1918.github.io/PixivFlow/)

## 选择使用方式

| 你想怎么用 | 入口 |
| --- | --- |
| 在电脑上用命令下载，或打开浏览器界面 | 按下面的步骤安装 npm 版，再运行 `pixivflow web` 打开界面 |
| 使用桌面客户端 | 查看 [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) |
| 在服务器上长期运行 | 查看 [Docker 部署指南](docs/DOCKER.md) |
| 在 Android 手机上运行 | 查看 [Termux 安装指南](docs/TERMUX_INSTALL.md) |

## 开始使用

下面以命令行版为例。Windows 可以打开 PowerShell，macOS / Linux 可以打开终端，逐条执行命令。

### 1. 安装

需要 Node.js 22.13+、npm 9+、Pixiv 账号，以及可以访问 Pixiv 的网络。

```bash
node -v
npm -v
npm install -g pixivflow
pixivflow --help
```

`pixivflow --help` 能显示帮助信息，就说明命令已安装成功。

### 2. 登录 Pixiv

本机有 Chrome / Chromium 浏览器时，运行：

```bash
pixivflow login
```

按提示完成登录。凭据会保存在本地，之后下载时会自动使用。

服务器登录、已有登录令牌的导入方式见 [登录指南](docs/LOGIN.md)。配置文件包含登录凭据，求助时请删除敏感信息后再分享。

### 3. 下载第一个作品

把下面的示例地址替换成你想下载的真实作品链接：

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

也可以下载小说：

```bash
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=12345678"
```

`--url` 还支持小说系列和作者主页链接，更多用法见 [使用指南](docs/USAGE.md)。

### 4. 找到下载的文件

```bash
pixivflow dirs
pixivflow status
```

`dirs` 显示当前配置文件、插画、小说和下载记录数据库的实际位置；`status` 查看下载统计和最近记录。路径会受安装方式和配置影响，以 `dirs` 的输出为准。

## 在浏览器中使用

安装命令行版后，运行：

```bash
pixivflow web
```

在浏览器中打开终端显示的地址，默认是 [http://localhost:3000](http://localhost:3000)。npm 发布包已包含网页界面。

界面可以查看下载记录、配置和任务结果。调度中心会显示各下载目标的状态与原因，例如候选为空或作品已下载。

使用期间保持命令运行；按 `Ctrl+C` 停止网页服务。如果端口被占用，可以指定其他端口：

```bash
pixivflow web --port 8080
```

## 批量下载

一个「下载目标」就是一组收集条件，例如「每次下载最多 10 个風景插画作品」。首次配置可以使用交互式向导，一步步设置登录信息、保存位置、标签和定时任务：

```bash
pixivflow setup
```

已有配置时，可以先备份，再编辑：

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

保存后，先检查配置，再执行下载：

```bash
pixivflow config validate
pixivflow download
```

| 常用设置 | 含义 |
| --- | --- |
| `type` | `illustration` 下载插画 / 漫画，`novel` 下载小说 |
| `tag` | 要搜索的 Pixiv 标签，可优先使用作品页面上已有的标签 |
| `limit` | 每次最多下载多少个作品 |
| `minBookmarks` | 最低收藏数，用于筛选热门作品 |
| `startDate` / `endDate` | 发布日期范围，格式为 `YYYY-MM-DD` |

重复执行时，程序会根据下载记录跳过已下载作品。因此实际新增数量可能小于 `limit`。榜单、主题发现和更多筛选条件见 [配置说明](docs/CONFIG.md)。

## 定时下载

先确认 `pixivflow download` 能按你的条件下载，再设置自动运行时间。在当前配置中设置 `scheduler`，例如每天北京时间凌晨 3 点运行：

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

这也是配置片段，合并到已有配置即可。保存并验证后启动：

```bash
pixivflow config validate
pixivflow scheduler
```

程序和电脑需要持续运行；按 `Ctrl+C` 停止调度。服务器长期运行见 [Docker 部署指南](docs/DOCKER.md)，多个计划和运行频率见 [配置说明](docs/CONFIG.md)。

## 常用命令

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

## 常见问题

| 遇到的问题 | 可以怎么处理 |
| --- | --- |
| 提示找不到 `pixivflow` 命令 | 重新打开终端，确认全局安装成功，并检查 npm 全局可执行文件目录是否在 `PATH` 中 |
| 登录失败或提示认证过期 | 重新运行 `pixivflow login`，更多方式见 [登录指南](docs/LOGIN.md) |
| 无法连接 Pixiv | 运行 `pixivflow health` 检查；需要代理时，按 [网络配置说明](docs/CONFIG.md#network-网络与代理) 设置 |
| 下载了 0 个作品 | 检查标签、日期和收藏数条件；也可能是符合条件的作品已经下载过 |
| 不知道文件存在哪里 | 运行 `pixivflow dirs` 查看实际路径 |
| 下载动图时缺少依赖 | 动图合成 GIF 还需要 `python3` 和 `ffmpeg`；官方 Docker 镜像已包含两者，见 [动图配置](docs/CONFIG.md#pixiv-动图ugoira) |
| 定时任务没有执行 | 确认程序持续运行、`scheduler.enabled` 为 `true`，并检查时间表达式和时区 |

仍有问题时，请在 [Issues](https://github.com/redtidev1918/PixivFlow/issues) 附上复现步骤、版本、系统和脱敏后的错误输出。安全漏洞请按 [安全说明](SECURITY.md) 反馈。

## 更多用法与文档

| 你想了解什么 | 文档 |
| --- | --- |
| 完整上手流程 | [快速开始](docs/QUICKSTART.md) |
| 安装包与下载方式 | [下载页面](docs/download.md) |
| 登录与凭据维护 | [登录指南](docs/LOGIN.md) |
| 所有下载模式与参数 | [使用指南](docs/USAGE.md) · [配置参考](docs/CONFIG.md) |
| 服务器 / 容器部署 | [Docker](docs/DOCKER.md) |
| 将作品投递到其他服务 | [外部网关投递指南](docs/GATEWAY.md) · [配置参考](docs/CONFIG.md) |
| 配置运维通知 | [Apprise 通知](docs/APPRISE.md) |
| 从旧版升级 | [迁移指南](docs/MIGRATION.md) · [更新日志](CHANGELOG.md) |

本地保存默认使用 `persistent` 模式。配置 `cache` 投递时，文件在接收服务确认成功后可自动清理；请先阅读 [配置参考](docs/CONFIG.md)，确认保存策略符合你的需求。

需要 Telegram 投稿、审核与发布时，可以接入 [TelePost](https://github.com/redtidev1918/TelePost)；组合部署见 [部署套件](https://github.com/redtidev1918/pixivflow-telepost-deploy)。

<details>
<summary>开发者与服务集成文档</summary>

- [项目架构](docs/ARCHITECTURE.md)
- [投递、重试与网关契约](docs/architecture/delivery-runtime.md)
- [Workflow Protocol v1 与 Job API](https://github.com/redtidev1918/pixivflow-telepost-deploy/blob/main/docs/architecture/workflow-protocol.md)
- [npm 发版流程](docs/RELEASING.md)
- [WebUI 前端项目](https://github.com/redtidev1918/pixivflow-webui)

从源码构建：

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
node dist/index.js --help
```

</details>

## 致谢

- [gallery-dl](https://github.com/mikf/gallery-dl) —— ugoira 与小说正文的实现参考
- [pixiv-app-api](https://github.com/akameco/pixiv-app-api) · [pixiv-api](https://github.com/azuline/pixiv-api) —— App API 端点语义
- [get-pixivpy-token](https://github.com/eggplants/get-pixivpy-token) —— OAuth 登录流程参考
- [pixiv-token-getter](https://github.com/redtidev1918/pixiv-token-getter) —— 登录库
- [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui) —— WebUI 前端
- [pixivflow-desktop](https://github.com/redtidev1918/pixivflow-desktop) —— 官方桌面客户端

本项目与 Pixiv Inc. 无关联。完整声明见 [docs/ACKNOWLEDGMENTS.md](docs/ACKNOWLEDGMENTS.md)。

## 许可证

[MIT](LICENSE)
