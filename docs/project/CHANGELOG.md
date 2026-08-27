# 📝 更新日志

所有重要的项目变更都会记录在这个文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [2.0.20] - 2025-11-12

### 新增
- ✨ 添加 `pixivflow dirs` 命令，用于查看所有目录路径信息
  - 支持 `--verbose` 选项查看详细目录信息（绝对路径、是否存在等）
- ✨ 增强 `pixivflow config set` 命令功能
  - 支持快速设置存储目录路径（downloadDirectory、illustrationDirectory、novelDirectory 等）
  - 自动备份原配置，确保配置安全

### 改进
- 🔧 更新文档，添加目录管理和配置设置命令的详细说明
  - 更新 README.md 和 README_EN.md
  - 更新 docs/USAGE.md 添加目录管理章节
  - 更新 docs/CONFIG.md 添加命令行配置管理说明
- 🔧 改进配置管理体验
  - 提供更便捷的目录路径设置方式
  - 增强配置验证和错误提示

---

## [未发布]

### 新增
- ✨ 完整的 TypeScript 重构
  - 重构项目架构，采用依赖注入模式
  - 改进代码组织和模块化
  - 增强类型安全和错误处理
  - 优化性能和可维护性

### 改进
- 🔧 优化项目文档结构
  - 简化文档组织，采用扁平化结构
  - 更新文档路径和链接
  - 改进文档导航和可读性
- 🔧 改进 WebUI 静态文件查找逻辑
  - 添加对 npm 全局安装路径的检测
  - 改进找不到前端文件时的提示信息
  - 提供更清晰的使用说明和步骤指导
- 🔧 统一命令行输出语言为英文
  - 将目录信息输出（`directory-info.ts`）从中文改为英文，保持与 CLI 命令输出的一致性
  - 将配置向导（`setup-wizard.ts`）的所有交互提示和输出从中文改为英文
  - 改进国际化支持，所有命令行输出统一使用英文

---

## [2.0.0] - 2025-11-11

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
- ✨ 支持多种登录方式
  - pixiv-token-getter 适配器
  - Puppeteer 登录
  - Python gppt 登录
- ✨ 支持动态并发调整，自动处理速率限制
- ✨ 支持语言检测和过滤（小说）
- ✨ 支持多标签搜索
- ✨ 支持排行榜下载
- ✨ 支持小说系列下载
- ✨ 支持文件组织方式配置
- ✨ 提供 WebUI 管理界面
- ✨ 提供 Docker 支持
- ✨ 提供丰富的脚本工具
- ✨ 发布到 npm，支持 `npm install -g pixivflow` 一键安装
  - npm 包名：`pixivflow`
  - npm 地址：https://www.npmjs.com/package/pixivflow
  - 版本：2.0.0

### 改进
- 🔧 优化下载性能
- 🔧 改进错误处理
- 🔧 增强日志可读性
- 🔧 优化配置管理
- 🔧 优化错误处理机制
- 🔧 优化日志系统

### 修复
- 🐛 修复各种已知问题

### 文档
- 📚 完整的 README
- 📚 详细的使用教程
- 📚 新手指南
- 📚 快速开始指南
- 📚 登录指南
- 📚 配置指南
- 📚 脚本使用指南
- 📚 测试指南
- 📚 更新文档，添加 npm 安装方式说明

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

