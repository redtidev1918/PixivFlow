## 环境要求

- Node.js 22.13 或更高版本（npm 9+）
- 一个 Pixiv 账号；当前网络需能访问 Pixiv，部分网络环境需设置代理
- 交互式登录会使用本机的 Chrome / Chromium

## 安装（npm）

```bash
npm install -g pixivflow
```

验证安装：

```bash
pixivflow --help
```

npm 项目页：<https://www.npmjs.com/package/pixivflow>

## Docker 部署

适合服务器、NAS 或长期定时运行的场景，部署步骤见 [Docker 部署](/DOCKER.md)。

## 离线安装与历史版本

无法使用 npm 的环境，可从 [GitHub Releases](https://github.com/redtidev1918/PixivFlow/releases) 下载发布包 `pixivflow-<版本>.tgz` 离线安装：

```bash
npm install -g ./pixivflow-<版本>.tgz
```

历史版本、源码与校验文件也在 Releases 页面。

## 更新日志

见 [CHANGELOG](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md)。
