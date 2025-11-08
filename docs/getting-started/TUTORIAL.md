# 📚 PixivFlow 完整教程

**从零开始，一步步学会使用 PixivFlow 下载 Pixiv 作品**

---

## 📋 关于本教程

本教程是 PixivFlow 的完整使用指南，适合想要深入了解和掌握所有功能的用户。如果你只是想快速上手，建议先查看 [快速开始指南](QUICKSTART.md)。

### 教程特点

- ✅ **从零开始**：不需要任何编程经验，只要会使用电脑即可
- ✅ **步骤详细**：每一步都有详细说明，不会遗漏任何环节
- ✅ **通俗易懂**：用简单直白的话解释，避免专业术语
- ✅ **实际示例**：提供大量实际可用的命令和配置示例
- ✅ **问题解答**：包含常见问题的解决方案

### 教程结构

本教程分为 10 个章节，从基础到进阶，循序渐进：

1. **第一章：了解 PixivFlow** - 什么是 PixivFlow？它能做什么？
2. **第二章：准备工作** - 检查环境、安装项目、验证安装
3. **第三章：首次登录** - 登录 Pixiv 账号，获取认证信息
4. **第四章：配置下载** - 设置下载标签、数量、筛选条件
5. **第五章：开始下载** - 测试下载、正式下载、查看结果
6. **第六章：定时任务** - 设置自动下载，无需人工干预
7. **第七章：高级功能** - 多标签下载、目录组织、代理设置
8. **第八章：WebUI 管理界面** - 使用现代化的 Web 界面管理下载任务
9. **第九章：问题解决** - 常见问题及解决方法
10. **第十章：最佳实践** - 性能优化、存储管理、监控维护

### 目录导航

