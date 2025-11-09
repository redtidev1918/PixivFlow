# 🎯 新手完整指南

欢迎使用 **PixivFlow**！这份指南将带你从零开始，快速掌握 PixivFlow 的使用。

---

## 📋 开始之前

### 什么是 PixivFlow？

PixivFlow 是一个**自动化下载工具**，专门用于从 Pixiv（日本最大的插画分享网站）批量下载你喜欢的作品。它完全独立运行，无需浏览器扩展，可以在命令行或服务器上自动执行下载任务。

> ⚠️ **重要说明：后端和脚本的完全独立性**
> 
> - **后端核心**：`src/index.ts` 是完全独立的 CLI 工具，可在任何环境运行（服务器、Docker、CI/CD）
> - **脚本工具**：所有脚本（`scripts/*.sh`）直接调用后端 CLI，完全独立于前端 WebUI
> - **WebUI 可选**：前端界面只是可选的辅助工具，所有核心功能都可以通过命令行完美运行
> - **无需前端**：即使不使用前端界面，所有功能（下载、登录、调度等）都可以通过命令行或脚本使用

**主要特点**：
- 🤖 **自动化**：设置一次，自动运行，无需人工干预
- 🎯 **精准筛选**：按标签、收藏数、日期等条件筛选作品
- 💾 **智能去重**：自动跳过已下载的作品，避免重复
- 🔄 **稳定可靠**：自动重试、断点续传、错误恢复
- 🚀 **完全独立**：后端和脚本完全独立于前端，可在无前端环境下完美运行

### 需要准备什么？

在开始之前，请确保你已经准备好：

| 项目 | 要求 | 说明 |
|------|------|------|
| **Node.js** | 18.0.0 或更高 | JavaScript 运行环境，PixivFlow 基于 Node.js 开发 |
| **npm** | 9.0.0 或更高 | Node.js 的包管理器，用于安装依赖 |
| **Pixiv 账号** | 有效账号 | 用于登录认证，访问 Pixiv API |
| **时间** | 约 10 分钟 | 完成首次配置和测试 |

**登录功能**：

| 项目 | 要求 | 说明 |
|------|------|------|
| **Python** | 3.9+ | 用于登录获取 refresh token |
| **gppt** | `pip install gppt` | Python 包，用于 Pixiv 登录认证 |
| **Chrome/ChromeDriver** | 自动安装 | gppt 内部使用 Selenium 自动化浏览器 |

> ⚠️ **重要说明**：
> - Python 和 gppt 用于登录获取 refresh token
> - 登录模式：在终端中输入用户名和密码，gppt 库自动完成登录流程
> - 如果已有 refresh token 且未过期，则不需要重新登录
> - 如果 refresh token 过期，需要重新登录
> - 可以在已安装 Python 的机器上完成登录，然后将 refresh token 复制到配置文件

