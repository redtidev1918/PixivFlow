# 📝 更新日志

所有重要的项目变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [未发布]

### 新增
- ✨ 添加 pixiv-token-getter 适配器支持（2025-11-10）
  - 新增 `pixiv-token-getter-adapter.ts` 模块，支持使用 pixiv-token-getter 库进行登录
  - 支持交互式登录和 headless 登录两种模式
  - 提供更好的登录体验和错误处理
  - 自动检测 pixiv-token-getter 是否可用，如果不可用则回退到其他登录方式
  - Electron 应用自动集成 pixiv-token-getter 适配器
- ✨ 添加全局安装文档和说明（2025-11-08）
  - 在 README.md 中添加全局安装方式说明
  - 在 QUICKSTART.md 中添加全局安装步骤
  - 在 START_HERE.md 中添加全局安装选项
  - 更新命令速查表，包含全局安装后的命令
  - 说明全局安装后的配置文件位置和使用方法
- ✨ 添加 WebUI 删除未完成任务功能（2025-11-08）
  - 支持删除单个未完成任务（`DELETE /api/download/incomplete/:id`）
  - 支持批量删除所有未完成任务（`DELETE /api/download/incomplete`）
  - 前端界面提供删除按钮和批量删除功能
  - 完善的错误处理和用户提示
  - 自动刷新任务列表

### 移除
- 🗑️ 移除移动端支持（iOS/Android）（2025-11-10）
  - 删除 Android 目录和相关移动端代码
  - 删除移动端相关的文档和配置文件
  - 项目现在专注于桌面应用（Windows/macOS/Linux）和 Web 浏览器访问
  - 更新文档，明确说明仅支持桌面应用，不支持移动端
- 🗑️ 清理测试文件和示例文件（2025-11-10）
  - 删除 `test-pixiv-token-getter.ts` 测试文件
  - 删除 `terminal-login-example.ts` 示例文件
  - 删除 `test-concurrency.ts`、`test-download.ts`、`test-scheduled-download.ts` 等测试文件
  - 从 `package.json` 中移除相关的测试脚本（`login:example`、`test:token-getter`）
  - 清理 `dist` 目录中的编译文件

### 测试
- ✅ 测试排名下载功能（2025-11-08）
  - 更新测试配置文件中的 rankingDate 为上周一（2025-10-28）
  - 验证了使用 search API 进行热度排序的优化功能
  - 测试通过：成功处理多个标签的批量下载，正确应用 limit 限制
  - 验证了已存在文件的数据库更新功能

### 修复
- 🐛 修复动态并发控制的速率限制检测逻辑（2025-11-08）
  - 修复了 `processInParallel` 中速率限制检测不正确的问题
  - 现在正确识别 `NetworkError` 的 `isRateLimit` 属性，而不是依赖错误消息字符串匹配
  - 改进了速率限制时的日志输出，包含详细的并发数变化信息
  - 当遇到 429 错误时，系统会自动将并发数减半（不低于最小并发数限制）
  - 连续成功请求后，系统会逐步恢复并发数
- 🐛 修复文件预览 API 在处理包含特殊字符（日文、中文）文件名时的 `ERR_INVALID_CHAR` 错误（2025-11-08）
  - 使用 RFC 5987 格式的 `Content-Disposition` 头，正确编码文件名
  - 改进了路径解析和错误处理
  - 添加了详细的日志记录
  - 测试通过：日文和中文文件名预览正常
- 🐛 修复 WebUI 服务器根路径返回 "Cannot GET /" 错误的问题（2025-11-08）
  - 当未配置静态文件路径时，根路径现在返回 API 信息 JSON 响应
  - 包含服务器版本、可用端点列表和使用说明
  - 改进了开发模式和生产模式的路径处理逻辑
- 🐛 完善 Docker 部署中的前端静态文件配置（2025-11-08）
  - 确保 Docker 镜像正确构建并包含前端静态文件
  - 在 `docker-compose.yml` 中正确配置 `STATIC_PATH` 环境变量
  - 前端文件路径：`/app/webui-frontend/dist`
  - 验证了静态文件服务和 SPA 路由回退功能正常工作