- [第一章：了解 PixivFlow](#第一章了解-pixivflow)
- [第二章：准备工作](#第二章准备工作)
- [第三章：首次登录](#第三章首次登录)
- [第四章：配置下载](#第四章配置下载)
- [第五章：开始下载](#第五章开始下载)
- [第六章：定时任务](#第六章定时任务)
- [第七章：高级功能](#第七章高级功能)
- [第八章：WebUI 管理界面](#第八章webui-管理界面)
- [第九章：问题解决](#第九章问题解决)
- [第十章：最佳实践](#第十章最佳实践)

---

## 第一章：了解 PixivFlow

### 1.1 什么是 PixivFlow？

**PixivFlow** 是一个自动化下载工具，专门用于从 Pixiv（日本最大的插画分享网站）批量下载你喜欢的作品。

**简单来说**：
- 你想下载 Pixiv 上的插画或小说
- 手动一个个下载太麻烦
- PixivFlow 可以帮你自动批量下载
- 设置一次，以后自动运行

### 1.2 PixivFlow 能做什么？

#### 核心功能

| 功能 | 说明 | 举个例子 |
|------|------|---------|
| **自动下载** | 根据你设置的标签自动下载作品 | 设置"风景"标签，自动下载所有风景插画 |
| **智能筛选** | 按收藏数、日期等条件筛选作品 | 只下载收藏数超过 1000 的作品 |
| **自动去重** | 自动跳过已下载的作品 | 不会重复下载同一个作品 |
| **定时任务** | 按时间自动执行下载 | 每天凌晨 3 点自动下载新作品 |
| **断点续传** | 下载中断后可以继续 | 网络断开后重新运行，会继续下载未完成的 |
| **WebUI 管理** | 现代化的 Web 界面管理下载任务 | 在浏览器中查看文件、管理任务、查看日志 |

#### 支持的内容类型

- **插画（Illustration）**：图片作品，支持多页图片
- **小说（Novel）**：文字作品，保存为文本文件

### 1.3 使用场景

**场景 1：收集设计素材**
- 每天自动下载风景、插画类高质量作品
- 作为设计灵感和素材库

**场景 2：收藏喜欢的作品**
- 按标签批量下载喜欢的作品
- 保存到本地，随时查看

**场景 3：定期更新**
- 每周自动下载新作品
- 保持素材库最新

### 1.4 需要准备什么？

在开始之前，你需要准备：

| 项目 | 要求 | 说明 |
|------|------|------|
| **电脑** | Windows / macOS / Linux | 任何操作系统都可以 |
| **Node.js** | 18.0.0 或更高版本 | 运行 PixivFlow 的环境 |
| **npm** | 9.0.0 或更高版本 | 安装依赖的工具 |
| **Pixiv 账号** | 有效账号 | 用于登录认证 |
| **网络连接** | 能访问 Pixiv 网站 | 可能需要代理（在中国大陆） |

> 💡 **提示**：如果你还没有 Pixiv 账号，可以访问 [Pixiv 官网](https://www.pixiv.net/) 免费注册。

---

## 第二章：准备工作

### 2.1 检查环境

在开始之前，先检查你的电脑是否满足要求。

#### 步骤 1：打开终端

- **Windows**：按 `Win + R`，输入 `cmd`，按 Enter
- **macOS**：按 `Cmd + Space`，输入 `Terminal`，按 Enter
- **Linux**：按 `Ctrl + Alt + T`

#### 步骤 2：检查 Node.js 版本

在终端中输入：

```bash
node --version
```

**期望结果**：
- 应该显示 `v18.0.0` 或更高版本
- 例如：`v18.17.0`、`v20.10.0`

**如果没有安装或版本太低**：
1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载并安装最新版本
3. 安装完成后，重新打开终端，再次检查版本

#### 步骤 3：检查 npm 版本

在终端中输入：

```bash
npm --version
```

**期望结果**：
- 应该显示 `9.0.0` 或更高版本
- 例如：`9.6.7`、`10.2.0`

**说明**：
- npm 通常随 Node.js 一起安装
- 如果 Node.js 安装成功，npm 应该也会自动安装

### 2.2 获取项目

有两种方式获取项目：

#### 方式 1：从 GitHub 下载（推荐）

如果你已经安装了 Git：

```bash
# 克隆项目到当前目录
git clone https://github.com/zoidberg-xgd/pixivflow.git

# 进入项目目录
cd pixivflow
```

**优点**：
- 可以随时使用 `git pull` 更新到最新版本
- 可以查看项目历史记录

#### 方式 2：下载 ZIP 文件

如果你没有安装 Git：

1. 访问 [GitHub 项目页面](https://github.com/zoidberg-xgd/pixivflow)
2. 点击右上角的 "Code" 按钮
3. 选择 "Download ZIP"
4. 解压下载的 ZIP 文件
5. 在终端中进入解压后的项目目录

**例如**（macOS/Linux）：
```bash
cd ~/Downloads/pixivflow-master
```

**例如**（Windows）：
```cmd
cd C:\Users\你的用户名\Downloads\pixivflow-master
```

### 2.3 安装依赖

**什么是依赖？**

依赖是指 PixivFlow 运行所需的外部库和工具。安装依赖就是下载这些组件到你的项目中。

#### 步骤 1：进入项目目录

确保你在项目目录中：

```bash
# 查看当前目录（应该看到 package.json 文件）
ls package.json

# 如果看不到，说明不在项目目录，需要进入
cd /path/to/pixivflow
```

#### 步骤 2：安装依赖

在项目目录中运行：

```bash
npm install
```

**安装过程**：
- 这个命令会读取 `package.json` 文件
- 下载所有必需的依赖包到 `node_modules/` 目录
- 首次安装通常需要 1-3 分钟，取决于网络速度

**如何判断安装成功？**

如果看到类似以下输出，表示安装成功：

```
added 234 packages, and audited 235 packages in 45s
```

**如果安装失败**：
- 检查网络连接
- 检查 Node.js 和 npm 版本是否符合要求
- 确保有足够的磁盘空间

### 2.4 验证安装

安装完成后，建议运行健康检查，确保一切正常：

```bash
# 运行健康检查
./scripts/pixiv.sh health

# 或使用健康检查脚本
./scripts/health-check.sh
```

**健康检查会验证什么？**

| 检查项 | 说明 |
|--------|------|
| ✅ Node.js 版本 | 确保版本符合要求（18+） |
| ✅ npm 版本 | 确保版本符合要求（9+） |
| ✅ Python 版本 | 确保已安装 Python 3.9+（用于登录） |
| ✅ 依赖安装 | 确保所有依赖已正确安装 |
| ✅ 配置文件 | 检查配置文件是否存在（如果已创建） |
| ✅ 目录权限 | 检查下载目录是否有写入权限 |
| ✅ 网络连接 | 检查能否访问 Pixiv API |

**如何判断安装成功？**

如果看到所有项目都是 ✅，说明安装成功！例如：

```
✅ Node.js 版本: v18.17.0 (符合要求)
✅ npm 版本: 9.6.7 (符合要求)
✅ Python 版本: Python 3.11.5 (符合要求)
✅ 依赖已安装
✅ 目录权限正常
✅ 网络连接正常
```

**如果看到 ❌ 怎么办？**

- 检查错误信息，根据提示解决问题
- 查看 [第八章：问题解决](#第八章问题解决) 章节
- 查看 [测试指南](../guides/TEST_GUIDE.md) 获取详细帮助

---

## 第三章：首次登录

### 3.1 为什么需要登录？

**简单解释**：

PixivFlow 需要访问 Pixiv 的 API（应用程序接口）来下载作品。API 就像一扇门，需要钥匙才能打开。登录就是获取这把钥匙的过程。

**重要提示**：

| 提示 | 说明 |
|------|------|
| ✅ **本地保存** | 登录信息只保存在本地配置文件，不会上传到任何服务器 |
| ✅ **安全认证** | 使用 OAuth 2.0 标准安全认证流程 |
| ✅ **长期有效** | 只需要登录一次，refresh token 长期有效（通常几个月到一年） |
| ✅ **可随时更新** | 如果 token 过期，可以随时重新登录 |

> 💡 **术语解释**：
> - **API**：应用程序接口，是 Pixiv 提供给开发者访问其服务的接口
> - **OAuth 2.0**：一种标准的授权协议，用于安全地访问受保护的资源
> - **Refresh Token**：用于长期访问的认证令牌，可以刷新 access token
> - **Access Token**：用于实际访问 API 的令牌，有效期较短（通常 1 小时）

### 3.2 登录方式

PixivFlow 支持两种登录方式：

| 方式 | 特点 | 适用场景 |
|------|------|---------|
| **终端登录**（推荐 ⭐） | 在终端输入用户名密码，使用 Python gppt 登录 | 所有场景，特别是服务器环境 |
| **配置向导** | 登录 + 配置一步完成 | 首次使用，想同时完成登录和配置 |

### 3.3 方式一：终端登录（推荐 ⭐）

这是最简单、最安全的方式，适合所有用户。

#### 步骤 1：运行登录命令

**推荐方式**（使用主控脚本）：

```bash
./scripts/pixiv.sh login
```

**其他方式**：

```bash
# 使用登录脚本
./scripts/login.sh

# 或使用 npm 命令
npm run login
```

#### 步骤 2：输入账号信息

程序会提示你输入：

```
[+]: ID can be email address, username, or account name.
[?]: Pixiv ID: 
```

**输入你的 Pixiv 账号**（可以是以下任意一种）：
- 邮箱地址：`your_email@example.com`
- 用户名：`your_username`
- 账号名：`your_account_name`

然后输入密码（密码不会显示在屏幕上，这是正常的安全措施）：

```
[?]: Password: 
```

**💡 提示**：也可以使用无头登录（通过参数提供用户名密码）：

```bash
./scripts/pixiv.sh login -u your_username -p your_password
```

#### 步骤 3：等待登录完成

程序会自动：
1. ✅ 使用 Python gppt 进行登录（避免被检测）
2. ✅ 获取 refresh token
3. ✅ 保存到配置文件 `config/standalone.config.json`
4. ✅ 显示登录成功信息

**成功示例**：

```
[+]: Success!
access_token: xxxxxx
refresh_token: xxxxxx
expires_in: 3600
[+]: Config updated at /path/to/config/standalone.config.json
```

#### 步骤 4：验证登录

```bash
# 运行测试下载，验证登录是否成功
./scripts/pixiv.sh test

# 或尝试随机下载一个作品
./scripts/pixiv.sh random
```

如果看到下载成功，说明登录完成！

### 3.4 方式二：使用配置向导（登录 + 配置）

如果你想同时完成登录和配置：

```bash
# 运行配置向导
./scripts/easy-setup.sh

# 或使用 npm 命令
npm run setup
```

#### 详细步骤

1. **启动向导**
   - 程序会自动检查环境
   - 引导你选择登录方式

2. **选择登录方式**
   - 选择 `1`：自动登录（在终端输入用户名密码）
   - 选择 `2`：手动输入 refresh token（如果已有）

3. **完成登录**
   - 如果选择自动登录：在终端输入用户名和密码
   - 程序使用 Python gppt 进行登录
   - 自动获取 refresh token

4. **完成配置**
   - 程序自动保存 refresh token 到配置文件
   - 继续引导你完成其他配置（下载目录、标签等）

### 3.5 登录故障排除

#### 问题 1：登录超时或卡住

**症状**：登录过程卡在"Initializing GetPixivToken"或等待超过 2 分钟

**解决方法**：

1. **设置代理**（如果在中国大陆）：

```bash
# 设置 HTTPS 代理
export HTTPS_PROXY=http://127.0.0.1:7890

# 然后运行登录
npm run login
```

**常见代理端口**：
- Clash: `http://127.0.0.1:7890`
- V2Ray: `http://127.0.0.1:10809`
- Shadowsocks: `socks5://127.0.0.1:1080`

2. **检查 Chrome/ChromeDriver**：

```bash
# macOS
brew install chromedriver

# 或使用 pip 安装
pip3 install selenium
```

#### 问题 2：显示"认证失败"

**可能原因**：
- 用户名或密码错误
- 网络连接问题
- Token 已过期

**解决方法**：

```bash
# 重新登录
npm run login

# 或检查网络连接
ping app-api.pixiv.net
```

#### 问题 3：找不到 Python 或 gppt

**解决方法**：

```bash
# 安装 Python（如果未安装）
# macOS
brew install python3

# 安装 gppt
pip3 install gppt
# 或
pip install gppt
```

### 3.6 登录后的下一步

登录成功后，你可以：

1. **立即测试下载**：
   ```bash
   ./scripts/pixiv.sh test
   ```

2. **配置下载选项**（如果使用 `npm run login`）：
   ```bash
   ./scripts/easy-setup.sh
   ```

3. **手动编辑配置**：
   ```bash
   ./scripts/config-manager.sh edit
   ```

---

## 第四章：配置下载

### 4.1 什么是配置？

配置就是告诉 PixivFlow：
- 你想下载什么标签的作品
- 每次下载多少个
- 有什么筛选条件（如最低收藏数）
- 是否启用定时任务

### 4.2 配置方式

有两种方式配置：

| 方式 | 特点 | 适用场景 |
|------|------|---------|
| **配置向导**（推荐新手） | 交互式引导，一步步完成 | 首次使用，不熟悉配置文件 |
| **手动编辑** | 直接编辑配置文件 | 熟悉 JSON 格式，想精确控制 |

### 4.3 方式一：使用配置向导（推荐新手）

#### 步骤 1：启动配置向导

```bash
./scripts/easy-setup.sh

# 或使用 npm 命令
npm run setup
```

#### 步骤 2：按照提示完成配置

配置向导会引导你完成：

1. **🔐 账号登录**（如果还未登录）
   - 在终端输入 Pixiv 账号和密码

2. **⚙️ 下载配置**
   - 选择下载类型（插画/小说）
   - 输入标签名称（如：風景、イラスト）
   - 设置下载数量（建议首次测试设为 1）
   - 设置筛选条件（如最低收藏数）

3. **⏰ 定时任务**（可选）
   - 是否启用定时任务
   - 设置执行时间（Cron 表达式）

4. **💾 保存配置**
   - 自动保存所有配置到 `config/standalone.config.json` 文件

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

### 4.4 方式二：手动编辑配置

如果你熟悉 JSON 格式，可以直接编辑配置文件。

#### 步骤 1：打开配置文件

配置文件位于：`config/standalone.config.json`

```bash
# 使用你喜欢的编辑器
nano config/standalone.config.json
# 或
vim config/standalone.config.json
# 或使用 VS Code
code config/standalone.config.json
```

#### 步骤 2：编辑配置

配置文件是一个 JSON 文件，格式如下：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20,
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

**配置说明**：

| 字段 | 说明 | 示例 |
|------|------|------|
| `type` | 内容类型 | `"illustration"`（插画）或 `"novel"`（小说） |
| `tag` | 搜索标签 | `"風景"`、`"イラスト"`、`"原神"` |
| `limit` | 下载数量 | `20`（每次下载 20 个作品） |
| `searchTarget` | 搜索方式 | `"partial_match_for_tags"`（部分匹配） |

### 4.5 高级筛选配置

#### 按收藏数筛选

只下载收藏数达到一定数量的作品：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20,
      "minBookmarks": 1000
    }
  ]
}
```

**说明**：只下载收藏数 ≥ 1000 的作品

#### 按日期范围筛选

只下载指定日期范围内的作品：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "art",
      "limit": 50,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31"
    }
  ]
}
```

**说明**：只下载 2024 年发布的作品

#### 组合筛选

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 30,
      "minBookmarks": 500,
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "searchTarget": "partial_match_for_tags"
    }
  ]
}
```

**说明**：
- 标签：風景
- 数量：30 个
- 收藏数：≥ 500
- 日期：2024 年
- 搜索方式：部分匹配标签

### 4.6 多标签下载

可以同时配置多个标签：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20,
      "minBookmarks": 1000
    },
    {
      "type": "illustration",
      "tag": "イラスト",
      "limit": 30,
      "minBookmarks": 5000
    },
    {
      "type": "illustration",
      "tag": "原神",
      "limit": 10,
      "minBookmarks": 3000
    }
  ]
}
```

**说明**：每次运行会下载三个标签的作品

### 4.7 验证配置

配置完成后，建议验证配置是否正确：

```bash
# 验证配置
./scripts/config-manager.sh validate

# 或查看配置
./scripts/config-manager.sh show
```

---

## 第五章：开始下载

### 5.1 测试下载（推荐首次使用）

在正式下载之前，建议先运行一次测试，确保配置正确。

#### 为什么需要测试？

测试可以验证：
- ✅ 登录是否成功（认证信息是否正确）
- ✅ 配置是否正确（标签是否存在，数量设置是否合理）
- ✅ 网络连接是否正常（能否访问 Pixiv API）
- ✅ 下载功能是否正常（能否成功下载文件）

#### 运行测试

```bash
# 推荐：使用便捷脚本
./scripts/pixiv.sh test

# 或使用 npm 命令
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

### 5.2 快速体验：随机下载

如果你想快速体验工具功能，可以下载一个随机作品：

```bash
# 随机下载插画（默认）
./scripts/pixiv.sh random

# 或使用 npm 命令
npm run random
```

**功能说明**：
- 🎲 **自动选择标签**：从热门标签中随机选择一个（如：風景、イラスト、オリジナル等）
- 🔍 **随机选择作品**：从搜索结果中随机选择一个作品
- 🔐 **自动登录**：如果未登录，会自动引导登录
- 📥 **快速体验**：下载 1 个随机作品，快速了解工具功能

#### 随机下载小说

```bash
# 随机下载小说
npm run random -- --novel
# 或
npm run random -- -n
```

**功能说明**：
- 📚 从热门小说标签中随机选择一个（如：小説、オリジナル、ホラー等）
- 🎲 从搜索结果中随机选择一个小说
- 📝 下载的小说保存为文本文件（`.txt`），包含标题、作者、标签等信息
- 💾 文件保存在 `downloads/downloads/novels/` 目录中

### 5.3 正式下载

测试成功后，可以开始正式下载了。

#### 方式 1：执行一次下载（推荐）

根据你的配置文件设置，执行一次下载任务：

```bash
# 使用便捷脚本（推荐）
./scripts/pixiv.sh once

# 或使用 npm 命令
npm run download
```

**功能**：
- 根据配置下载所有目标
- 下载完成后退出

#### 方式 2：启动定时任务

如果你配置了定时任务，可以启动后台运行：

```bash
# 启动定时任务（后台持续运行）
./scripts/pixiv.sh run

# 或使用 npm 命令
npm run scheduler
```

**功能**：
- 启动定时任务
- 后台持续运行
- 根据 Cron 表达式自动执行

> 💡 **术语解释**：
> - **定时任务（Scheduler）**：按照设定的时间自动执行下载任务，如每天凌晨 3 点自动下载
> - **Cron 表达式**：用于定义定时任务的时间规则，如 `0 3 * * *` 表示每天凌晨 3 点
> - **后台运行**：程序在后台持续运行，不会占用终端窗口

### 5.4 查看下载结果

#### 文件位置

下载的文件保存在：

```
downloads/
├── illustrations/    # 插画文件
│   ├── 137216582_睡醒猫猫早苗_1.png
│   ├── 137216582_睡醒猫猫早苗_2.png
│   └── ...
└── novels/           # 小说文件
    ├── 123456_小说标题.txt
    └── ...
```

#### 文件命名规则

```
{作品ID}_{作品标题}_{页码}.{扩展名}
```

**示例**：
- `137216582_睡醒猫猫早苗_1.png`
  - `137216582` - 作品 ID
  - `睡醒猫猫早苗` - 作品标题
  - `1` - 页码（如果是多页作品）
  - `.png` - 文件格式

#### 查看下载的文件

```bash
# 查看下载目录（列出所有文件）
ls downloads/illustrations/

# 查看文件详情（包括文件大小、修改时间等）
ls -lh downloads/illustrations/

# 查看文件数量
ls downloads/illustrations/ | wc -l
```

#### 查看下载记录

```bash
# 使用 SQLite 查看
sqlite3 data/pixiv-downloader.db "SELECT * FROM downloaded_artworks LIMIT 10;"
```

### 5.5 智能去重和错误处理

PixivFlow 会自动记录已下载的作品，避免重复下载：

- ✅ 使用 SQLite 数据库记录
- ✅ 自动跳过已下载的作品
- ✅ 支持断点续传

**示例**：

```
[INFO] Illustration 137216582 already downloaded, skipping
[INFO] Saved illustration 137125017 page 1
```

#### 自动错误处理

PixivFlow 还内置了完善的错误处理机制，自动处理无法下载的作品：

- ✅ **自动跳过已删除作品**：如果作品已被作者删除（404 错误），会自动跳过
- ✅ **自动跳过私有作品**：如果作品设置为私有，会自动跳过
- ✅ **自动跳过无法访问的作品**：如果作品因其他原因无法访问，会自动跳过
- ✅ **记录跳过数量**：在下载完成后会显示跳过的作品数量
- ✅ **不会中断流程**：单个作品下载失败不会影响整个下载任务

**错误处理示例**：

```
[DEBUG] Illustration 123456 not found (deleted or private), skipping
[INFO] Skipped 3 illustration(s) (deleted, private, or inaccessible)
[INFO] Illustration tag 風景 completed, { downloaded: 47 }
```

> 💡 **提示**：在批量下载时，遇到已删除或私有的作品是正常现象。PixivFlow 会自动处理这些情况，无需手动干预。

---

## 第六章：定时任务

### 6.1 什么是定时任务？

定时任务允许 PixivFlow 在指定时间自动运行下载，无需人工干预。

**简单来说**：
- 你设置一个时间（如每天凌晨 3 点）
- PixivFlow 会在那个时间自动执行下载
- 你不需要手动运行命令
- 程序会在后台持续运行

**适用场景**：
- 📅 每天自动收集新作品
- 📅 每周备份收藏
- 📅 定期更新素材库

### 6.2 启用定时任务

编辑 `config/standalone.config.json`：

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

**配置说明**：

| 字段 | 说明 | 示例 |
|------|------|------|
| `enabled` | 是否启用 | `true`（启用）或 `false`（禁用） |
| `cron` | Cron 表达式 | `"0 3 * * *"`（每天 3:00） |
| `timezone` | 时区 | `"Asia/Shanghai"`（中国标准时间） |

### 6.3 Cron 表达式详解

Cron 表达式格式：`分 时 日 月 周`

#### 常用表达式

| 表达式 | 说明 | 示例 |
|--------|------|------|
| `0 * * * *` | 每小时执行 | 每小时整点 |
| `0 */6 * * *` | 每 6 小时执行 | 0:00, 6:00, 12:00, 18:00 |
| `0 2 * * *` | 每天 2:00 执行 | 每天凌晨 2 点 |
| `0 3 * * 1-5` | 工作日 3:00 执行 | 周一到周五 3 点 |
| `0 0 * * 0` | 每周日 0:00 执行 | 每周日凌晨 |
| `0 0 1 * *` | 每月 1 号 0:00 执行 | 每月 1 号凌晨 |

#### 详细说明

| 位置 | 字段 | 取值范围 | 特殊字符 |
|------|------|---------|---------|
| 1 | 分钟 | 0-59 | `,` `-` `*` `/` |
| 2 | 小时 | 0-23 | `,` `-` `*` `/` |
| 3 | 日期 | 1-31 | `,` `-` `*` `/` `?` `L` |
| 4 | 月份 | 1-12 | `,` `-` `*` `/` |
| 5 | 星期 | 0-7（0 和 7 都表示周日） | `,` `-` `*` `/` `?` `L` `#` |

**特殊字符说明**：

- `*`：匹配所有值
- `,`：指定多个值（如 `1,3,5`）
- `-`：指定范围（如 `1-5`）
- `/`：指定间隔（如 `*/6` 表示每 6 个单位）
- `?`：不指定值（仅用于日期和星期）

#### 实用示例

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 2 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

**说明**：每天凌晨 2:00（中国时间）执行

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 */4 * * *",
    "timezone": "UTC"
  }
}
```

**说明**：每 4 小时执行一次（UTC 时间）

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 0 * * 0",
    "timezone": "Asia/Tokyo"
  }
}
```

**说明**：每周日 0:00（日本时间）执行

### 6.4 启动定时任务

#### 方式 1：使用主脚本（推荐）

```bash
./scripts/pixiv.sh run
```

**功能**：
- 启动定时任务
- 后台持续运行
- 根据 Cron 表达式自动执行

#### 方式 2：使用 npm 命令

```bash
npm run scheduler
```

#### 方式 3：使用 PM2（服务器环境推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动定时任务
pm2 start "npm run scheduler" --name pixivflow

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

### 6.5 查看定时任务状态

```bash
# 查看运行状态
./scripts/pixiv.sh status

# 查看日志
./scripts/pixiv.sh logs

# 或使用 PM2
pm2 status
pm2 logs pixivflow
```

### 6.6 停止定时任务

```bash
# 停止运行
./scripts/pixiv.sh stop

# 或使用 PM2
pm2 stop pixivflow
```

### 6.7 定时任务最佳实践

#### 1. 选择合适的时间

- ✅ **避开高峰期**：选择凌晨或深夜（如 2:00-4:00）
- ✅ **考虑时区**：确保时区设置正确
- ✅ **避免频繁执行**：建议至少间隔 1 小时

#### 2. 合理设置下载数量

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 50  // 不要设置过大，避免长时间运行
    }
  ]
}
```

#### 3. 监控运行状态

```bash
# 定期检查状态
./scripts/pixiv.sh status

# 查看最近日志
./scripts/pixiv.sh logs | tail -n 50
```

---

## 第七章：高级功能

### 7.1 多标签下载

可以在 `targets` 数组中配置多个标签：

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20,
      "minBookmarks": 1000
    },
    {
      "type": "illustration",
      "tag": "イラスト",
      "limit": 30,
      "minBookmarks": 5000
    },
    {
      "type": "novel",
      "tag": "小説",
      "limit": 10
    }
  ]
}
```

**说明**：每次运行会依次下载三个标签的作品

### 7.2 目录组织功能

PixivFlow 支持多种目录组织方式，让文件自动分类存储：

```json
{
  "storage": {
    "illustrationDirectory": "./downloads/illustrations",
    "illustrationOrganization": "byDateAndAuthor",
    "novelDirectory": "./downloads/novels",
    "novelOrganization": "byDate"
  }
}
```

**支持的组织方式**：

| 模式 | 说明 | 目录结构示例 |
|------|------|-------------|
| `flat` | 扁平结构（默认） | `illustrations/123456_标题_1.jpg` |
| `byAuthor` | 按作者组织 | `illustrations/作者名/123456_标题_1.jpg` |
| `byTag` | 按标签组织 | `illustrations/标签名/123456_标题_1.jpg` |
| `byDate` | 按日期组织（YYYY-MM） | `illustrations/2024-12/illustrations/123456_标题_1.jpg` |
| `byDay` | 按日组织（YYYY-MM-DD） | `illustrations/2024-12-25/illustrations/123456_标题_1.jpg` |
| `byAuthorAndTag` | 按作者和标签 | `illustrations/作者名/标签名/123456_标题_1.jpg` |
| `byDateAndAuthor` | 按日期和作者 | `illustrations/2024-12/作者名/123456_标题_1.jpg` |
| `byDayAndAuthor` | 按日和作者 | `illustrations/2024-12-25/作者名/123456_标题_1.jpg` |

> 💡 **提示**：
> - 使用组织模式可以让下载的文件更有条理，便于管理和查找
> - 使用 `byDate` 或 `byDay` 模式时，会在日期文件夹下自动创建 `novels` 和 `illustrations` 子文件夹，分别存放小说和图片
> - 例如：`{baseDir}/2024-12-25/novels/` 和 `{baseDir}/2024-12-25/illustrations/`

### 7.3 使用代理

如果需要通过代理访问 Pixiv，有两种方式：

#### 方式 1：使用环境变量（推荐 ⭐）

程序会自动从环境变量读取代理配置，无需修改配置文件：

```bash
# 设置代理环境变量（优先级：all_proxy > https_proxy > http_proxy）
export all_proxy=socks5://127.0.0.1:6153
# 或
export https_proxy=http://127.0.0.1:6152
# 或
export http_proxy=http://127.0.0.1:6152

# 然后运行程序
./scripts/pixiv.sh run
```

**支持的代理协议**：
- `http://` - HTTP 代理
- `https://` - HTTPS 代理
- `socks5://` - SOCKS5 代理
- `socks4://` - SOCKS4 代理

**环境变量优先级**：
1. `all_proxy` 或 `ALL_PROXY`（最高优先级）
2. `https_proxy` 或 `HTTPS_PROXY`
3. `http_proxy` 或 `HTTP_PROXY`

#### 方式 2：配置文件设置

```json
{
  "network": {
    "proxy": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 7890,
      "protocol": "http"
    }
  }
}
```

**注意**：如果配置文件中已启用代理，环境变量不会覆盖配置文件中的设置。

**常见代理配置**：

| 代理软件 | 协议 | 地址 | 端口 |
|---------|------|------|------|
| Clash | HTTP | `127.0.0.1` | `7890` |
| V2Ray | HTTP | `127.0.0.1` | `10809` |
| Shadowsocks | SOCKS5 | `127.0.0.1` | `1080` |

### 7.4 服务器部署

#### 使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动定时任务
pm2 start "npm run scheduler" --name pixivflow

# 保存 PM2 配置
pm2 save

# 设置开机自启
pm2 startup
```

#### 使用 systemd（Linux）

创建服务文件 `/etc/systemd/system/pixivflow.service`：

```ini
[Unit]
Description=PixivFlow Automation Downloader
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/pixivflow
ExecStart=/usr/bin/node /path/to/pixivflow/dist/index.js scheduler
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用服务（开机自启）
sudo systemctl enable pixivflow

# 启动服务
sudo systemctl start pixivflow

# 查看状态
sudo systemctl status pixivflow

# 查看日志
sudo journalctl -u pixivflow -f
```

### 7.5 自动监控和维护

#### 自动监控

```bash
# 启动监控（默认 60 秒检查一次）
./scripts/auto-monitor.sh

# 自定义检查间隔（5 分钟）
./scripts/auto-monitor.sh --interval 300

# 后台运行
nohup ./scripts/auto-monitor.sh &
```

**监控内容**：
- 进程运行状态
- CPU 和内存使用
- 下载进度
- 错误日志
- 磁盘空间

#### 自动维护

```bash
# 运行维护
./scripts/auto-maintain.sh

# 使用 cron 设置定期维护（每周日凌晨 1 点）
0 1 * * 0 /path/to/pixivflow/scripts/auto-maintain.sh
```

**维护内容**：
- 清理旧日志文件
- 优化数据库
- 检查并修复损坏文件
- 清理临时文件

#### 自动备份

```bash
# 立即备份
./scripts/auto-backup.sh

# 使用 cron 设置定期备份（每天凌晨 2 点）
0 2 * * * /path/to/pixivflow/scripts/auto-backup.sh
```

**备份内容**：
- 配置文件
- 数据库文件
- 下载记录
- 日志文件

---

## 第八章：WebUI 管理界面

### 8.1 什么是 WebUI？

**WebUI** 是 PixivFlow 提供的现代化 Web 管理界面，让你可以在浏览器中通过图形界面管理下载任务，无需记忆复杂的命令行命令。

**简单来说**：
- 在浏览器中打开一个网页
- 通过点击按钮完成所有操作
- 实时查看下载进度和日志
- 浏览和预览下载的文件

**WebUI 的优势**：
- ✅ **图形化操作**：点击按钮即可完成操作，无需记忆命令
- ✅ **实时监控**：实时查看下载进度、日志和统计信息
- ✅ **文件管理**：在浏览器中浏览和预览下载的文件
- ✅ **跨平台访问**：可以在任何设备上通过浏览器访问（局域网内）
- ✅ **任务管理**：启动、停止下载任务，查看任务历史

### 8.2 安装和启动 WebUI

#### 前置要求

- ✅ 已安装 Node.js 18+ 和 npm 9+
- ✅ 已安装项目依赖（`npm install`）
- ✅ 已构建项目（`npm run build`）

#### 安装步骤

**1. 安装前端依赖**（如果还没有安装）：

```bash
cd webui-frontend
npm install
cd ..
```

**2. 构建项目**：

```bash
# 构建后端 TypeScript 代码
npm run build
```

#### 启动方式

**方式 1：开发模式（推荐用于开发）**

需要两个终端窗口：

**终端 1 - 启动后端：**
```bash
npm run webui
```

**终端 2 - 启动前端开发服务器：**
```bash
npm run webui:frontend
```

然后访问：**http://localhost:5173**

**方式 2：生产模式（推荐用于使用）**

```bash
# 1. 构建前端
npm run webui:build

# 2. 启动后端（会自动提供前端静态文件）
STATIC_PATH=webui-frontend/dist npm run webui
```

然后访问：**http://localhost:3000**

#### 配置端口和主机

可以通过环境变量配置：

```bash
# 自定义端口（默认：3000）
PORT=3001 npm run webui

# 允许局域网访问（默认：localhost）
HOST=0.0.0.0 npm run webui
```

### 8.3 WebUI 功能详解

#### 8.3.1 仪表盘（Dashboard）

**功能**：
- 📊 **总下载数统计**：显示已下载的插画和小说总数
- 📈 **分类统计**：按类型（插画/小说）统计下载数量
- 📅 **最近下载**：显示最近下载的作品列表

**使用场景**：
- 快速了解下载情况
- 查看下载统计信息
- 浏览最近下载的作品

#### 8.3.2 下载任务管理

**功能**：
- ▶️ **启动下载**：启动单个或多个下载任务
- ⏹️ **停止下载**：停止正在运行的下载任务
- 📋 **任务状态**：实时显示任务运行状态（运行中/已完成/已停止/失败）
- 📜 **任务历史**：查看所有下载任务的历史记录
- 🎯 **选择目标**：选择特定标签进行下载

**使用场景**：
- 手动触发下载任务
- 监控下载进度
- 管理下载任务

**操作示例**：

1. **启动所有目标下载**：
   - 点击"下载所有目标"按钮
   - 系统会根据配置文件中的所有目标开始下载

2. **启动特定目标下载**：
   - 在目标列表中选择要下载的标签
   - 点击"下载选中目标"按钮

3. **停止下载**：
   - 如果任务正在运行，点击"停止下载"按钮
   - 任务会安全停止，不会损坏已下载的文件

#### 8.3.3 文件浏览和预览

**功能**：
- 📁 **文件列表**：浏览所有已下载的文件
- 🖼️ **文件预览**：在浏览器中预览图片文件
- 📝 **文件信息**：查看文件大小、下载时间等信息
- 🗑️ **删除文件**：删除不需要的文件（可选功能）

**使用场景**：
- 浏览已下载的作品
- 预览图片文件
- 管理下载的文件

**特殊说明**：
- ✅ **支持特殊字符**：文件名包含日文、中文等特殊字符时也能正常预览
- ✅ **多页作品**：支持预览多页插画的所有页面
- ✅ **小说预览**：可以查看小说文件的文本内容

#### 8.3.4 实时日志查看

**功能**：
- 📝 **实时日志流**：通过 WebSocket 实时接收日志信息
- 🔍 **日志筛选**：按日志级别（INFO、WARN、ERROR）筛选
- 📊 **日志统计**：查看日志统计信息

**使用场景**：
- 监控下载过程
- 排查问题
- 了解下载详情

**日志级别**：
- `INFO`：一般信息（下载进度、成功信息等）
- `WARN`：警告信息（跳过作品、网络问题等）
- `ERROR`：错误信息（下载失败、配置错误等）

#### 8.3.5 配置管理

**功能**：
- ⚙️ **查看配置**：查看当前下载配置
- ✏️ **编辑配置**：在 Web 界面中编辑配置
- ✅ **验证配置**：验证配置是否正确
- 💾 **备份/恢复**：备份和恢复配置文件

**使用场景**：
- 修改下载标签和数量
- 调整筛选条件
- 配置定时任务

**注意事项**：
- 修改配置后需要保存
- 建议在修改前先备份配置
- 配置验证失败时会显示具体错误信息

#### 8.3.6 统计信息

**功能**：
- 📊 **概览统计**：总体下载统计
- 📈 **下载统计**：按时间、类型统计下载数量
- 🏷️ **标签统计**：按标签统计下载数量
- 👤 **作者统计**：按作者统计下载数量

**使用场景**：
- 了解下载趋势
- 分析下载偏好
- 查看下载分布

#### 8.3.7 下载历史管理

**功能**：
- 📜 **历史记录**：查看所有已下载作品的完整历史记录
- 📁 **文件路径显示**：显示每个下载文件的完整保存路径
- 🔍 **快速打开文件**：点击"打开"按钮直接打开文件（使用系统默认程序）
- 🔄 **多维度排序**：支持按下载时间、标题、作者、Pixiv ID 排序
- 🎯 **高级筛选**：支持按类型、标签、作者、日期范围筛选
- 📄 **分页浏览**：支持分页查看，可自定义每页显示数量

**详细功能说明**：

**1. 文件路径和打开功能**
- 每个下载记录都会显示完整的文件保存路径
- 路径过长时会自动省略，鼠标悬停可查看完整路径
- 点击"打开"按钮（📂 图标）可直接打开文件
- 系统会自动使用默认程序打开文件（图片用图片查看器，文本用文本编辑器）

**2. 排序功能**
- **按下载时间排序**（默认）：最新下载的在前或最旧的在前
- **按标题排序**：按作品标题字母顺序排序
- **按作者排序**：按作者名称字母顺序排序
- **按 Pixiv ID 排序**：按作品 ID 数字大小排序
- 点击表头可快速切换排序方式
- 使用排序选择器可选择升序（↑）或降序（↓）

**3. 筛选功能**
- **类型筛选**：筛选插画或小说
- **标签搜索**：输入标签关键词进行模糊搜索
- **作者搜索**：输入作者名称进行模糊搜索（新增功能）
- **日期范围筛选**：选择开始日期和结束日期，筛选特定时间段下载的作品（新增功能）
- **重置筛选**：一键清除所有筛选条件

**4. 表格列说明**
- **Pixiv ID**：作品在 Pixiv 上的唯一标识符（可排序）
- **类型**：插画（🖼️）或小说（📝）
- **标题**：作品标题（可排序）
- **标签**：下载时使用的标签
- **作者**：作品作者名称（可排序）
- **文件路径**：文件在本地保存的完整路径
- **下载时间**：作品下载的时间（可排序）

**使用场景**：
- 查找特定文件：通过筛选和搜索快速找到需要的文件
- 查看下载记录：了解什么时候下载了哪些作品
- 管理文件：通过文件路径信息了解文件存储位置
- 分析下载习惯：通过排序和筛选分析下载偏好
- 快速访问文件：直接打开文件查看内容

**操作示例**：

1. **查找特定作者的作品**：
   - 在"作者搜索"框中输入作者名称
   - 点击搜索或按回车键
   - 表格会显示该作者的所有下载记录

2. **查看特定时间段的下载**：
   - 点击"日期范围"选择器
   - 选择开始日期和结束日期
   - 表格会显示该时间段内下载的所有作品

3. **按标题排序**：
   - 点击表头的"标题"列
   - 或使用排序选择器选择"标题"和排序方向
   - 表格会按标题字母顺序重新排列

4. **打开文件**：
   - 找到要打开的文件所在行
   - 点击该行"文件路径"列中的"打开"按钮
   - 系统会自动打开文件

5. **组合筛选**：
   - 可以同时使用多个筛选条件
   - 例如：筛选"插画"类型 + "原神"标签 + "2024年1月"日期范围
   - 表格会显示同时满足所有条件的记录

**注意事项**：
- 文件路径显示的是文件在服务器上的实际路径
- 如果使用 Docker，路径会显示为容器内的路径
- "打开"功能需要浏览器有权限访问本地文件系统
- 某些浏览器可能不支持直接打开文件，此时可以复制文件路径手动打开

### 8.4 WebUI 使用示例

#### 示例 1：首次使用 WebUI

**步骤**：

1. **启动 WebUI**：
   ```bash
   npm run webui
   ```

2. **在浏览器中打开**：
   - 开发模式：http://localhost:5173
   - 生产模式：http://localhost:3000

3. **查看仪表盘**：
   - 了解当前下载情况
   - 查看统计信息

4. **启动下载任务**：
   - 点击"下载所有目标"
   - 在"下载任务"页面查看进度

5. **浏览文件**：
   - 在"文件"页面浏览已下载的文件
   - 点击文件预览图片

#### 示例 2：使用 WebUI 管理定时任务

**步骤**：

1. **在配置页面设置定时任务**：
   - 启用定时任务
   - 设置 Cron 表达式（如：`0 3 * * *` 表示每天凌晨 3 点）

2. **启动定时任务**（在命令行）：
   ```bash
   ./scripts/pixiv.sh run
   ```

3. **在 WebUI 中监控**：
   - 查看实时日志
   - 监控下载进度
   - 查看任务历史

#### 示例 3：使用 WebUI 快速下载特定标签

**步骤**：

1. **在配置页面添加新目标**：
   - 添加标签：`原神`
   - 设置数量：`10`
   - 保存配置

2. **在下载任务页面**：
   - 选择"原神"标签
   - 点击"下载选中目标"

3. **查看下载结果**：
   - 在文件页面浏览下载的文件
   - 在统计页面查看下载统计

### 8.5 WebUI 常见问题

#### 问题 1：端口被占用

**症状**：启动 WebUI 时提示端口被占用

**解决方法**：

```bash
# 使用其他端口
PORT=3001 npm run webui
```

#### 问题 2：前端无法连接后端

**症状**：前端页面无法加载数据

**解决方法**：

1. **检查后端是否运行**：
   ```bash
   # 查看后端日志
   npm run webui
   ```

2. **检查前端代理配置**：
   - 查看 `webui-frontend/vite.config.ts` 中的代理配置
   - 确保代理地址正确

3. **检查浏览器控制台**：
   - 打开浏览器开发者工具（F12）
   - 查看 Console 和 Network 标签页的错误信息

#### 问题 3：文件预览错误（ERR_INVALID_CHAR）

**症状**：预览包含日文、中文等特殊字符的文件名时出现错误

**状态**：✅ 已修复（2025-11-08）

**说明**：
- 文件预览功能已支持包含特殊字符的文件名（日文、中文等）
- 如果遇到问题，请确保：
  1. 后端服务器已重启以加载最新代码
  2. 使用最新版本的代码

**解决方法**：

```bash
# 重新构建并启动
npm run build
npm run webui
```

#### 问题 4：WebSocket 连接失败

**症状**：实时日志无法显示

**解决方法**：

1. **检查防火墙设置**：确保 WebSocket 端口未被阻止
2. **检查网络连接**：确保前后端在同一网络
3. **查看浏览器控制台**：检查 WebSocket 连接错误

### 8.6 WebUI 最佳实践

#### 1. 开发环境 vs 生产环境

**开发环境**：
- 使用开发模式（前后端分离）
- 支持热重载，方便开发调试
- 访问地址：http://localhost:5173

**生产环境**：
- 使用生产模式（前后端合并）
- 性能更好，资源占用更低
- 访问地址：http://localhost:3000

#### 2. 安全建议

- ✅ **不要暴露到公网**：WebUI 默认只监听 localhost，不要修改为 0.0.0.0 除非必要
- ✅ **使用 HTTPS**：如果需要在公网访问，建议使用反向代理（如 Nginx）配置 HTTPS
- ✅ **设置访问密码**：如果需要在局域网访问，建议添加认证机制

#### 3. 性能优化

- ✅ **定期清理日志**：避免日志文件过大
- ✅ **限制并发下载**：在配置中设置合理的并发数
- ✅ **使用缓存**：浏览器会自动缓存静态资源

#### 4. 与命令行工具结合使用

WebUI 和命令行工具可以同时使用：

- **命令行**：适合自动化、定时任务、服务器部署
- **WebUI**：适合手动操作、监控、文件管理

**推荐组合**：
- 使用命令行设置定时任务
- 使用 WebUI 监控和管理任务
- 使用 WebUI 浏览和预览文件

---

## 第九章：问题解决

### 9.1 登录问题

#### 问题：登录超时

**症状**：登录过程卡住，等待超过 2 分钟

**解决方法**：

1. **设置代理**（如果在中国大陆）：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
npm run login
```

2. **检查网络连接**：

```bash
ping app-api.pixiv.net
```

3. **检查 Python 和 gppt**：

```bash
python3 --version
pip3 list | grep gppt
```

#### 问题：认证失败

**症状**：显示 "认证失败" 或 "401 Unauthorized"

**解决方法**：

```bash
# 方法 1：重新登录（推荐）
npm run login

# 方法 2：重新运行配置向导
./scripts/easy-setup.sh
```

### 9.2 下载问题

#### 问题：找不到匹配的作品

**症状**：搜索结果为空或下载数量为 0

**可能原因**：
- 标签拼写错误或不存在
- 筛选条件过于严格
- 网络连接问题

**解决方法**：

1. 尝试常见标签：`イラスト`、`風景`、`art`
2. 降低 `minBookmarks` 值
3. 检查网络连接和防火墙设置
4. 在 Pixiv 网站上搜索确认标签存在

#### 问题：下载速度慢

**可能原因**：
- 网络连接不稳定
- Pixiv 服务器限流
- 并发数设置过高

**解决方法**：

1. 检查网络连接
2. 在配置文件中调整下载设置：
   ```json
   {
     "download": {
       "concurrency": 2,  // 减少并发数
       "requestDelay": 1000,  // 增加请求延迟
       "dynamicConcurrency": true,  // 保持启用，自动适应速率限制
       "minConcurrency": 1
     }
   }
   ```
3. 增加重试次数和超时时间
4. 使用代理服务器

**提示**：PixivFlow 内置了智能的动态并发控制功能。当检测到速率限制（429 错误）时，系统会自动降低并发数，并在成功请求后逐步恢复。这大大减少了手动调整的需要。

#### 问题：遇到已删除或私有的作品

**症状**：下载过程中提示某些作品无法下载

**说明**：
PixivFlow 内置了完善的错误处理机制，会自动处理以下情况：

- ✅ **自动跳过已删除作品**：如果作品已被作者删除，会自动跳过并继续下载其他作品
- ✅ **自动跳过私有作品**：如果作品设置为私有或需要特殊权限，会自动跳过
- ✅ **自动跳过无法访问的作品**：如果作品因其他原因无法访问（如 404 错误），会自动跳过
- ✅ **记录跳过数量**：在下载完成后会显示跳过的作品数量
- ✅ **不会中断流程**：单个作品下载失败不会影响整个下载任务

**日志示例**：

```
[INFO] Skipped 3 novel(s) (deleted, private, or inaccessible)
[INFO] Illustration tag 風景 completed, { downloaded: 47 }
```

**说明**：
- 404 错误会使用 `debug` 级别日志（静默跳过）
- 其他错误会使用 `warn` 级别日志（记录但继续）
- 所有跳过的作品数量会在任务结束时统一显示

### 9.3 定时任务问题

#### 问题：定时任务没有运行

**症状**：设置了定时任务但没有自动下载

**解决方法**：

1. **检查配置**：

```bash
./scripts/config-manager.sh validate
```

2. **查看运行状态**：

```bash
./scripts/pixiv.sh status
```

3. **检查日志**：

```bash
./scripts/pixiv.sh logs
```

4. **确保程序持续运行**：

```bash
# 使用 PM2 管理进程
pm2 start "npm run scheduler" --name pixivflow
pm2 save
pm2 startup
```

### 9.4 配置问题

#### 问题：配置文件格式错误

**症状**：启动时显示配置错误

**解决方法**：

1. **验证配置**：

```bash
./scripts/config-manager.sh validate
```

2. **查看配置**：

```bash
./scripts/config-manager.sh show
```

3. **使用配置向导重新配置**：

```bash
./scripts/easy-setup.sh
```

### 9.5 获取帮助

如果问题仍未解决：

1. **查看日志**：

```bash
./scripts/pixiv.sh logs
```

2. **运行健康检查**：

```bash
./scripts/pixiv.sh health
```

3. **查看文档**：
   - [README.md](../../README.md) - 项目主文档
   - [LOGIN_GUIDE.md](../guides/LOGIN_GUIDE.md) - 登录详解
   - [STANDALONE-SETUP-GUIDE.md](../guides/STANDALONE-SETUP-GUIDE.md) - 配置详解

4. **提交 Issue**：
   - 访问 [GitHub Issues](https://github.com/zoidberg-xgd/pixivflow/issues)
   - 提供详细的错误信息和日志

---

## 第十章：最佳实践

### 10.1 安全建议

#### 保护配置文件

- ✅ **不要分享配置文件**：`config/standalone.config.json` 包含敏感认证信息（refresh_token）
- ✅ **不要提交到 Git**：确保配置文件在 `.gitignore` 中（已默认排除）
- ✅ **定期备份**：使用 `./scripts/auto-backup.sh` 备份配置和数据
- ✅ **使用强密码**：保护你的 Pixiv 账号

#### 关于 refresh_token

`refresh_token` 等同于你的账号密码，拥有它即可访问你的 Pixiv 账户。

**如果 refresh_token 泄露**：
1. 立即在 Pixiv 账户设置中撤销授权
2. 修改 Pixiv 账户密码
3. 重新运行配置向导获取新的 token

### 9.2 性能优化

#### 合理设置并发数

```json
{
  "download": {
    "concurrency": 3,  // 网络良好可设为 5，不建议超过 5
    "requestDelay": 500,  // API 请求之间的延迟（毫秒），用于避免速率限制
    "dynamicConcurrency": true,  // 启用动态并发调整（默认启用）
    "minConcurrency": 1  // 动态调整时的最小并发数
  }
}
```

**建议**：
- 网络良好：3-5 个并发，`requestDelay` 300-500ms
- 网络一般：1-3 个并发，`requestDelay` 500-1000ms
- 经常遇到速率限制：1-2 个并发，`requestDelay` 1000-2000ms
- 保持 `dynamicConcurrency: true`（默认），系统会自动检测速率限制并调整并发数

**提示**：PixivFlow 内置了智能的动态并发控制功能。当检测到速率限制（429 错误）时，系统会自动将并发数减半，并在成功请求后逐步恢复。这大大减少了手动调整的需要。

#### 控制下载数量

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 50  // 单次不要设置过大，建议 20-50
    }
  ]
}
```

**建议**：
- 单次下载：20-50 个作品
- 定时任务：10-30 个作品
- 避免设置过大，可能导致下载时间过长

#### 调整超时时间

```json
{
  "network": {
    "timeoutMs": 30000  // 网络慢可增加到 60000
  }
}
```

**建议**：
- 网络良好：30000ms（30秒）
- 网络较慢：60000ms（60秒）
- 使用代理：根据代理速度调整

### 9.3 存储管理

#### 定期清理日志

```bash
# 使用自动维护脚本
./scripts/auto-maintain.sh
```

#### 使用目录组织功能分类存储（推荐）

PixivFlow 支持多种目录组织方式，让文件自动分类存储，便于管理和查找。

**配置示例**：

```json
{
  "storage": {
    "illustrationDirectory": "./downloads/illustrations",
    "illustrationOrganization": "byDateAndAuthor",
    "novelDirectory": "./downloads/novels",
    "novelOrganization": "byDate"
  }
}
```

**支持的组织方式**：

| 模式 | 说明 | 适用场景 | 目录结构示例 |
|------|------|---------|-------------|
| `flat` | 扁平结构（默认） | 文件少，不需要分类 | `illustrations/123456_标题_1.jpg` |
| `byAuthor` | 按作者组织 | 关注特定作者 | `illustrations/作者名/123456_标题_1.jpg` |
| `byTag` | 按标签组织 | 按主题分类 | `illustrations/風景/123456_标题_1.jpg` |
| `byDate` | 按日期组织（YYYY-MM） | 按月份查看，自动按类型分类 | `illustrations/2024-12/illustrations/123456_标题_1.jpg` |
| `byDay` | 按日组织（YYYY-MM-DD） | 按日查看，自动按类型分类 | `illustrations/2024-12-25/illustrations/123456_标题_1.jpg` |
| `byAuthorAndTag` | 按作者和标签 | 既想按作者又想按主题 | `illustrations/作者名/風景/123456_标题_1.jpg` |
| `byDateAndAuthor` | 按日期和作者 | 按月份顺序，再按作者分类 | `illustrations/2024-12/作者名/123456_标题_1.jpg` |
| `byDayAndAuthor` | 按日和作者 | 按日顺序，再按作者分类，自动按类型分类 | `illustrations/2024-12-25/作者名/123456_标题_1.jpg` |

> **💡 重要提示**：
> - 使用 `byDate` 或 `byDay` 模式时，会在日期文件夹下自动创建 `novels` 和 `illustrations` 子文件夹
> - 这样可以方便地在同一个日期文件夹下区分不同类型的内容
> - 例如使用 `byDay` 模式时：
>   - 图片保存在：`{baseDir}/2024-12-25/illustrations/123456_标题_1.jpg`
>   - 小说保存在：`{baseDir}/2024-12-25/novels/123456_标题.txt`

**详细目录结构示例**：

**1. 使用 `byAuthor`（按作者组织）**：
```
downloads/
└── illustrations/
    ├── 作者A/
    │   ├── 123456_作品1_1.jpg
    │   └── 123457_作品2_1.jpg
    └── 作者B/
        └── 123458_作品3_1.jpg
