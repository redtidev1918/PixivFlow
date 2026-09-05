# Android（Termux）安装指南

> **English:** This guide explains how to run PixivFlow on Android with Termux:
> obtaining the correct Termux distribution, installing the package toolchain needed
> by the native better-sqlite3 module, installing the CLI globally, injecting your
> Pixiv refresh token without a desktop browser, editing configuration for phone
> storage limits, keeping the scheduler alive in the background with tmux or nohup,
> and a troubleshooting table for build, permission, and process-killing issues.

本文档面向想在 Android 手机上长期挂机收集的用户：没有桌面浏览器、有更严格的文件权限与后台存活限制。
Termux 场景只覆盖 CLI 用法；WebUI 与 Docker 部署不在本文范围（后者见 [DOCKER.md](./DOCKER.md)，仅限服务器）。

## 适用场景

在没有常开电脑的情况下，用手机挂机跑定时下载。局限性同样明确：better-sqlite3 需要本地编译，登录的浏览器自动化链路受限，系统会积极回收后台进程。
若有一台能装 Docker 的机器，优先选 Docker 部署，可省去本章全部环境适配。

## 前置要求

### 获取 Termux

以下两个渠道任选其一：

- F-Droid：<https://f-droid.org/packages/com.termux/>（推荐）
- GitHub Releases：<https://github.com/termux/termux-app/releases>

不要使用 Google Play 版本。该版本已停止维护，且与上述渠道的环境不能混用。

### 安装工具链

```bash
# 更新包索引与基础组件
pkg update && pkg upgrade

# Node.js 运行时与 npm
pkg install -y nodejs npm

# 编译工具链：better-sqlite3 是原生模块，必须本地编译
pkg install -y python3 make clang

# 版本核验
node -v               # 需要 v22.12+；建议使用 Termux 当前提供的受支持版本
npm -v                # 9 以上
python3 --version
make --version | head -1
clang --version | head -1
```

如需把下载结果写到手机公共存储（相册可见的位置），先做一次存储授权：

```bash
termux-setup-storage   # 弹出系统授权框，同意后生成 ~/storage/shared 等链接
```

## 分步安装

### 全局安装（推荐）

```bash
npm install -g pixivflow
pixivflow --help      # 打印帮助即安装成功
```

npm 找不到匹配的预编译二进制时会现场编译 better-sqlite3，耗时数分钟、CPU 占满属正常现象。
编译报错（典型为 gyp 提示 `android_ndk_path` 未定义）时按顺序处理：

```bash
pkg reinstall -y python3 make clang    # 确认三件套齐全
npm cache clean --force
npm install -g pixivflow --build-from-source
```

仍失败时退回源码方案：

```bash
git clone https://github.com/redtidev1918/PixivFlow.git ~/PixivFlow
cd ~/PixivFlow
npm install
npm run build
npm link               # 把构建产物注册为全局 pixivflow 命令
```

本文所有示例统一使用 `pixivflow <命令>` 形式；命令全集见[快速开始](./QUICKSTART.md)。

## 登录

Termux 里登录有一条硬约束：没有可弹出的桌面 Chrome 窗口，交互式 `pixivflow login` 通常卡在拉起浏览器这一步（登录优先级为 pixiv-token-getter → Puppeteer → Python gppt，Puppeteer 在 Android 上基本不可用）。
推荐先在一台有浏览器的设备上完成认证，再把 token 注入手机：

### 方式一：跨设备注入 token（推荐）

```bash
# 在电脑上执行，登录成功后从输出或其配置文件中取 refresh_token；细节见 LOGIN.md
pixivflow login

# 回到 Termux，把 token 写入本机配置并验证
pixivflow refresh <你的_refresh_token>
pixivflow health       # 认证项通过即成功
```

`refresh` 命令专为无图形界面环境设计，会把 token 自动写入当前生效的配置文件。

### 方式二：无头登录（备用）

```bash
pixivflow login-headless -u 用户名 -p 密码
```

该方式依赖浏览器自动化，Android 上是否可用取决于具体环境，失败就改走方式一。
开启了两步验证的账号暂不支持自动化登录，详见[登录指南](./LOGIN.md)。

security 提醒：refresh token 等同账号密码，不要发到群聊，不要提交进 Git。

## 配置与下载

### 生成配置

交互式向导会生成完整模板，适合第一次使用：

```bash
pixivflow setup
```

