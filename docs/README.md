# PixivFlow 文档中心

> **English:** This is the documentation hub for PixivFlow, a Pixiv batch
> downloader with CLI and WebUI. New here? Follow [Quick Start](QUICKSTART.md)
> → [Login](LOGIN.md). Server deployment goes through
> [Docker](DOCKER.md); developers will find architecture notes and the full
> WebUI HTTP API under "For Developers".

这里汇聚 PixivFlow 的全部文档。按你的目标选择一条路线:

## 🧭 按任务找文档

| 你想做什么 | 路线 |
| --- | --- |
| 第一次使用,跑通第一个下载 | [快速开始](QUICKSTART.md) → [账号登录](LOGIN.md) |
| 了解每种下载方式和全部命令 | [功能与命令](USAGE.md) |
| 精细控制下载内容(标签、收藏数、日期、排行) | [配置参考](CONFIG.md) + [示例合集](../config/examples/) |
| 部署到服务器长期挂机 | [Docker 部署](DOCKER.md) |
| 在 Android 手机上运行 | [Termux 安装](TERMUX_INSTALL.md) |
| 从 v1 升级到 v2 | [迁移指南](CLI_MIGRATION_SUMMARY.md) |
| 二次开发、改代码、查接口 | [架构说明](ARCHITECTURE.md) → [WebUI API](API.md) |

## 📚 全部文档

### 开始使用

| 文档 | 内容 |
| --- | --- |
| [QUICKSTART](QUICKSTART.md) | 安装、登录、第一次下载、验证环境,十分钟走完全流程 |
| [LOGIN](LOGIN.md) | 三种登录方式、凭据存储位置、token 过期处理 |

### 使用手册

| 文档 | 内容 |
| --- | --- |
| [USAGE](USAGE.md) | 六种下载模式、URL 直链格式、去重与断点续传、定时任务行为、全命令速查 |
| [CONFIG](CONFIG.md) | 配置文件逐项说明:targets 全字段、存储目录组织、调度器参数、代理与环境变量 |
| [SCRIPTS](SCRIPTS.md) | `scripts/` 目录下辅助脚本的用途与用法 |

### 部署运行

| 文档 | 内容 |
| --- | --- |
| [DOCKER](DOCKER.md) | docker compose 双服务部署、环境变量参考、数据持久化、故障排查 |
| [TERMUX_INSTALL](TERMUX_INSTALL.md) | Android/Termux 环境从零安装 |

### 开发者

| 文档 | 内容 |
| --- | --- |
| [ARCHITECTURE](ARCHITECTURE.md) | 模块地图、命令注册机制、下载管线、存储层设计 |
| [API](API.md) | WebUI 后端 REST 接口与 Socket.IO 实时事件 |
| [CONTRIBUTING](project/CONTRIBUTING.md) | 参与贡献的流程与规范 |
| [RELEASING](RELEASING.md) | 版本管理与 npm 发版流程 |
| [CHANGELOG](project/CHANGELOG.md) | 版本更新记录 |

## 🖥️ WebUI 前端

| 文档 | 内容 |
| --- | --- |
| [pixivflow-webui 仓库](https://github.com/redtidev1918/pixivflow-webui) | React 18 + Ant Design 5 前端源码与文档入口 |
| [开发指南](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/DEVELOPMENT_GUIDE.md) | 环境搭建、脚本、状态与 i18n 约定 |
| [组件目录](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/COMPONENT_GUIDE.md) | 全量组件职责与组合套路 |
| [构建选项](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/BUILD_OPTIONS.md) | 静态托管 / Docker 一体化两条路线 |

## 致谢

灵感来源、核心依赖与规范声明见 [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md)。

## 🔗 其他入口

- 项目主页:<https://github.com/redtidev1918/PixivFlow>
- 教程站点(HTML):<https://redtidev1918.github.io/PixivFlow/>
- npm 包:<https://www.npmjs.com/package/pixivflow>
- 问题反馈:[Issues](https://github.com/redtidev1918/PixivFlow/issues)(安全漏洞请看 [SECURITY.md](../SECURITY.md))

---

## 相关文档

- [QUICKSTART](QUICKSTART.md) — 还没跑起来?从这里开始
- [USAGE](USAGE.md) — 已能运行?了解全部能力
- [CONFIG](CONFIG.md) — 想精确控制下载什么?读这份