```

**2. 使用 `byTag`（按标签组织）**：
```
downloads/
└── illustrations/
    ├── 風景/
    │   ├── 123456_风景1_1.jpg
    │   └── 123457_风景2_1.jpg
    └── イラスト/
        └── 123458_插画1_1.jpg
```

**3. 使用 `byDateAndAuthor`（按日期和作者组织）**：
```
downloads/
└── illustrations/
    └── 2024-12/
        ├── 作者A/
        │   ├── 123456_作品1_1.jpg
        │   └── 123457_作品2_1.jpg
        └── 作者B/
            └── 123458_作品3_1.jpg
```

**4. 使用 `byAuthorAndTag`（按作者和标签组织）**：
```
downloads/
└── illustrations/
    └── 作者A/
        ├── 風景/
        │   └── 123456_风景作品_1.jpg
        └── イラスト/
            └── 123457_插画作品_1.jpg
```

**5. 使用 `byDay`（按日组织，自动按类型分类）**：
```
downloads/
└── 2024-12-25/
    ├── illustrations/
    │   └── 123456_作品标题_1.jpg
    └── novels/
        └── 123457_小说标题.txt
```

**6. 使用 `byDayAndAuthor`（按日和作者组织）**：
```
downloads/
└── illustrations/
    └── 2024-12-25/
        ├── illustrations/
        │   ├── 作者A/
        │   │   └── 123456_作品1_1.jpg
        │   └── 作者B/
        │       └── 123457_作品2_1.jpg
