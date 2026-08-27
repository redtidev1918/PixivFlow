# PixivFlow

Pixiv 批量下载与定时收集工具。支持插画和小说的批量下载、标签搜索、
多维度筛选和 Cron 定时任务，提供命令行与 WebUI 两种使用方式。
基于 TypeScript 和 Node.js，可在 Windows、macOS、Linux 及 Docker 中运行。

[![Version](https://img.shields.io/npm/v/pixivflow?style=flat-square)](https://www.npmjs.com/package/pixivflow)
[![Node](https://img.shields.io/badge/Node.js-18%2B_LTS-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/Docs-redtidev1918.github.io-6366f1?style=flat-square)](https://redtidev1918.github.io/PixivFlow/)

## 安装

需要 Node.js 18 或更高版本（LTS）。

```bash
npm install -g pixivflow
pixivflow --help
```

服务器部署推荐 Docker Compose，见 [DOCKER.md](docs/DOCKER.md)；
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

English version: [README_EN.md](README_EN.md).

## 问题反馈

Bug 与功能建议请提交到
[Issues](https://github.com/redtidev1918/PixivFlow/issues)，
提交前建议先运行 `pixivflow health` 并附上输出（注意删除 token 等敏感信息，
配置文件中包含认证信息，请勿直接分享）。安全漏洞的处理方式见
[SECURITY.md](SECURITY.md)。

## 许可证

[GPL-3.0-or-later](LICENSE)
