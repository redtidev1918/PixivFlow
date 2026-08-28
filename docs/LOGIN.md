# 登录指南

> **English:** How PixivFlow authenticates. Three login paths: interactive
> `login` (browser-based, via the pixiv-token-getter library with Puppeteer
> fallback), `login-headless -u -p` for servers without a GUI, and
> `refresh <token>` when you already hold a refresh token. Credentials are
> stored in your local config file — never share it.

PixivFlow 通过 Pixiv 的 OAuth 接口获取凭据。登录一次,refresh token
写入本地配置文件,之后所有命令自动使用,无需重复登录。

## 三种登录方式

| 方式 | 命令 | 适用场景 |
| --- | --- | --- |
| 交互式登录 | `pixivflow login` | 有浏览器的桌面环境(默认推荐) |
| 无头登录 | `pixivflow login-headless -u <用户名> -p <密码>` | 服务器、容器等无图形界面环境 |
| Token 注入 | `pixivflow refresh <refresh_token>` | 已有 refresh token(如在别的机器上登过) |

### 交互式登录

```bash
pixivflow login                 # 打开浏览器完成授权
pixivflow login -u 用户名 -p 密码 # 也可以直接带账号参数
```

底层优先使用 [pixiv-token-getter](https://www.npmjs.com/package/pixiv-token-getter)
(Node.js 实现,零额外依赖);失败时回退到 Puppeteer 自动化;[Python gppt](https://github.com/eggplants/get-pixivpy-token)
仅作为最后备选,正常情况下**不需要安装 Python**。

### 无头登录

```bash
pixivflow login-headless -u user@example.com -p 密码
```

`-u` 和 `-p` 均为必填。加上 `-j` 可以让输出变成 JSON,
方便脚本解析。

### Token 注入

```bash
pixivflow refresh <refresh_token>

# 不让 token 进 shell history / 进程列表的安全写法:
cat token.txt | pixivflow refresh -
```

把一个已有的 refresh token 写入配置并刷新访问令牌,适合:

- 把桌面机器的 token 迁移到服务器;
- Docker 部署时在宿主机准备好凭据(见 [DOCKER · 凭据](DOCKER.md))。

该命令有别名 `login-token` 和 `set-token`,行为一致。

### 无头账密登录(兜底)

```bash
pixivflow login-headless -u user@example.com -p 密码

# 密码不进 shell history 的写法:
echo "密码" | pixivflow login-headless -u user@example.com --password-stdin
```

Puppeteer 无头浏览器自动完成授权(服务器需可安装 Chromium)。密码会经过服务器进程,能避免就避免——优先用 Token 搬运。

## 凭据存在哪里

登录成功后,凭据写进当前使用的配置文件(通常是
`config/standalone.config.json`)的 `pixiv` 段:

```json
{
  "pixiv": {
    "clientId": "...",
    "clientSecret": "...",
    "deviceToken": "pixiv",
    "refreshToken": "<你的 token>",
    "userAgent": "..."
  }
}
```

注意两点:

1. **这个文件等同密码**,不要提交到 git、不要截图分享。
   `config/` 默认已被 .gitignore 排除。
2. 多份配置文件(`pixivflow config` 管理)各自保存各自的凭据。

## Token 过期处理

refresh token 失效时,任何需要认证的命令会报错并提示重新登录:

```
❌ Authentication Error
   Your refresh token may have expired or is invalid.
   Please login again to get a new refresh token:
     • Interactive login:  pixivflow login
     • Headless login:     pixivflow login-headless
```

处理方式二选一:

- 重新执行 `login` / `login-headless`;
- 若在其他设备上有有效 token,`refresh <token>` 直接注入。

## 安全清单

- 配置文件含认证信息,提 Issue 或求助前务必删除 refreshToken 段。
- 用 `refresh` 而非账号密码方式部署到服务器,可以避免密码落盘。
- 账号密码只出现在登录那一刻,不会持久化。

---

## 相关文档

- [QUICKSTART](QUICKSTART.md) — 从安装开始的完整流程
- [DOCKER](DOCKER.md) — 容器场景下的凭据配置
- [CONFIG](CONFIG.md) — 配置文件结构与 pixiv 字段说明
