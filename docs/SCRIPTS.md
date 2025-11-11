# 脚本指南

PixivFlow 提供了丰富的脚本工具，让你无需记忆复杂的 npm 命令。

---

## 🎯 主控制脚本（推荐）

```bash
./scripts/pixiv.sh <command>
```

这是最常用的脚本，提供了所有核心功能。

### 核心命令

| 命令 | 说明 |
|------|------|
| `setup` | 交互式配置向导（首次必须运行） |
| `login` | 登录 Pixiv 账号（交互式） |
| `run` | 启动定时下载器（持续运行） |
| `once` | 立即执行一次下载任务 |
| `test` | 快速测试（下载1个文件验证配置） |
| `random` | 随机下载一个热门标签作品 |
| `status` | 查看下载统计和最近记录 |
| `stop` | 停止正在运行的下载器 |
| `logs` | 查看日志 |

### 环境管理

| 命令 | 说明 |
|------|------|
| `check` | 环境和依赖检查（支持 `--fix` 自动修复） |
| `build` | 编译 TypeScript（通常自动完成） |
| `clean` | 清理编译产物 |
| `update` / `fix` | 一键更新和修复（更新代码、依赖、修复错误） |

### 高级工具

| 命令 | 说明 |
|------|------|
| `config` | 配置管理工具（查看/备份/恢复） |
| `health` | 健康检查和诊断 |
| `monitor` | 启动监控 |
| `maintain` | 运维工具（日志/数据库/更新） |
| `docker` | Docker 管理工具（构建/部署/管理） |

### 使用示例

```bash
# 首次配置
./scripts/pixiv.sh setup

# 登录账号
./scripts/pixiv.sh login

# 测试配置
./scripts/pixiv.sh test

# 随机下载
./scripts/pixiv.sh random

# 手动下载一次
./scripts/pixiv.sh once

# 启动定时器
./scripts/pixiv.sh run

# 查看统计
./scripts/pixiv.sh status

# 查看日志
./scripts/pixiv.sh logs

# 环境检查（自动修复）
./scripts/pixiv.sh check --fix

# 一键更新和修复
./scripts/pixiv.sh update
```

---

## 🔐 登录脚本

```bash
./scripts/login.sh
```

或使用 npm 命令：

```bash
npm run login
```

**登录模式**：
- **交互式**（默认）：打开浏览器窗口，在浏览器中手动登录
- **无头模式**：需要提供用户名和密码参数，不打开浏览器

**选项**：
- `-i, --interactive`：交互式登录（默认）
- `--headless`：无头登录
- `-u, --username <id>`：Pixiv 用户名/邮箱（无头模式必需）
- `-p, --password <pass>`：Pixiv 密码（无头模式必需）

---

## ⚙️ 配置管理脚本

```bash
./scripts/config-manager.sh <command>
```

**命令**：
- `show`：查看配置
- `backup`：备份配置
- `restore`：恢复配置
- `validate`：验证配置
- `edit`：编辑配置

---

## 🐳 Docker 管理脚本

```bash
./scripts/pixiv.sh docker <command>
```

或直接使用：

```bash
./scripts/docker.sh <command>
```

### Docker 命令

| 命令 | 说明 |
|------|------|
| `setup` | 初始化 Docker 环境 |
| `build` | 构建镜像 |
| `deploy` | 部署服务（构建 + 启动） |
| `up` | 启动服务 |
| `down` | 停止服务 |
| `restart` | 重启服务 |
| `status` | 查看服务状态 |
| `logs` | 查看日志 |
| `shell` | 进入容器 |
| `exec` | 在容器中执行命令 |

### 管理命令

| 命令 | 说明 |
|------|------|
| `login` | 在容器中登录 Pixiv 账号 |
| `test` | 运行测试下载 |
| `random` / `rd` | 随机下载作品（支持 `--type`, `--limit`, `--novel`） |
| `check` | 检查 Docker 环境 |
| `clean` | 清理未使用的资源 |
| `clean-all` | 清理所有资源（危险） |

### 使用示例

```bash
# 初始化环境
./scripts/pixiv.sh docker setup

# 构建镜像
./scripts/pixiv.sh docker build

# 部署服务
./scripts/pixiv.sh docker deploy

# 查看状态
./scripts/pixiv.sh docker status

# 查看日志
./scripts/pixiv.sh docker logs -f

# 登录账号
./scripts/pixiv.sh docker login

# 测试下载
./scripts/pixiv.sh docker test

# 随机下载
./scripts/pixiv.sh docker random
```

---

## 🚀 快速开始脚本

```bash
./scripts/quick-start.sh
```

一键完成所有设置（登录、配置、测试），适合首次使用。

---

## 🔧 其他脚本

### 健康检查

```bash
./scripts/health-check.sh
```

### 自动监控

```bash
./scripts/auto-monitor.sh
```

### 自动维护

```bash
./scripts/auto-maintain.sh
```

### 自动备份

```bash
./scripts/auto-backup.sh
```

### 自动部署

```bash
./scripts/auto-deploy.sh
```

---

## 💡 提示

- 所有脚本都直接调用后端 CLI，完全独立于前端 WebUI
- 所有功能都可以在无前端环境下完美运行
- 后端是项目的核心，前端只是可选的辅助工具
- 推荐使用 `./scripts/pixiv.sh` 作为主要入口

---

## 📚 相关文档

- [快速开始指南](./QUICKSTART.md)
- [使用指南](./USAGE.md)
- [Docker 指南](./DOCKER.md)