```

**选择建议**：
- 📁 **文件少（< 1000）**：使用 `flat` 或 `byAuthor`
- 📁 **关注特定作者**：使用 `byAuthor` 或 `byDateAndAuthor` 或 `byDayAndAuthor`
- 📁 **按主题分类**：使用 `byTag` 或 `byAuthorAndTag`
- 📁 **长期使用**：使用 `byDate` 或 `byDateAndAuthor`，便于按月查找
- 📁 **每日下载**：使用 `byDay` 或 `byDayAndAuthor`，便于按日查找，自动按类型分类
- 📁 **同时下载图片和小说**：使用 `byDate` 或 `byDay`，会自动在日期文件夹下创建类型子文件夹
- 📁 **大量文件**：使用 `byDateAndAuthor` 或 `byAuthorAndTag`，避免单目录文件过多

详细说明请参考 [配置指南](STANDALONE-SETUP-GUIDE.md#4-存储配置)。

#### 定期备份重要数据

```bash
# 设置定期备份（每天凌晨 2 点）
0 2 * * * /path/to/pixivflow/scripts/auto-backup.sh
```

**备份内容**：
- 配置文件（包含认证信息）
- 数据库文件（下载记录）
- 日志文件

### 9.4 错误处理机制

#### 自动错误处理

PixivFlow 内置了完善的错误处理机制，确保下载任务的稳定性：

**自动处理的错误类型**：
- ✅ **404 错误**：作品已删除或不存在，自动跳过（使用 DEBUG 级别日志）
- ✅ **403 错误**：作品为私有或需要特殊权限，自动跳过
- ✅ **网络超时**：网络连接超时，自动跳过并记录（使用 WARN 级别日志）
- ✅ **其他错误**：任何无法访问的作品，自动跳过并记录

**错误处理特点**：
- 🔄 **不中断流程**：单个作品失败不会影响整个下载任务
- 📊 **统计跳过数量**：任务结束时显示跳过的作品总数
- 📝 **详细日志记录**：所有错误都会记录在日志中，便于排查问题
- 🎯 **智能区分**：区分不同类型的错误，使用不同的日志级别

**日志示例**：

```
[DEBUG] Illustration 123456 not found (deleted or private), skipping
[WARN] Failed to download illustration 789012, { error: 'Network timeout' }
[INFO] Skipped 5 illustration(s) (deleted, private, or inaccessible)
[INFO] Illustration tag 風景 completed, { downloaded: 45 }
```

**最佳实践**：
- ✅ 定期查看日志，了解跳过的作品情况
- ✅ 如果跳过数量异常多，检查网络连接或筛选条件
- ✅ 404 错误是正常现象，无需担心
- ✅ 其他错误（如网络超时）可能需要调整网络配置

### 9.5 监控和维护

#### 定期健康检查

```bash
# 每周运行一次
./scripts/health-check.sh
```

**检查内容**：
- Node.js 和 npm 版本
- Python 版本
- 依赖安装状态
- 配置文件有效性
- 目录权限
- 网络连接

#### 监控运行状态

```bash
# 使用自动监控
./scripts/auto-monitor.sh
```

**监控内容**：
- 进程运行状态
- CPU 和内存使用
- 下载进度
- 错误日志
- 磁盘空间

#### 查看下载统计

```bash
# 使用 SQLite 查看
sqlite3 data/pixiv-downloader.db "SELECT COUNT(*) FROM downloaded_artworks;"

