# ⚡ 快速开始 - 3 分钟上手

**PixivFlow** 快速开始指南，让你在 3 分钟内完成配置并开始下载。

> 📖 **需要更详细的说明？** 查看 [新手完整指南](START_HERE.md) 或 [完整教程](TUTORIAL.md)

---

## 📋 环境要求

- **Node.js** 18+ 和 **npm** 9+
- **Pixiv 账号**
- **Python 3.9+** 和 **gppt**（首次登录需要，`pip install gppt`）

快速检查：
```bash
node --version   # 应显示 v18.0.0 或更高
npm --version    # 应显示 9.0.0 或更高
```

---

## 🚀 快速开始（3 步完成）

### 方式一：一键脚本（最简单 ⭐）

```bash
# 1. 安装依赖
npm install

# 2. 运行快速启动脚本（自动完成登录、配置、测试）
./scripts/quick-start.sh
```

### 方式二：手动步骤

```bash
# 1. 安装依赖
npm install

# 2. 登录账号
npm run login

# 3. 开始下载
npm run download
```

### 方式三：全局安装（推荐长期使用）

```bash
# 1. 安装并构建
npm install && npm run build

# 2. 全局安装
npm install -g .

# 3. 使用（在任何目录）
pixivflow login
pixivflow download
```

---

## 📖 详细步骤说明

如需更详细的步骤说明，请查看：
- [📖 新手完整指南](START_HERE.md) - 从零开始的详细教程
- [🔐 登录指南](../guides/LOGIN_GUIDE.md) - 登录流程详解
- [📋 配置指南](../guides/CONFIG_GUIDE.md) - 配置文件使用指南

---

## 📖 下一步：开始正式使用

测试成功后，你可以开始正式使用 PixivFlow 下载作品了。根据你的需求，有以下几种使用方式：

### 🎲 方式 1：快速体验 - 随机下载（推荐首次使用 ⭐）

如果你想快速体验工具功能，可以下载一个随机作品：

```bash
# 随机下载插画（默认）
npm run random

# 随机下载小说
npm run random -- --novel
# 或
npm run random -- -n
```

**功能说明**：
- 🎲 **自动选择标签**：从热门标签中随机选择一个
  - 插画标签：風景、イラスト、オリジナル等
  - 小说标签：小説、オリジナル、ホラー、ファンタジー等
- 🔍 **随机选择作品**：从搜索结果中随机选择一个作品
- 🔐 **自动登录**：如果未登录，会自动引导你完成登录
- 📥 **快速体验**：下载 1 个随机作品，快速了解工具功能
- 📚 **支持类型**：支持随机下载插画和小说两种类型

### 🎯 方式 2：按配置下载（推荐日常使用）

根据你的配置文件设置，执行下载任务：

**使用便捷脚本**：

```bash
# 执行一次下载（根据配置文件中的设置）
./scripts/pixiv.sh once

# 启动定时任务（后台持续运行，按配置的时间自动下载）
./scripts/pixiv.sh run

# 查看运行状态（检查定时任务是否在运行）
./scripts/pixiv.sh status

# 停止运行（停止定时任务）
./scripts/pixiv.sh stop
```

**使用 npm 命令**：

```bash
# 执行一次下载
npm run download

# 启动定时任务（后台持续运行）
npm run scheduler
```

> 💡 **术语解释**：
> - **定时任务（Scheduler）**：按照设定的时间自动执行下载任务，如每天凌晨 3 点自动下载
> - **Cron 表达式**：用于定义定时任务的时间规则，如 `0 3 * * *` 表示每天凌晨 3 点

---

## ⚙️ 常用配置示例

### 如何修改配置？

#### 方式 1：使用配置管理器（推荐）

```bash
# 交互式编辑配置（会打开编辑器）
./scripts/config-manager.sh edit
```

#### 方式 2：直接编辑配置文件

```bash
# 使用文本编辑器打开配置文件
nano config/standalone.config.json
# 或
vim config/standalone.config.json
# 或使用 VS Code
code config/standalone.config.json
```

#### 方式 3：重新运行配置向导

如果想重新配置所有选项：

```bash
./scripts/easy-setup.sh
```

### 实用配置示例

#### 示例 1：每天自动下载风景插画

这个配置会在每天凌晨 3 点自动下载 20 张风景插画：

```json
{
  "targets": [{
    "type": "illustration",
    "tag": "風景",
    "limit": 20
  }],
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *"
  }
}
```

