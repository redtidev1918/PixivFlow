# 快速开始

> **English**: Install globally with `npm install -g pixivflow`, sign in with
> `pixivflow login`, then run `pixivflow download` or use
> `pixivflow download --url <link>` for a single item. Verify the setup with
> `pixivflow health`.

## 环境要求

- Node.js 18 及以上版本（推荐 LTS）
- npm 9+
- Pixiv 账号

## 安装

```bash
npm install -g pixivflow
pixivflow --help    # 验证安装
```

从源码运行：克隆仓库后依次执行 `npm install`、`npm run login`、
`npm run download`（详见仓库根目录 [README.md](../README.md) 的「快速开始」一节），
或在 [Docker](DOCKER.md) 中直接使用。

## 登录

```bash
pixivflow login
```

按提示完成 Pixiv 授权，凭据会保存在本地配置中，之后无需重复登录。
服务器等无图形界面环境使用 `pixivflow login-headless`。

## 开始下载

```bash
# 直接粘贴作品链接（插画 / 小说 / 用户主页均可识别）
pixivflow download --url https://www.pixiv.net/artworks/123456789

# 或按配置文件中的下载目标批量执行
pixivflow download

# 长期挂机自动收集
pixivflow scheduler
```

下载结果保存在配置指定的目录下，默认按画师和标题归档。

## 基础配置

配置文件：`config/standalone.config.json`

下载「風景」标签的 20 张插画：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

完整字段说明见 [配置手册](./CONFIG.md)。

## 检查环境

```bash
pixivflow health
```

该命令会检查配置完整性、目录可写性和到 Pixiv 的连通性，
首次部署后建议先运行一次。
