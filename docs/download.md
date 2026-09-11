# 📥 下载 PixivFlow

**语言 / Language:** 中文 · [English](/en/download.md)

本页由 GitHub Actions 在每次发版时**自动更新**，始终指向最新 Release。

## 最新版本：`v2.17.0`（2026-09-11）

👉 [查看 Release 说明与校验和](https://github.com/redtidev1918/PixivFlow/releases/tag/v2.17.0)

PixivFlow 以 npm 包为主，同时提供发布包与官方 Docker 镜像。完整资产与历史版本见 [Releases](https://github.com/redtidev1918/PixivFlow/releases)。

## 安装方式

### npm（推荐）

```bash
npm install -g pixivflow
pixivflow --help
```

需要 Node.js 22.13 或更高版本。

### Docker

见 [Docker 部署](/DOCKER.md) 与 [DOCKER.md](https://github.com/redtidev1918/PixivFlow/blob/master/DOCKER.md)。

### 发布包

| 资产 | 说明 |
| :-- | :-- |
| `pixivflow-<version>.tgz` | `npm pack` 产出的发布包，可 `npm install -g ./pixivflow-<version>.tgz` |
| `SHA256SUMS` | 校验文件 |
| `RELEASE-METADATA.json` | 发版元数据 |

前往 [最新 Release](https://github.com/redtidev1918/PixivFlow/releases/latest) 下载。

## 校验下载

```bash
grep '\.tgz' SHA256SUMS | sha256sum -c -
```

## 更新日志

见 [CHANGELOG](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md)。

| 平台 | 文件 | 大小 | 下载 |
|---|---|---|---|
| 通用 | `RELEASE-METADATA.json` | 2 KB | [⬇️ 下载](https://github.com/redtidev1918/PixivFlow/releases/download/v2.17.0/RELEASE-METADATA.json) |
| 通用 | `SHA256SUMS` | 0 KB | [⬇️ 下载](https://github.com/redtidev1918/PixivFlow/releases/download/v2.17.0/SHA256SUMS) |
| 通用 | `pixivflow-2.17.0.tgz` | 1.8 MB | [⬇️ 下载](https://github.com/redtidev1918/PixivFlow/releases/download/v2.17.0/pixivflow-2.17.0.tgz) |