**配置说明**：
- `"type": "illustration"` - 下载类型为插画（图片）
- `"tag": "風景"` - 搜索标签为"风景"
- `"limit": 20` - 每次下载 20 个作品
- `"enabled": true` - 启用定时任务
- `"cron": "0 3 * * *"` - Cron 表达式，表示每天凌晨 3 点执行

#### 示例 2：同时下载多个标签

这个配置会依次下载两个标签的作品：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    },
    {
      "type": "illustration",
      "tag": "イラスト",
      "limit": 30,
      "minBookmarks": 1000
    }
  ]
}
```

**配置说明**：
- 第一个目标：下载 20 个"风景"标签的作品
- 第二个目标：下载 30 个"插画"标签的作品，且收藏数至少 1000

#### 示例 3：多标签搜索（同时包含多个标签）

在 `tag` 字段中用**空格分隔多个标签**，可以搜索同时包含这些标签的作品：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "明日方舟 アークナイツ アーミヤ",
      "limit": 30,
      "mode": "search",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

**配置说明**：
- `"tag": "明日方舟 アークナイツ アーミヤ"` - 搜索同时包含这三个标签的作品（AND关系）
- 支持中文、日文、英文标签混合使用

> 💡 **术语解释**：
> - **minBookmarks**：最低收藏数，用于筛选高质量作品
> - **limit**：下载数量限制，防止一次性下载过多
> - **多标签搜索（AND）**：在 `tag` 中用空格分隔多个标签，表示作品必须同时包含这些标签

> 📚 **更多配置选项**：查看 [配置文件使用指南](../guides/CONFIG_GUIDE.md) 了解所有配置选项和详细示例

#### 示例 4：使用目录组织功能

这个配置会让下载的文件自动按作者和标签分类存储：

```json
{
  "storage": {
    "illustrationOrganization": "byAuthorAndTag"
  },
  "targets": [{
    "type": "illustration",
    "tag": "風景",
    "limit": 20
  }]
}
```

**目录结构示例**：

使用 `byAuthorAndTag` 后，文件会按以下结构存储：

```
downloads/
└── illustrations/
    └── 作者名/
        └── 風景/
            └── 123456_作品标题_1.jpg
```

**支持的组织方式**：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `flat` | 扁平结构（默认） | 所有文件放在一个文件夹 |
| `byAuthor` | 按作者组织 | 想按作者分类查看 |
| `byTag` | 按标签组织 | 想按标签分类查看 |
| `byDate` | 按日期组织（YYYY-MM） | 想按月份查看，自动按类型分类 |
| `byDay` | 按日组织（YYYY-MM-DD） | 想按日查看，自动按类型分类 |
| `byAuthorAndTag` | 按作者和标签 | 既想按作者又想按标签 |
| `byDateAndAuthor` | 按日期和作者 | 按月份顺序，再按作者分类 |
| `byDayAndAuthor` | 按日和作者 | 按日顺序，再按作者分类，自动按类型分类 |

> **💡 提示**：使用 `byDate` 或 `byDay` 模式时，会在日期文件夹下自动创建 `novels` 和 `illustrations` 子文件夹，方便区分不同类型的内容。

详细说明请参考 [配置指南](STANDALONE-SETUP-GUIDE.md#4-存储配置)。

---

## 🐛 常见问题解决

### ❓ 问题 1：登录失败

**可能原因**：
- 用户名或密码输入错误
- 网络连接问题（需要代理）
- Python gppt 工具未安装

**解决方法**：

```bash
# 方法 1：重新登录（推荐）
npm run login

# 方法 2：检查网络连接
ping app-api.pixiv.net

# 方法 3：如果在中国大陆，可能需要设置代理
# 程序会自动从环境变量读取代理配置
export all_proxy=socks5://127.0.0.1:6153
# 或
export https_proxy=http://127.0.0.1:6152
# 或
export http_proxy=http://127.0.0.1:6152

npm run login
```

> 💡 **提示**：
> - 程序会自动从环境变量读取代理配置，无需修改配置文件
> - 环境变量优先级：`all_proxy` > `https_proxy` > `http_proxy`
> - 支持的代理协议：`http://`、`https://`、`socks5://`、`socks4://`
> - 常见代理端口：
>   - Clash: `http://127.0.0.1:7890`
>   - V2Ray: `http://127.0.0.1:10809`
>   - Shadowsocks: `socks5://127.0.0.1:1080`

---

### ❓ 问题 2：找不到作品或下载失败

**可能原因**：
- 标签拼写错误或不存在
- 筛选条件过于严格（如 `minBookmarks` 设置太高）
- 网络连接问题

**解决方法**：

