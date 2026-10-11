# 登录指南

语言：中文 · [English](en/LOGIN.md)

PixivFlow 登录后会把 refresh token（刷新令牌）写入当前配置。之后下载时会自动使用；令牌失效后需要重新登录。

## 选择登录方式

| 你的环境 | 命令 |
| --- | --- |
| 电脑上有 Chrome / Chromium | `pixivflow login` |
| 已在其他设备登录，持有有效令牌 | `pixivflow refresh -`，从标准输入导入 |
| 服务器需要用账号密码登录 | `pixivflow login-headless -u <用户名> --password-stdin` |

## 在电脑上登录

```bash
pixivflow login
```

程序会打开本机浏览器。按页面提示登录，等待终端显示成功和配置保存结果。

适配器依次尝试 pixiv-token-getter、Puppeteer（Node.js/PKCE），最后才回退 Python gppt；优先浏览器路径不要求 Python。Android 或无头服务器可能缺少可用浏览器，此时可从其他设备导入令牌。

PixivFlow 使用已有的 Chrome / Chromium，不会自动下载浏览器。无法找到浏览器时，先安装或通过 `PUPPETEER_EXECUTABLE_PATH` 指定可执行文件位置。官方 Docker 镜像已包含浏览器。

## 导入已有令牌

将你自己的有效 refresh token 放入本机私有文件 `token.txt`，然后导入。macOS / Linux：

```bash
cat token.txt | pixivflow refresh -
```

Windows PowerShell：

```powershell
Get-Content -Raw token.txt | pixivflow refresh -
```

`-` 表示从标准输入读取，令牌不会作为命令参数出现。文件本身仍包含凭据，请妥善保存或在导入后删除。

也支持 `pixivflow refresh <refresh_token>`；直接把真实令牌写在命令里会让它进入终端历史。`login-token` 和 `set-token` 是该命令的别名。

## 在服务器上用账号密码登录

`login-headless` 不打开可见窗口，但仍需要浏览器运行环境。准备只包含密码的私有文件 `password.txt`。macOS / Linux：

```bash
pixivflow login-headless -u user@example.com --password-stdin < password.txt
```

Windows PowerShell：

```powershell
Get-Content -Raw password.txt | pixivflow login-headless -u user@example.com --password-stdin
```

把示例邮箱换成你的账号。用户名必填；密码可从 `--password-stdin` 读取，也可通过 `-p <密码>` 传入。直接使用 `-p` 或 `echo "真实密码"` 会在命令历史中留下密码。

`-j` 可输出 JSON，供脚本读取。登录和刷新命令的输出可能包含访问令牌与刷新令牌，分享截图或日志前请检查。

## 凭据存在哪里

```bash
pixivflow dirs
```

查看输出中的配置文件位置。凭据保存在该文件的 `pixiv.refreshToken` 字段；多份配置各自保存凭据。安装方式不同，配置未必位于当前目录下的 `config/`。

配置文件、令牌文件和登录输出都包含敏感信息。提交 Issue 时只保留与问题有关的字段，删除账号密码、令牌和 API key。

## Token 过期处理

看到认证失败提示时，重新运行 `pixivflow login`。如果另一台设备上有有效令牌，可按上面的步骤导入。服务器使用账密登录时，重新执行 `login-headless`。

登录显示成功后，检查是否同时保存了配置；若出现保存失败，先用 `pixivflow dirs` 找到文件并检查目录写入权限。网络问题见 [网络与代理](CONFIG.md#network-网络与代理)。

## 相关文档

- [快速开始](QUICKSTART.md)：安装与第一次下载
- [配置参考](CONFIG.md)：`pixiv` 字段和配置路径
- [Docker 部署](DOCKER.md)：容器中的凭据设置