# 查看最近下载的作品
sqlite3 data/pixiv-downloader.db "SELECT * FROM downloaded_artworks ORDER BY created_at DESC LIMIT 10;"
```

### 9.6 使用建议

#### 首次使用

1. ✅ 先运行 `./scripts/pixiv.sh login` 登录（或 `npm run login`）
2. ✅ 运行 `./scripts/pixiv.sh test` 测试下载
3. ✅ 确认配置正确后再启用定时任务

#### 日常使用

1. ✅ 定期检查运行状态：`./scripts/pixiv.sh status`
2. ✅ 查看日志：`./scripts/pixiv.sh logs`
3. ✅ 定期备份配置和数据
4. ✅ 定期清理旧日志文件

#### 服务器部署

1. ✅ 使用 PM2 或 systemd 管理进程
2. ✅ 设置自动监控和备份
3. ✅ 定期检查磁盘空间和日志
4. ✅ 配置日志轮转，避免日志文件过大

---

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| [README.md](../../README.md) | 项目主文档，包含项目介绍和快速开始 |
| [START_HERE.md](START_HERE.md) | 新手完整指南，从安装到使用 |
| [QUICKSTART.md](QUICKSTART.md) | 3 分钟快速上手指南 |
| [LOGIN_GUIDE.md](../guides/LOGIN_GUIDE.md) | 登录详解，包含各种登录方式 |
| [STANDALONE-SETUP-GUIDE.md](../guides/STANDALONE-SETUP-GUIDE.md) | 配置详解，包含所有配置选项 |
| [SCRIPTS_GUIDE.md](../scripts/SCRIPTS_GUIDE.md) | 脚本详解，包含所有可用脚本 |
| [TEST_GUIDE.md](../guides/TEST_GUIDE.md) | 测试指南，帮助验证安装和配置 |
| [RANKING_DOWNLOAD_GUIDE.md](../guides/RANKING_DOWNLOAD_GUIDE.md) | 排行榜下载指南 |

---

<div align="center">

**PixivFlow** - 让 Pixiv 作品收集变得优雅而高效

Made with ❤️ by [zoidberg-xgd](https://github.com/zoidberg-xgd)

</div>