1. **使用常见标签**：`イラスト`、`風景`、`art`、`オリジナル`
2. **降低筛选条件**：减少或移除 `minBookmarks` 限制
3. **检查网络连接**：确保能正常访问 Pixiv 网站
4. **验证标签存在**：在 Pixiv 网站上搜索确认标签是否存在

---

### ❓ 问题 3：认证失败或 Token 过期

**症状**：提示 "认证失败" 或 "refresh_token 无效"

**解决方法**：

```bash
# 方法 1：重新登录（推荐，最简单）
npm run login

# 方法 2：重新运行配置向导（会重新登录并配置）
./scripts/easy-setup.sh
```

> 💡 **说明**：Refresh Token 可能会过期，如果遇到认证失败，重新登录即可。

---

### ❓ 问题 4：需要更多帮助？

如果以上方法都无法解决问题，可以尝试：

```bash
# 运行健康检查（检查环境、配置、网络等）
./scripts/pixiv.sh health

# 查看详细日志（了解具体错误信息）
./scripts/pixiv.sh logs

# 查看帮助信息
./scripts/pixiv.sh help
```

**获取更多帮助**：
- 📖 查看 [完整文档](../../README.md)
- 📖 查看 [登录指南](../guides/LOGIN_GUIDE.md)
- 📖 查看 [测试指南](../guides/TEST_GUIDE.md)

---

## 🛠️ 实用命令速查

### 主要操作

**本地安装方式**：

| 命令 | 说明 |
|------|------|
| `npm run random` | 随机下载一个插画作品（快速体验） |
| `npm run random -- --novel` | 随机下载一个小说作品 |
| `npm run random -- -n` | 随机下载一个小说作品（简写） |
| `./scripts/pixiv.sh test` | 测试下载 |
| `./scripts/pixiv.sh once` | 执行一次 |
| `./scripts/pixiv.sh run` | 启动定时任务 |
| `./scripts/pixiv.sh stop` | 停止运行 |
| `./scripts/pixiv.sh status` | 查看状态 |
| `./scripts/pixiv.sh health` | 健康检查 |
| `./scripts/pixiv.sh logs` | 查看日志 |

**全局安装方式**（如果已全局安装）：

| 命令 | 说明 |
|------|------|
| `pixivflow random` | 随机下载一个插画作品（快速体验） |
| `pixivflow random --novel` | 随机下载一个小说作品 |
| `pixivflow download` | 执行一次下载 |
| `pixivflow scheduler` | 启动定时任务 |
| `pixivflow --help` | 查看帮助信息 |

### 登录管理

**本地安装方式**：

| 命令 | 说明 |
|------|------|
| `npm run login` | 登录 Pixiv 账号（推荐 ⭐，默认使用 Python gppt） |
| `npm run login -- --help` | 查看登录帮助 |

**全局安装方式**（如果已全局安装）：

| 命令 | 说明 |
|------|------|
| `pixivflow login` | 登录 Pixiv 账号（推荐 ⭐） |
| `pixivflow login --help` | 查看登录帮助 |

### 配置管理

| 命令 | 说明 |
|------|------|
| `./scripts/easy-setup.sh` | 配置向导 |
| `./scripts/config-manager.sh edit` | 编辑配置 |
| `./scripts/config-manager.sh backup` | 备份配置 |
| `./scripts/config-manager.sh validate` | 验证配置 |

### 监控维护

| 命令 | 说明 |
|------|------|
| `./scripts/auto-monitor.sh` | 自动监控 |
| `./scripts/auto-maintain.sh` | 自动维护 |
| `./scripts/health-check.sh` | 详细检查 |

---

## 📚 完整文档

需要更多信息？查看：

| 文档 | 说明 |
|------|------|
| [START_HERE.md](START_HERE.md) | 新手完整指南 |
| [README.md](../../README.md) | 项目主文档 |
| [LOGIN_GUIDE.md](../guides/LOGIN_GUIDE.md) | 登录详解 |
| [SCRIPTS_GUIDE.md](../scripts/SCRIPTS_GUIDE.md) | 脚本详解 |
| [CONFIG_GUIDE.md](../guides/CONFIG_GUIDE.md) | 配置文件使用指南 |
| [RANKING_DOWNLOAD_GUIDE.md](../guides/RANKING_DOWNLOAD_GUIDE.md) | 排行榜下载指南 |
| [TEST_GUIDE.md](../guides/TEST_GUIDE.md) | 测试指南 |

---

<div align="center">

## 🎉 开始使用吧！

```bash
npm install
./scripts/easy-setup.sh
./scripts/pixiv.sh test
```

**PixivFlow** - 让 Pixiv 作品收集变得优雅而高效

</div>
