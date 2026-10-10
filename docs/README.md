# PixivFlow 文档

语言：中文 · [English](en/README.md)

第一次使用，从 [快速开始](QUICKSTART.md) 下载一个作品。已经能下载了，可以按下面的任务查找说明。

## 按任务找文档

| 你要做什么 | 文档 |
| --- | --- |
| 安装并下载第一个作品 | [快速开始](QUICKSTART.md) · [下载页面](download.md) |
| 登录账号、导入令牌或处理认证失败 | [登录指南](LOGIN.md) |
| 按标签、榜单、主题或作者收集作品 | [功能与命令](USAGE.md) |
| 修改数量、日期、收藏数、目录或代理 | [配置参考](CONFIG.md) · [配置示例](https://github.com/redtidev1918/PixivFlow/tree/master/config/examples) |
| 在服务器或 NAS 上定时下载 | [Docker 部署](DOCKER.md) |
| 在 Android 手机上运行 | [Termux 安装](TERMUX_INSTALL.md) |
| 将作品发到 QQ、飞书或自建服务 | [外部网关投递](GATEWAY.md) |
| 接收运行通知 | [Apprise 通知](APPRISE.md) |
| 从 v1 的脚本用法迁移到 CLI | [迁移指南](MIGRATION.md) |

## 文件位置与浏览器界面

```bash
pixivflow dirs
pixivflow web
```

`dirs` 显示实际配置和下载路径。`web` 启动浏览器界面，地址会显示在终端，默认是 `http://localhost:3000`。调度中心可以查看逐个下载目标的状态和原因。

桌面客户端的安装与排障见 [pixivflow-desktop 文档](https://redtidev1918.github.io/pixivflow-desktop/)。

## 进阶使用

| 文档 | 内容 |
| --- | --- |
| [Tag 空间与排名](TAG_RANKING.md) | 主题标签来源、评分和候选排查 |
| [网关契约](GATEWAY_CONTRACT.md) | 消息格式、签名、响应和配对接口 |
| [参考网关](https://github.com/redtidev1918/PixivFlow/tree/master/examples/gateway) | 可运行的网关示例 |
| [辅助脚本](SCRIPTS.md) | 仓库中脚本的用途与参数 |
| [更新日志](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md) | 各版本变化 |

<details>
<summary>开发、架构与服务集成</summary>

| 文档 | 内容 |
| --- | --- |
| [架构说明](ARCHITECTURE.md) | 模块、下载流程和存储设计 |
| [Pixiv Client Kit](PIXIV_CLIENT_KIT.md) | 可复用的 Pixiv App API 客户端 |
| [WebUI API](API.md) | REST 接口和 Socket.IO 事件 |
| [可观测性](OBSERVABILITY.md) | 日志、指标与告警 |
| [调度结果](SLOT_OUTCOME.md) | 调度结果分类和终态定义 |
| [贡献指南](https://github.com/redtidev1918/PixivFlow/blob/master/CONTRIBUTING.md) | 提交代码与检查流程 |
| [发版流程](RELEASING.md) | 版本管理与 npm 发布 |
| [架构索引](architecture/README.md) · [架构原则](architecture/principles.md) | 长期设计与文档治理 |
| [投递运行时](architecture/delivery-runtime.md) | 投递、重试、幂等与网关 |
| [运行结果契约](architecture/operational-result-contract.md) | 执行结果的跨模块约定 |
| [候选供给 RFC](architecture/candidate-supply-rfc.md) | 主题画像与候选库存设计 |
| [候选可观测性 RFC](architecture/candidate-supply-observability-rfc.md) | 候选供给排查设计 |
| [WebUI 控制中心 RFC](architecture/webui-control-center-rfc.md) | 控制中心设计 |

WebUI 前端源码在 [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui)。环境搭建见 [开发指南](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/DEVELOPMENT_GUIDE.md)，界面组件见 [组件目录](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/COMPONENT_GUIDE.md)，静态包与 Docker 构建见 [构建选项](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/BUILD_OPTIONS.md)。

</details>

## 反馈与项目入口

问题与建议提交到 [Issues](https://github.com/redtidev1918/PixivFlow/issues)，附上复现步骤和脱敏后的错误信息。安全问题按 [安全说明](https://github.com/redtidev1918/PixivFlow/blob/master/SECURITY.md) 反馈。

[项目主页](https://github.com/redtidev1918/PixivFlow) · [npm 包](https://www.npmjs.com/package/pixivflow) · [致谢](ACKNOWLEDGMENTS.md)
