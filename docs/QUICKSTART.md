# 快速开始

语言：中文 · [English](en/QUICKSTART.md)

先下载一个作品，确认登录和网络可用，再设置批量收集或定时任务。以下命令在 Windows PowerShell、macOS 或 Linux 终端中执行。

## 安装与登录

需要 Node.js 22.13+、npm 9+、Pixiv 账号，以及能访问 Pixiv 的网络。

```bash
node -v
npm -v
npm install -g pixivflow
pixivflow --help
```

帮助信息能正常显示后，运行登录命令：

```bash
pixivflow login
```

程序会打开本机的 Chrome / Chromium。登录成功后，凭据写入当前配置，后续下载会自动使用。服务器和手机可导入已有的登录令牌，见 [登录指南](LOGIN.md)。

## 下载第一个作品

将示例地址替换成真实作品链接：

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

小说也可以直接下载：

```bash
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=12345678"
```

下载后，查看文件位置和记录：

```bash
pixivflow dirs
pixivflow status
```

`dirs` 显示当前配置、下载目录和数据库的实际路径。全局安装和源码运行的路径可能不同，编辑配置或寻找文件时以这里的输出为准。

想在浏览器中查看记录，可以运行 `pixivflow web`，打开终端显示的地址。默认地址为 `http://localhost:3000`；使用期间保持命令运行。

## 按标签批量下载

首次设置标签、保存位置和计划，可以运行 `pixivflow setup`。已有配置时，先备份再编辑：

```bash
pixivflow config backup
pixivflow config edit
```

将配置中的 `targets` 替换为下面的数组，保留 `pixiv` 等其他字段。这个例子每次最多下载 20 个「風景」插画作品：

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 20 }
  ]
}
```

保存后验证并执行：

```bash
pixivflow config validate
pixivflow download
```

已有下载记录的作品会被跳过，所以新增数量可能少于 `limit`。更多筛选条件见 [配置参考](CONFIG.md)。

## 设置定时下载

在已有配置中添加或修改 `scheduler`。这个例子每天北京时间凌晨 3 点执行：

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

保存后启动：

```bash
pixivflow config validate
pixivflow scheduler
```

程序和电脑需要持续运行；按 `Ctrl+C` 停止。服务器长期运行见 [Docker 部署](DOCKER.md)。

## 遇到问题

| 现象 | 检查方法 |
| --- | --- |
| 命令找不到 | 重新打开终端，检查 npm 全局安装是否成功、可执行文件目录是否在 `PATH` 中 |
| 登录失败或认证过期 | 重新运行 `pixivflow login`，或按 [登录指南](LOGIN.md) 导入有效令牌 |
| 下载 0 个作品 | 检查标签、日期和收藏数条件，也可能是符合条件的作品已下载 |
| 无法连接 Pixiv | 运行 `pixivflow health`，需要代理时参考 [网络配置](CONFIG.md#network-网络与代理) |
| 定时任务没执行 | 检查 `scheduler.enabled`、时区、运行时间，以及进程是否仍在运行 |

求助时附上版本、系统、执行命令和错误信息；先删除账号密码、令牌和其他凭据。