- 🐛 修复文件组织模式中重复类型目录的问题（2025-11-08）
  - 修复了在使用 `byDate`、`byDateAndAuthor`、`byDay`、`byDayAndAuthor` 模式时，当基础目录已经是 `novels` 或 `illustrations` 时，会重复创建类型目录的问题
  - 改进了类型目录检测逻辑，现在通过检查路径最后一段来准确判断是否已包含类型目录
  - 优化了代码结构，提取了日期处理函数，提高了代码可读性和维护性
  - 修复前：`downloads/novels/2025-11-04/novels/文件名.txt`
  - 修复后：`downloads/novels/2025-11-04/文件名.txt`

### 改进
- ⚡ 优化排名下载性能，避免速率限制（2025-11-08）
  - 当使用 `mode: "ranking"` + `filterTag` 时，系统自动使用 search API 的 `popular_desc` 排序
  - 避免了大量 detail API 调用导致的速率限制（429 错误）
  - 显著提升了下载速度和成功率
  - 适用于插画（illustration）和小说（novel）两种类型
  - 当排名 API 返回空结果时，自动回退到搜索模式
- 🔧 优化日期过滤和 popular_desc 模式的处理逻辑（2025-11-09）
  - 修复了日期解析和比较的时区问题，统一使用 UTC 时区
  - 添加了日期格式验证和边界检查（startDate <= endDate）
  - 优化了 `popular_desc` 模式下的 `fetchLimit` 计算，考虑日期过滤后的实际需求
  - 改进了无效日期的处理逻辑，避免在 `popular_desc` 模式下获取过多无效项目
  - 增强了错误处理和日志记录，提供更明确的错误信息和过滤统计
  - 创建了统一的日期工具函数（`src/utils/date-utils.ts`），提高代码复用性
  - 在 `popular_desc` 模式 + 日期过滤时，自动增加获取数量（最多 10 倍）以确保有足够结果
  - 当结果不足时，系统会发出警告并记录详细信息
- 📚 更新了 README 和相关文档，添加了 WebUI 功能说明
- 📝 完善了 WebUI 文档，添加了文件预览 API 修复说明
- 📝 更新了所有相关文档，反映最新的 API 端点和功能

### 计划中
- 添加更多下载模式
- 性能优化
- UI 改进

---

## [2.0.0] - 2025-11

### 新增
- ✨ 完整的 TypeScript 重写
- ✨ 独立的命令行工具，无需浏览器扩展
- ✨ 定时任务支持（Cron 表达式）
- ✨ 智能去重功能（SQLite 数据库）
- ✨ 断点续传功能
- ✨ 自动重试机制
- ✨ 详细的日志系统
- ✨ 配置向导（交互式设置）
- ✨ 多种下载模式（搜索、排行榜）
- ✨ 支持插画和小说下载
- ✨ 灵活的筛选条件（标签、收藏数、日期范围）
- ✨ 随机下载功能
- ✨ 完整的脚本工具集
- ✨ 健康检查功能
- ✨ 自动监控和维护脚本
- ✨ 代理支持（HTTP/HTTPS/SOCKS5）
- ✨ OAuth 2.0 PKCE 认证流程

### 改进
- 🔧 优化下载性能
- 🔧 改进错误处理
- 🔧 增强日志可读性
- 🔧 优化配置管理

### 文档
- 📚 完整的 README
- 📚 详细的使用教程（TUTORIAL.md）
- 📚 新手指南（START_HERE.md）
- 📚 快速开始指南（QUICKSTART.md）
- 📚 登录指南（LOGIN_GUIDE.md）
- 📚 配置指南（CONFIG_GUIDE.md）
- 📚 脚本使用指南（SCRIPTS_GUIDE.md）
- 📚 测试指南（TEST_GUIDE.md）

---

## [1.0.0] - 初始版本

### 新增
- 🎉 初始发布
- 基本的下载功能
- 简单的配置系统

---

## 版本说明

### 版本号格式

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

### 变更类型

- **新增**：新功能
- **改进**：现有功能的改进
- **修复**：Bug 修复
- **移除**：已移除的功能
- **安全**：安全相关的修复
- **文档**：文档更新

---

## 链接

- [GitHub Releases](https://github.com/zoidberg-xgd/pixivflow/releases)
- [完整文档](./README.md)

---

**注意**：详细的变更记录请查看 [GitHub Releases](https://github.com/zoidberg-xgd/pixivflow/releases)。

