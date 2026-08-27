# 快速开始

> **English:** Get PixivFlow running in about ten minutes: install the CLI
> from npm, sign in to your Pixiv account once, download your first artwork
> by pasting any Pixiv URL, then verify the setup with `pixivflow health`.
> For servers without a browser, use `pixivflow login-headless`; for Docker,
> see DOCKER.md after finishing step 1.

三条命令跑通全流程:安装 → 登录 → 下载。

## 1. 环境要求

- Node.js 18 及以上版本(推荐 LTS)
- npm 9+
- 一个可以正常访问 Pixiv 的网络环境

确认 Node 版本:

```bash
node -v   # v18.x 或更高
```

## 2. 安装

```bash
npm install -g pixivflow
pixivflow --help    # 输出帮助信息即安装成功
```

不想全局安装也可以从源码运行:

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
npm run download    # 等价于 pixivflow download
```

## 3. 登录 Pixiv 账号

登录一次即可,凭据会保存在本地配置文件中:

```bash
# 有浏览器的桌面环境:打开浏览器完成授权
pixivflow login

# 无图形界面的服务器:账号密码方式
pixivflow login-headless -u 用户名 -p 密码

# 已有 refresh token:直接注入配置
pixivflow refresh <refresh_token>
```

三种方式的细节与差异见[登录指南](LOGIN.md)。

## 4. 第一次下载

最简单的方式——粘贴任意 Pixiv 链接,支持插画、小说、系列和用户主页:

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
```

文件保存在 `./downloads`(可用配置修改),数据库记录在 `./data/`,
两者配合实现自动去重。

按标签批量收集则需要写一点配置。编辑 `config/standalone.config.json`,
把 `targets` 改成你想要的内容,例如每天收 20 张「風景」插画:

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

然后执行:

```bash
pixivflow download
```

全部字段含义见[配置参考](CONFIG.md);不想手写可以用交互式向导:

```bash
pixivflow setup
```

## 5. 挂机自动收集

配置好 targets 后,启动定时任务即可长期自动运行:

```bash
pixivflow scheduler
```

默认每天凌晨 3 点执行一次(`cron: "0 3 * * *"`,时区 Asia/Shanghai),
修改频率见[配置参考 · scheduler](CONFIG.md)。服务器上推荐用
[Docker Compose](DOCKER.md) 托管,自动重启、自带健康检查。

## 6. 验证环境

```bash
pixivflow health    # 配置完整性、目录可写性、Pixiv 连通性
pixivflow status    # 下载统计与最近记录
pixivflow dirs      # 各类文件的实际保存位置
```

`health` 报告的所有项都为通过状态,就绪。

## 常见的第一天问题

| 现象 | 处理 |
| --- | --- |
| `Authentication Error` | refresh token 失效,重新 `login` 或 `refresh`,详见 [LOGIN](LOGIN.md#token-过期处理) |
| 下载了 0 个作品 | 条件太严(收藏数/日期/limit),先用最小配置跑通再收紧;搜索词大小写与语言要与站内一致 |
| 连不上 Pixiv | 公司网/校园网常见,走代理,见 [CONFIG · network](CONFIG.md#network-网络与代理) |

---

## 相关文档

- [LOGIN](LOGIN.md) — 登录细节与 token 维护
- [CONFIG](CONFIG.md) — 全部配置字段
- [USAGE](USAGE.md) — 六种下载模式与全部命令
- [DOCKER](DOCKER.md) — 服务器部署首选方案
