# PixivFlow

[English](https://github.com/redtidev1918/PixivFlow/blob/master/README_EN.md) | **中文**

Pixiv 批量下载与定时收集工具。支持插画和小说的批量下载、标签搜索、
多维度筛选和 Cron 定时任务，提供命令行与 WebUI 两种使用方式。
基于 TypeScript 和 Node.js，可在 Windows、macOS、Linux 及 Docker 中运行。

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-18%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

## 安装

需要 Node.js 18 或更高版本（LTS）。

```bash
npm install -g pixivflow
pixivflow --help
```

服务器部署推荐 Docker Compose，见 [DOCKER.md](docs/DOCKER.md)；
PixivFlow + TelePost 联合部署套件（含可选代理）：
[redtidev1918/pixivflow-telepost-deploy](https://github.com/redtidev1918/pixivflow-telepost-deploy)
—— 一套配置，支持国内/海外、有/无公网 IP、VPS/Fly.io 任意场景。
从源码构建：

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
```

Termux / Android 环境见 [TERMUX_INSTALL.md](docs/TERMUX_INSTALL.md)。

## 快速上手

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

### 单进程多计划与配置热重载

`schedules[]` 可以为不同 target 组设置各自的 Cron。所有计划由一个 Node
进程托管，共享 Pixiv 客户端、SQLite 与文件服务；执行阶段使用有界串行队列，
适合 512 MiB 小内存机器。配置文件默认被监听，SSH/同步工具替换文件后会先完整
校验，再一次性替换全部调度项；无效 JSON、错误 Cron 或未知 target id 不会破坏
当前运行中的计划。正在执行的任务继续使用旧快照，下一次任务使用新快照。

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

## 下载目标

在配置文件的 `targets` 中定义要收集的内容，多个条件可以组合：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `type` | 内容类型：`illustration` 或 `novel` | `illustration` |
| `tag` | 搜索标签，支持多标签 OR | `"風景"` / `["水彩","厚涂"]` |
| `limit` | 单次下载数量上限 | `20` |
| `minBookmarks` | 最低收藏数 | `500` |
| `startDate` / `endDate` | 发布日期范围 | `"2025-01-01"` |

已下载的作品由 SQLite 数据库记录并自动跳过；文件存在但缺少记录时会自动补齐，
两者互不冲突。

### 本地留存与缓存交付

每个 target 可选择 `storageMode: "persistent"`（默认，本地永久留存）或
`storageMode: "cache"`（下载后交给命名 delivery target，成功才删除本地文件）。
交付层不绑定具体服务；下面只是把一个 HTTP multipart 投稿接口翻译成配置：

```json
{
  "delivery": {
    "outboxRetryBaseMs": 300000,
    "outboxRetryMaxMs": 21600000,
    "targets": {
      "tg-example": {
        "type": "httpMultipart",
        "url": "https://your-domain.example/api/bot1/v1/submissions",
        "headers": { "Authorization": "Bearer ${TG_SUBMIT_TOKEN}" },
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
        "target": "tg-example",
        "fields": { "tags": ["公告", "更新"], "anonymous": false }
      }
    }
  ]
}
```

headers 和 URL 支持任意 `${ENV_NAME}` 环境变量插值。交付失败时文件和
outbox 清单保留在 SQLite 数据库同级的 `delivery-outbox/`；下一次运行会先
检查待投递项。失败项默认从 5 分钟开始指数退避、最长 6 小时，避免服务不可用时
每个计划都重复上传并浪费带宽；成功后再清理。
对上面的 TG 示例，可把 `/gen_token` 得到的 `tp_...` 放入
`TG_SUBMIT_TOKEN` 环境变量；这只是示例服务自己的认证流程。

交互式配置向导：`pixivflow setup`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pixivflow download` | 按配置执行下载 |
| `pixivflow download --url <url>` | 通过 URL 直接下载 |
| `pixivflow random` | 随机下载热门作品 |
| `pixivflow scheduler` | 启动定时任务 |
| `pixivflow config` | 配置管理（查看 / 编辑 / 备份 / 恢复） |
| `pixivflow status` | 下载统计与最近记录 |
| `pixivflow health` | 健康检查：配置、目录可写性、连通性 |
| `pixivflow tags discover <词>` | 发现相关 Tag（Pixiv 联想 + 作品标签共现），只列候选不改配置 |
| `pixivflow tags apply <清单> --target <id> --select <tag1,tag2>` | 人工确认后把所选 Tag 原子写入配置并触发热重载 |

`tags discover` 会调用 Pixiv 标签联想接口，并抽样最近插画 / 小说统计共同出现的标签，结果缓存 7 天；它**不会**改动任何下载计划。确认候选后用 `tags apply` 显式选择，应用前会整份校验配置、自动备份并原子替换，运行中的 scheduler 经配置热重载生效。

其他用法见 [CLI_MIGRATION_SUMMARY.md](docs/CLI_MIGRATION_SUMMARY.md)。

## 文档

完整教程站点：<https://redtidev1918.github.io/PixivFlow/>

| 文档 | 说明 |
| --- | --- |
| [QUICKSTART](docs/QUICKSTART.md) | 三分钟上手 |
| [CONFIG](docs/CONFIG.md) | 全部配置项说明 |
| [USAGE](docs/USAGE.md) | 功能详解 |
| [LOGIN](docs/LOGIN.md) | 账号登录相关 |
| [DOCKER](docs/DOCKER.md) | 容器化部署方案 |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 架构与技术实现 |
| [RELEASING](docs/RELEASING.md) | npm 发版流程 |
| [CHANGELOG](docs/project/CHANGELOG.md) | 版本更新日志 |
| [ACKNOWLEDGMENTS](docs/ACKNOWLEDGMENTS.md) | 参考与致谢:灵感来源、核心依赖与规范声明 |

English version: [README_EN.md](README_EN.md).

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
