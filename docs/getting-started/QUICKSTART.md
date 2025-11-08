# ⚡ 快速开始 - 3 分钟上手

**PixivFlow** 快速开始指南，让你在 3 分钟内完成配置并开始下载。

---

## 📋 开始之前

### 什么是 PixivFlow？

PixivFlow 是一个**自动化下载工具**，可以帮你从 Pixiv（一个日本插画分享网站）批量下载喜欢的作品。它完全独立运行，无需浏览器扩展，可以在命令行或服务器上自动执行下载任务。

### 环境要求

在开始之前，请确保你的电脑已安装：

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| **Node.js** | 18.0.0 或更高 | JavaScript 运行环境，用于运行 PixivFlow |
| **npm** | 9.0.0 或更高 | Node.js 的包管理器，用于安装依赖 |
| **Pixiv 账号** | - | 用于登录认证，访问 Pixiv 网站 |

### 快速检查环境

打开终端（Terminal），运行以下命令检查版本：

```bash
node --version   # 应该显示 v18.0.0 或更高版本
npm --version    # 应该显示 9.0.0 或更高版本
```

如果版本不符合要求，请先安装或更新 Node.js。访问 [Node.js 官网](https://nodejs.org/) 下载最新版本。

---

## 🚀 快速开始（推荐 ⭐）

### 方式一：本地安装（推荐首次使用）

**最简单的方式 - 一键完成所有设置**：

快速启动脚本会自动完成所有初始设置，你只需要按照提示操作即可。

```bash
# 步骤 1：安装依赖（首次使用需要）
npm install

# 步骤 2：运行快速启动脚本
./scripts/quick-start.sh
```

### 方式二：全局安装（推荐长期使用 ⭐）

如果你想在任何目录下都能使用 `pixivflow` 命令，可以全局安装：

```bash
# 1. 克隆或下载项目
git clone https://github.com/zoidberg-xgd/pixivflow.git
cd pixivflow

# 2. 安装依赖并构建
npm install
npm run build

# 3. 全局安装
npm install -g .
```

**全局安装后，可以在任何目录使用**：

```bash
# 查看帮助
pixivflow --help

# 登录账号
pixivflow login

# 执行下载
pixivflow download

# 启动定时任务
pixivflow scheduler
```

> **💡 提示**：全局安装后，首次使用需要运行 `pixivflow login` 进行登录。

### 脚本会自动完成什么？

快速启动脚本会按顺序执行以下操作：

1. **环境检查** - 自动检查 Node.js 和 npm 版本是否符合要求
2. **依赖安装** - 如果缺少依赖，会自动安装所需组件
3. **账号登录** - 引导你输入 Pixiv 账号和密码，完成登录认证
4. **配置设置** - 引导你设置下载标签、数量等基本配置
5. **测试下载** - 自动下载一个测试作品，验证配置是否正确

> 💡 **提示**：整个过程大约需要 3-5 分钟，大部分时间在等待依赖安装和下载测试文件。

---

## 🎯 手动配置方式

如果你想手动控制每个步骤，或者快速启动脚本遇到问题，可以按照以下步骤手动配置：

### 1️⃣ 安装依赖

在项目目录下打开终端，运行：

```bash
npm install
```

**说明**：
- 这个命令会下载并安装 PixivFlow 运行所需的所有依赖包
- 首次安装通常需要 1-2 分钟，取决于网络速度
- 如果看到 "added XXX packages" 表示安装成功

---

### 2️⃣ 登录 Pixiv 账号

**为什么需要登录？**

PixivFlow 需要访问 Pixiv 的 API（应用程序接口）来下载作品，因此需要你的账号认证信息。登录信息只保存在本地，不会上传到任何服务器。

#### 方式 1：使用登录脚本（推荐 ⭐ 最简单）

这是最简单的方式，适合只需要登录的用户：

```bash
npm run login
```

**操作流程**：
1. 运行命令后，程序会提示你输入 Pixiv 账号（可以是邮箱、用户名或账号名）
2. 然后提示输入密码（输入时不会显示，这是正常的安全措施）
3. 程序会自动使用 Python gppt 工具完成登录认证
   - **交互模式**（默认）：gppt 打开浏览器窗口，用户手动登录
   - **无头模式**（使用 `-u` 和 `-p` 参数）：gppt 在后台运行浏览器，自动输入用户名密码
4. 登录成功后，认证信息会自动保存到配置文件

> ⚠️ **关于 Python 依赖**：
> - Python 和 gppt 用于登录获取 refresh token
> - 两种登录模式都使用 Python gppt 库（gppt 内部使用 Selenium 自动化浏览器）
> - 如果已有 refresh token 且未过期，则不需要重新登录
> - 如果 refresh token 过期，需要重新登录

**特点**：
- ✅ **终端交互**：直接在终端输入，无需打开浏览器
- ✅ **安全可靠**：使用 OAuth 2.0 标准认证流程
- ✅ **自动保存**：登录成功后自动更新配置文件

#### 方式 2：使用配置向导（登录 + 配置一步完成）

如果你想同时完成登录和配置，可以使用配置向导：

```bash
# 使用便捷脚本
./scripts/easy-setup.sh

# 或使用 npm 命令
npm run setup
```

**配置向导会引导你完成**：

1. **🔐 账号登录** - 在终端输入 Pixiv 账号和密码
2. **⚙️ 下载配置** - 设置下载标签、数量、筛选条件等
3. **💾 保存配置** - 自动保存所有配置到 `config/standalone.config.json` 文件

#### 首次测试配置建议

如果你是第一次使用，建议使用以下简单配置进行测试：

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| **搜索标签** | `イラスト` 或 `風景` | 热门标签，作品多，成功率高 |
| **下载数量** | `1` | 首次测试只下载 1 个作品，快速验证 |
| **定时任务** | `N`（否） | 测试阶段不需要定时任务 |
| **其他选项** | 按 Enter 使用默认值 | 保持默认即可 |

> 💡 **术语解释**：
> - **标签（Tag）**：Pixiv 上用于分类作品的标签，如"风景"、"插画"等
> - **Refresh Token**：用于长期访问的认证令牌，登录后自动获取并保存

---

### 3️⃣ 测试下载功能

登录和配置完成后，建议先运行一次测试，确保一切正常。

#### 运行测试

**方式 1：使用便捷脚本（推荐 ⭐）**

```bash
./scripts/pixiv.sh test
```

**方式 2：使用 npm 命令**

```bash
npm run test
```

#### 如何判断测试成功？

如果一切正常，你会看到类似以下的输出：

```
════════════════════════════════════════════════════════════════
📋 加载配置
════════════════════════════════════════════════════════════════

✓ 下载目录: ./downloads/illustrations
✓ 数据库路径: ./data/pixiv-downloader.db
✓ 下载目标: 1 个
  - 类型: illustration
  - 标签: イラスト
  - 数量限制: 1

════════════════════════════════════════════════════════════════
🚀 开始下载
════════════════════════════════════════════════════════════════

[INFO] 开始下载任务
[INFO] Processing illustration tag イラスト
[INFO] Saved illustration 137216582 page 1
[INFO] 下载任务完成

════════════════════════════════════════════════════════════════
✅ 验证下载结果
════════════════════════════════════════════════════════════════

✓ 成功下载 1 个文件：
  - 137216582_睡醒猫猫早苗_1.png (4001.32 KB)

🎉 测试完成！
```

#### 查看下载的文件

测试成功后，下载的文件会保存在：

```
downloads/illustrations/
```

你可以用以下命令查看：

```bash
# 查看下载目录
ls downloads/illustrations/

# 或查看文件详情
ls -lh downloads/illustrations/
```

> ✅ **已验证**：测试脚本已通过验证，可以正常下载作品。

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
| `pixivflow login -u username -p password` | Headless 模式登录 |

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
