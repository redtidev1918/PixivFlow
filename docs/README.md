# PixivFlow 文档

PixivFlow 是一个独立运行的 Pixiv 自动化下载工具。无需浏览器插件，配置一次即可长期自动运行。

## 核心文档

- **[快速开始](./QUICKSTART.md)**: 3分钟上手。
- **[配置手册](./CONFIG.md)**: 完整配置参数说明。
- **[使用指南](./USAGE.md)**: 功能详解。
- **[登录指南](./LOGIN.md)**: 账号登录相关。
- **[Docker 部署](./DOCKER.md)**: 容器化部署方案。

## 进阶文档

- [脚本工具](./SCRIPTS.md): 实用维护脚本。
- [架构设计](./ARCHITECTURE.md): 系统架构与 API。
- [API 参考](./API.md): RESTful 接口文档。
- [Termux 安装](./TERMUX_INSTALL.md): Android 手机运行指南。

---

## 快速开始

### 安装

推荐使用 npm 全局安装：

```bash
npm install -g pixivflow
```

### 运行

1. **登录**
   ```bash
   pixivflow login
   ```

2. **下载**
   ```bash
   pixivflow download
   ```

详细流程请参考 [快速开始](./QUICKSTART.md)。

---

## 功能特性

- **独立运行**: 纯命令行工具，无需浏览器。
- **自动化**: 支持 Cron 定时任务。
- **高性能**: 异步并发下载，自动处理限流。
- **多模式**: 支持搜索、排行榜、画师全集、小说系列等。
- **API 支持**: 提供 RESTful API 和 WebSocket，方便二次开发。

## 帮助与支持

- [GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues)
- [GitHub Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions)