也可以手工写最小配置。先用 `pixivflow dirs` 确认实际路径，再编辑对应位置的 `standalone.config.json`：

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 20 }
  ]
}
```

全部字段说明见[配置手册](./CONFIG.md)；常用键也可以用 CLI 修改：

```bash
pixivflow config show
pixivflow config set storage.downloadDirectory ~/downloads
```

### 存放位置建议

- 首选放在 Termux 私有目录内（如 `~/downloads`）：读写快，不受 Android 存储限制。
- 写公共存储前必须执行过 `termux-setup-storage`，路径形如 `~/storage/shared/PixivFlow`（内部存储根目录下的文件夹）。
- 数据库路径保持默认或指向私有目录；SQLite 放在 FAT 类公共卷上可能出锁定问题。

常用的公共存储链接（`termux-setup-storage` 执行后生成）：

| 链接 | 实际位置 |
| --- | --- |
| `~/storage/shared` | 内部存储根目录 `/sdcard` |
| `~/storage/downloads` | 公共下载目录 `/sdcard/Download` |
| `~/storage/dcim` | 相册目录 `/sdcard/DCIM` |
### 定时任务配置

`targets` 就绪后，可把调度开关写进配置文件，配合 `pixivflow scheduler` 使用：

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

- `cron` 为标准五段式表达式，默认 `0 3 * * *` 即每天凌晨三点执行一轮全部 `targets`。
- `timezone` 控制该表达式的解释时区，默认 Asia/Shanghai。
- 手动跑一轮不想等定时，直接执行 `pixivflow download`。

### 试跑下载

```bash
# 单作品验证：直接粘贴任意 Pixiv 链接
pixivflow download --url https://www.pixiv.net/artworks/123456789

# 按 targets 配置批量下载
pixivflow download

# 环境自检：配置完整性、目录可写性、Pixiv 连通性
pixivflow health
pixivflow dirs         # 列出数据库、日志、插画、小说的实际位置
```

## 保持后台运行

配好 `targets` 后启动定时调度，默认每天 03:00（Asia/Shanghai 时区）执行一轮：

```bash
pixivflow scheduler
```

长期挂着要解决两件事：终端会话断开后进程不死，屏幕熄灭后进程不被冻结。两种验证可行的方案：

### 方案 A：tmux（推荐）

```bash
pkg install -y tmux
tmux new -s pf                    # 创建名为 pf 的会话
pixivflow scheduler               # 在会话内启动
                                  # Ctrl+B 再按 D 分离，进程继续在后台跑
tmux attach -t pf                 # 重新接入查看输出
tmux kill-session -t pf           # 彻底结束
```

### 方案 B：nohup 后台运行

```bash
nohup pixivflow scheduler > $HOME/pixivflow.log 2>&1 &
echo $! > $HOME/pixivflow.pid     # 记下 PID 便于管理
kill $(cat $HOME/pixivflow.pid)   # 停止
```

### 系统保活配合

- 锁屏前申请唤醒锁抑制休眠：`termux-wake-lock`（恢复用 `termux-wake-unlock`）。
- 系统设置里把 Termux 加入电池优化豁免名单，否则 Doze 模式会冻结网络与定时器。
- 保留通知栏常驻通知（保持前台状态），可显著降低被查杀的概率。
- 新版 Android 会清理大量子进程（Phantom Process Killer）。调度器莫名消失而手动运行正常时，优先怀疑此机制。

日常检查命令：

```bash
pixivflow status      # 下载统计与最近记录
pixivflow logs        # 查看运行日志
```

## 常见问题

| 问题 | 现象 | 处理 |
| --- | --- | --- |
| 全局安装 EACCES 报错 | `npm install -g` 权限不足 | 本地安装替代：`mkdir -p ~/pf && cd ~/pf && npm install pixivflow`，再设别名 `alias pixivflow="npx pixivflow"` 并重开 shell；之后所有命令照常以 `pixivflow` 开头 |
| gyp 报 android_ndk_path | better-sqlite3 编译阶段失败 | 补齐 `pkg install python3 make clang`，清理 npm 缓存后带 `--build-from-source` 重试；仍失败改走上文源码路线 |
| command not found: pixivflow | PATH 缺少 npm 全局 bin 目录 | 先试 `npx pixivflow --help`；或长期用别名方案 |
| 外部存储写入失败 | EACCES / 文件系统只读 | 执行 `termux-setup-storage` 并重新授权；个别卷不支持高级特性，重要数据放回私有目录 |
| 数据库初始化失败 | Failed to initialize database | 确认目标目录存在且可写；查看剩余空间 `df -h ~` |
| 登录失败 | Authentication Error | 核对账号密码；开了两步验证暂不支持；Termux 上改用「方式一」注入 token |
| Token 过期 | API 返回 401 Unauthorized | 重新获取 token 后 `pixivflow refresh` 更新；详见[登录指南](./LOGIN.md) |
| 息屏后任务停摆 | 定时不再触发、无新日志 | `termux-wake-lock` 加电池优化白名单加前台常驻（见「系统保活配合」） |
| 校园网/公司网连不上 Pixiv | 网络阻断 | 配代理：配置文件 `network.proxy` 字段，见[配置手册 · network](./CONFIG.md) |

---

## 相关文档

- [快速开始](./QUICKSTART.md) — 命令速览与首次运行流程
- [登录指南](./LOGIN.md) — 三种登录方式与 token 维护
- [配置手册](./CONFIG.md) — targets、存储路径、代理等全部字段
- [使用指南](./USAGE.md) — 下载模式与子命令全集
- [README](https://github.com/redtidev1918/PixivFlow) — 项目概览与文档索引