- [GitHub Releases](https://github.com/redtidev1918/PixivFlow/releases)
- [完整文档](../README.md)

---

**注意**：详细的变更记录请查看 [GitHub Releases](https://github.com/redtidev1918/PixivFlow/releases)。

---

## 📦 已发布版本索引

npm 包 `pixivflow` 自 2.0.0 起的全部发布记录（数据源：npm registry）。
2.0.20 及更早版本的逐条变更见上方章节；其余版本的变更详情请查看
[GitHub 提交历史](https://github.com/redtidev1918/PixivFlow/commits/master)
或对应版本的 npm 页面。

| 版本 | 发布日期 |
| --- | --- |
| [`2.0.0`](https://www.npmjs.com/package/pixivflow/v/2.0.0) | 2025-11-11 |
| [`2.0.1`](https://www.npmjs.com/package/pixivflow/v/2.0.1) | 2025-11-11 |
| [`2.0.2`](https://www.npmjs.com/package/pixivflow/v/2.0.2) | 2025-11-11 |
| [`2.0.3`](https://www.npmjs.com/package/pixivflow/v/2.0.3) | 2025-11-11 |
| [`2.0.4`](https://www.npmjs.com/package/pixivflow/v/2.0.4) | 2025-11-11 |
| [`2.0.5`](https://www.npmjs.com/package/pixivflow/v/2.0.5) | 2025-11-11 |
| [`2.0.6`](https://www.npmjs.com/package/pixivflow/v/2.0.6) | 2025-11-11 |
| [`2.0.7`](https://www.npmjs.com/package/pixivflow/v/2.0.7) | 2025-11-11 |
| [`2.0.8`](https://www.npmjs.com/package/pixivflow/v/2.0.8) | 2025-11-11 |
| [`2.0.9`](https://www.npmjs.com/package/pixivflow/v/2.0.9) | 2025-11-11 |
| [`2.0.10`](https://www.npmjs.com/package/pixivflow/v/2.0.10) | 2025-11-11 |
| [`2.0.11`](https://www.npmjs.com/package/pixivflow/v/2.0.11) | 2025-11-11 |
| [`2.0.12`](https://www.npmjs.com/package/pixivflow/v/2.0.12) | 2025-11-11 |
| [`2.0.13`](https://www.npmjs.com/package/pixivflow/v/2.0.13) | 2025-11-11 |
| [`2.0.14`](https://www.npmjs.com/package/pixivflow/v/2.0.14) | 2025-11-11 |
| [`2.0.15`](https://www.npmjs.com/package/pixivflow/v/2.0.15) | 2025-11-11 |
| [`2.0.16`](https://www.npmjs.com/package/pixivflow/v/2.0.16) | 2025-11-11 |
| [`2.0.17`](https://www.npmjs.com/package/pixivflow/v/2.0.17) | 2025-11-11 |
| [`2.0.18`](https://www.npmjs.com/package/pixivflow/v/2.0.18) | 2025-11-11 |
| [`2.0.19`](https://www.npmjs.com/package/pixivflow/v/2.0.19) | 2025-11-12 |
| [`2.0.20`](https://www.npmjs.com/package/pixivflow/v/2.0.20) | 2025-11-12 |
| [`2.0.21`](https://www.npmjs.com/package/pixivflow/v/2.0.21) | 2025-11-12 |
| [`2.0.22`](https://www.npmjs.com/package/pixivflow/v/2.0.22) | 2025-11-12 |
| [`2.0.24`](https://www.npmjs.com/package/pixivflow/v/2.0.24) | 2025-11-12 |
| [`2.0.25`](https://www.npmjs.com/package/pixivflow/v/2.0.25) | 2025-11-12 |
| [`2.0.26`](https://www.npmjs.com/package/pixivflow/v/2.0.26) | 2025-11-12 |
| [`2.0.27`](https://www.npmjs.com/package/pixivflow/v/2.0.27) | 2025-11-13 |
| [`2.0.28`](https://www.npmjs.com/package/pixivflow/v/2.0.28) | 2025-11-13 |
| [`2.0.29`](https://www.npmjs.com/package/pixivflow/v/2.0.29) | 2025-11-13 |
| [`2.0.30`](https://www.npmjs.com/package/pixivflow/v/2.0.30) | 2025-11-13 |
| [`2.0.31`](https://www.npmjs.com/package/pixivflow/v/2.0.31) | 2025-11-13 |
| [`2.0.35`](https://www.npmjs.com/package/pixivflow/v/2.0.35) | 2025-11-15 |
| [`2.0.36`](https://www.npmjs.com/package/pixivflow/v/2.0.36) | 2025-11-15 |
| [`2.0.37`](https://www.npmjs.com/package/pixivflow/v/2.0.37) | 2025-11-15 |
| [`2.0.32`](https://www.npmjs.com/package/pixivflow/v/2.0.32) | 2025-11-15 |
| [`2.0.38`](https://www.npmjs.com/package/pixivflow/v/2.0.38) | 2025-11-16 |
| [`2.0.39`](https://www.npmjs.com/package/pixivflow/v/2.0.39) | 2025-11-19 |
| [`2.0.40`](https://www.npmjs.com/package/pixivflow/v/2.0.40) | 2025-11-19 |
| [`2.0.41`](https://www.npmjs.com/package/pixivflow/v/2.0.41) | 2025-12-07 |