> 💡 **提示**：如果你还没有 Pixiv 账号，可以访问 [Pixiv 官网](https://www.pixiv.net/) 免费注册。

### 检查环境

在开始之前，先检查你的环境是否符合要求：

```bash
# 检查 Node.js 版本
node --version    # 应该显示 v18.0.0 或更高

# 检查 npm 版本
npm --version     # 应该显示 9.0.0 或更高
```

**如果版本不符合要求**：
- 访问 [Node.js 官网](https://nodejs.org/) 下载最新版本
- 安装 Node.js 后，npm 会自动安装

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

# 4. 登录账号（首次使用）
pixivflow login

# 5. 开始使用
pixivflow download
```

> **💡 提示**：全局安装后，可以在任何目录直接使用 `pixivflow` 命令，无需进入项目目录。

### 脚本会自动完成什么？

快速启动脚本会按顺序执行以下操作，整个过程大约需要 3-5 分钟：

1. **环境检查** ✅
   - 自动检查 Node.js 和 npm 版本是否符合要求
   - 检查必要的依赖是否已安装

2. **依赖安装** 📦
   - 如果缺少依赖，会自动安装所需组件
   - 包括 Node.js 包
   - 如果需要登录且未安装 Python/gppt，会尝试自动安装

3. **账号登录** 🔐
   - 引导你输入 Pixiv 账号和密码
   - 使用 Python gppt 工具完成登录认证
   - 自动获取并保存认证令牌（refresh token）
   - ⚠️ **注意**：如果已有 refresh token 且未过期，则不需要重新登录

4. **配置设置** ⚙️
   - 引导你设置下载标签、数量等基本配置
   - 询问是否启用定时任务
   - 自动保存配置到 `config/standalone.config.json`

5. **测试下载** 🧪
   - 自动下载一个测试作品
   - 验证配置是否正确，登录是否成功

> 💡 **提示**：整个过程大部分时间在等待依赖安装和下载测试文件，你只需要在提示时输入账号信息即可。

---

## 🎯 手动配置方式

如果你想手动控制每个步骤，或者快速启动脚本遇到问题，可以按照以下步骤手动配置：

### 步骤 1️⃣ - 安装依赖

**什么是依赖？**

依赖是指 PixivFlow 运行所需的外部库和工具。安装依赖就是下载这些组件到你的项目中。

**如何安装**：

打开终端（Terminal），进入项目目录，运行：

```bash
npm install
```

**安装过程**：
- 这个命令会读取 `package.json` 文件，下载所有必需的依赖包
- 首次安装通常需要 1-2 分钟，取决于网络速度
- 如果看到 "added XXX packages" 表示安装成功
- 安装的依赖会保存在 `node_modules/` 目录中

> 💡 **提示**：如果安装速度很慢，可以考虑使用国内镜像源（如淘宝镜像）。

---

### 步骤 2️⃣ - 运行配置向导

配置向导是一个交互式工具，会引导你完成登录和基本配置。

**启动配置向导**：

```bash
# 推荐：使用便捷脚本
./scripts/easy-setup.sh

# 或使用 npm 命令
npm run setup
```

#### 配置向导会引导你完成什么？

配置向导会按顺序执行以下操作：

1. **🔐 终端登录**
   - 在终端中提示你输入 Pixiv 账号（可以是邮箱、用户名或账号名）
   - 然后提示输入密码（输入时不会显示，这是正常的安全措施）
   - 使用 Python gppt 工具完成登录认证
     - 在终端中输入用户名和密码，gppt 库自动完成登录流程
   - ⚠️ **注意**：如果已有 refresh token 且未过期，则不需要重新登录

2. **✅ 自动认证**
   - 登录成功后，自动获取 refresh token（刷新令牌）
   - 自动保存认证信息到配置文件
   - 显示登录成功信息

3. **⚙️ 配置选项**
   - 引导你设置下载标签（如：風景、イラスト等）
   - 设置下载数量（建议首次测试设为 1）
   - 设置筛选条件（如最低收藏数）
   - 询问是否启用定时任务

4. **💾 保存配置**
   - 自动保存所有配置到 `config/standalone.config.json` 文件
   - 显示配置文件路径

#### 首次测试配置建议

如果你是第一次使用，建议使用以下简单配置进行测试：

| 配置项 | 建议值 | 说明 |
|--------|--------|------|
| **搜索标签** | `イラスト` 或 `風景` | 热门标签，作品多，成功率高 |
| **下载数量** | `1` | 首次测试只下载 1 个作品，快速验证 |
| **最低收藏数** | `500`（可选） | 筛选高质量作品，也可以不设置 |
| **定时任务** | `N`（否） | 测试阶段不需要定时任务 |
| **其他选项** | 按 Enter 使用默认值 | 保持默认即可 |

> 💡 **术语解释**：
> - **标签（Tag）**：Pixiv 上用于分类作品的标签，如"风景"、"插画"、"原创"等
> - **Refresh Token**：用于长期访问的认证令牌，登录后自动获取并保存，有效期较长
> - **定时任务（Scheduler）**：按照设定的时间自动执行下载任务，如每天凌晨 3 点自动下载

---

### 步骤 3️⃣ - 运行测试

配置完成后，建议立即运行一次测试，确保一切正常。

**为什么需要测试？**

测试可以验证：
- ✅ 登录是否成功（认证信息是否正确）
- ✅ 配置是否正确（标签是否存在，数量设置是否合理）
- ✅ 网络连接是否正常（能否访问 Pixiv API）
- ✅ 下载功能是否正常（能否成功下载文件）

**运行测试**：

```bash
# 推荐：使用便捷脚本
./scripts/pixiv.sh test

# 或使用 npm 命令
npm run test
```

---

## ✅ 验证结果

### 测试成功的标志

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
[INFO] Refreshed Pixiv access token
[INFO] Saved illustration 137216582 page 1
[INFO] Illustration tag イラスト completed {"downloaded":1}
[INFO] 下载任务完成

════════════════════════════════════════════════════════════════
✅ 验证下载结果
════════════════════════════════════════════════════════════════

✓ 成功下载 1 个文件：
  - 137216582_睡醒猫猫早苗_1.png (4001.32 KB)

🎉 测试完成！
```

**关键信息解读**：
- `✓ 下载目录` - 文件保存位置
- `✓ 下载目标: 1 个` - 配置的下载数量
- `[INFO] Saved illustration` - 成功下载作品
- `✓ 成功下载 1 个文件` - 最终验证结果

> ✅ **已验证**：测试脚本已通过验证，可以正常下载作品。

### 查看下载的文件

测试成功后，下载的文件会保存在：

```
downloads/illustrations/
```

**查看下载的文件**：

```bash
# 查看下载目录（列出所有文件）
ls downloads/illustrations/

# 查看文件详情（包括文件大小、修改时间等）
ls -lh downloads/illustrations/

# 查看文件数量
ls downloads/illustrations/ | wc -l
```

**文件命名规则**：

下载的文件通常按以下格式命名：
```
作品ID_作品标题_页码.扩展名
```

例如：`137216582_睡醒猫猫早苗_1.png`
- `137216582` - 作品 ID
- `睡醒猫猫早苗` - 作品标题
- `1` - 页码（如果是多页作品）
- `.png` - 文件格式

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

# 明确指定下载插画
npm run random -- --illustration
# 或
npm run random -- -i
```

**功能说明**：
- 🎲 **自动选择标签**：从热门标签中随机选择一个
  - 插画标签：風景、イラスト、オリジナル等
  - 小说标签：小説、オリジナル、ホラー、ファンタジー等
- 🔍 **随机选择作品**：从搜索结果中随机选择一个作品
- 🔐 **自动登录**：如果未登录，会自动引导你完成登录
- 📥 **快速体验**：下载 1 个随机作品，快速了解工具功能
- 📚 **支持类型**：支持随机下载插画和小说两种类型

**适用场景**：
- 第一次使用，想快速了解工具功能
- 想下载一些随机作品，不指定特定标签
- 测试工具是否正常工作
- 发现新的小说或插画作品

### 🎯 方式 2：按配置下载（推荐日常使用）

根据你的配置文件设置，执行下载任务。这是最常用的方式。

**使用便捷脚本**：

```bash
# 执行一次下载（根据配置文件中的设置）
./scripts/pixiv.sh once

# 启动定时任务（后台持续运行，按配置的时间自动下载）
./scripts/pixiv.sh run

# 查看运行状态（检查定时任务是否在运行）
./scripts/pixiv.sh status

# 查看健康状态（检查环境、配置、网络等）
./scripts/pixiv.sh health

# 查看运行日志（了解下载进度和错误信息）
./scripts/pixiv.sh logs

# 停止运行（停止定时任务）
./scripts/pixiv.sh stop
```

**使用 npm 命令**：

```bash
# 执行一次下载（根据配置文件）
npm run download

# 启动定时任务（后台持续运行）
npm run scheduler
```

> 💡 **术语解释**：
> - **定时任务（Scheduler）**：按照设定的时间自动执行下载任务，如每天凌晨 3 点自动下载
> - **Cron 表达式**：用于定义定时任务的时间规则，如 `0 3 * * *` 表示每天凌晨 3 点
> - **后台运行**：程序在后台持续运行，不会占用终端窗口

---

## ⚙️ 修改配置

### 方式 1：使用配置管理脚本

```bash
# 交互式编辑配置
./scripts/config-manager.sh edit

# 验证配置是否正确
./scripts/config-manager.sh validate

# 备份当前配置
./scripts/config-manager.sh backup

# 恢复之前的配置
./scripts/config-manager.sh restore
```

### 方式 2：直接编辑配置文件

配置文件位于：`config/standalone.config.json`

```bash
# 使用你喜欢的编辑器
nano config/standalone.config.json
# 或
vim config/standalone.config.json
# 或
code config/standalone.config.json
```

### 方式 3：重新运行配置向导

```bash
./scripts/easy-setup.sh
# 或
npm run setup
```

---

## 🛠️ 常用配置示例

### 示例 1：每天自动下载风景插画

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20,
      "minBookmarks": 1000
    }
  ],
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

### 示例 2：下载多个标签

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
      "minBookmarks": 5000
    }
  ]
}
```

### 示例 3：按日期范围筛选

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "art",
      "limit": 50,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "minBookmarks": 1000
    }
  ]
}
```

### 示例 4：使用目录组织功能

```json
{
  "storage": {
    "illustrationDirectory": "./downloads/illustrations",
    "illustrationOrganization": "byAuthorAndTag"
  },
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

**说明**：文件会按作者和标签自动组织，例如：`downloads/illustrations/作者名/風景/123456_标题_1.jpg`

**支持的组织方式**：
- `flat` - 扁平结构（默认）
- `byAuthor` - 按作者
- `byTag` - 按标签
- `byDate` - 按日期（YYYY-MM）
- `byAuthorAndTag` - 按作者和标签
- `byDateAndAuthor` - 按日期和作者

详细说明请参考 [配置指南](STANDALONE-SETUP-GUIDE.md#4-存储配置)。

---

## 🐛 遇到问题？

### 问题 1：浏览器没有自动打开

**解决方法**：
1. 手动复制终端显示的 URL
2. 在浏览器中粘贴并访问
3. 完成登录后，程序会自动接收回调

---

### 问题 2：找不到匹配的作品

**可能原因**：
- 标签拼写错误或不存在
- 筛选条件过于严格
- 网络连接问题

**解决方法**：
1. 尝试更常见的标签：`イラスト`、`風景`、`art`
2. 降低或移除 `minBookmarks` 限制
3. 检查网络连接
4. 在 Pixiv 网站上搜索确认标签存在

---

### 问题 3：认证失败

**症状**：提示 "认证失败" 或 "refresh_token 无效"

**解决方法**：

```bash
# 重新运行配置向导
./scripts/easy-setup.sh
# 或
npm run setup
```

---

### 问题 4：下载失败或速度慢

**解决方法**：

```bash
# 1. 检查网络连接
ping pixiv.net

# 2. 运行健康检查
./scripts/health-check.sh

# 3. 查看详细日志
./scripts/pixiv.sh logs
```

---

### 🔍 查看健康检查

运行健康检查可以快速诊断问题：

```bash
./scripts/pixiv.sh health
# 或
./scripts/health-check.sh
```

健康检查会验证：
- ✅ Node.js 和 npm 版本
- ✅ 配置文件是否存在且格式正确
- ✅ 认证信息是否有效
- ✅ 网络连接是否正常
- ✅ 下载目录权限

---

## 📊 监控和维护

### 自动监控运行状态

```bash
# 启动监控（会持续显示运行状态）
./scripts/auto-monitor.sh
```

### 自动维护（清理日志等）

```bash
# 运行自动维护
./scripts/auto-maintain.sh
```

### 查看运行日志

```bash
# 查看最近的日志
./scripts/pixiv.sh logs

# 或直接查看日志文件
tail -f data/pixiv-downloader.log
```

---

## 🚀 进阶使用

### 在服务器上运行

如果你想在服务器上无人值守运行 PixivFlow：

#### 方式 1：使用自动部署脚本

```bash
./scripts/auto-deploy.sh
```

#### 方式 2：使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动定时任务
pm2 start "npm run scheduler" --name pixivflow

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

### 自动备份

```bash
# 运行自动备份
./scripts/auto-backup.sh

# 备份会保存到
./backups/backup_YYYY-MM-DD_HH-MM-SS.tar.gz
```

---

## 📚 完整文档

需要更详细的说明？查看完整文档：

### 基础文档

| 文档 | 说明 | 推荐度 |
|------|------|-------|
| [README.md](./README.md) | 完整的项目文档 | ⭐⭐⭐⭐⭐ |
| [QUICKSTART.md](./QUICKSTART.md) | 3 分钟快速上手 | ⭐⭐⭐⭐⭐ |
| [LOGIN_GUIDE.md](./LOGIN_GUIDE.md) | 详细的登录流程说明 | ⭐⭐⭐⭐ |
| [TEST_GUIDE.md](./TEST_GUIDE.md) | 测试和故障排除指南 | ⭐⭐⭐⭐ |

### 进阶文档

| 文档 | 说明 | 推荐度 |
|------|------|-------|
| [STANDALONE-SETUP-GUIDE.md](./STANDALONE-SETUP-GUIDE.md) | 完整配置选项说明 | ⭐⭐⭐⭐ |
| [SCRIPTS_GUIDE.md](./SCRIPTS_GUIDE.md) | 所有脚本详细说明 | ⭐⭐⭐⭐⭐ |
| [CONFIG_GUIDE.md](./CONFIG_GUIDE.md) | 配置文件使用指南 | ⭐⭐⭐⭐⭐ |
| [RANKING_DOWNLOAD_GUIDE.md](./RANKING_DOWNLOAD_GUIDE.md) | 排行榜下载指南 | ⭐⭐⭐⭐ |

---

## 💡 使用提示

### 新手建议

1. **首次使用**：先下载 1-2 个作品测试，确认正常后再增加数量
2. **标签选择**：使用热门标签（如 `イラスト`、`風景`）成功率更高
3. **定时任务**：先手动运行几次，确认无误后再启用定时任务
4. **配置备份**：定期运行 `./scripts/config-manager.sh backup` 备份配置

### 进阶技巧

1. **批量下载**：在 `targets` 数组中配置多个标签
2. **筛选作品**：使用 `minBookmarks` 筛选高质量作品
3. **日期范围**：使用 `startDate` 和 `endDate` 限制作品发布时间
4. **监控状态**：使用 `./scripts/auto-monitor.sh` 持续监控运行状态

### 性能优化

1. **合理设置下载数量**：单次下载不要设置过大的 `limit`
2. **避免频繁执行**：定时任务间隔不要太短（建议至少 6 小时）
3. **定期清理**：使用 `./scripts/auto-maintain.sh` 清理旧日志
4. **网络优化**：如果下载速度慢，考虑使用代理

---

## 🔒 安全提示

### 重要提醒

| 提示 | 说明 |
|------|------|
| 🔐 **保护配置文件** | `config/standalone.config.json` 包含敏感信息 |
| 🚫 **不要分享 Token** | `refreshToken` 等同于账号密码 |
| 💾 **定期备份** | 使用自动备份脚本备份配置和数据 |
| 🔄 **定期更新** | 定期重新运行配置向导更新认证信息 |

### 如果 Token 泄露

1. 立即在 Pixiv 账户设置中撤销授权
2. 修改 Pixiv 账户密码
3. 重新运行配置向导获取新的 token

---

## 📮 获取帮助

遇到问题？这里有多种方式获取帮助：

| 渠道 | 说明 |
|------|------|
| 📖 [查看文档](./README.md) | 查阅完整文档 |
| 🐛 [GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues) | 报告问题 |
| 💬 [GitHub Discussions](https://github.com/zoidberg-xgd/pixivflow/discussions) | 社区交流 |
| ✅ `./scripts/pixiv.sh health` | 运行健康检查 |

---

<div align="center">

## 准备好了？立即开始！

```bash
npm install
./scripts/quick-start.sh
```

---

**PixivFlow** - 让 Pixiv 作品收集变得优雅而高效

Made with ❤️ by [zoidberg-xgd](https://github.com/zoidberg-xgd)

</div>
