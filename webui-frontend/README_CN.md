# PixivFlow WebUI 前端

PixivFlow 的现代化、响应式 Web 界面 - 强大的 Pixiv 内容下载器。

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [文档](#文档)
- [项目结构](#项目结构)
- [贡献指南](#贡献指南)

## ✨ 功能特性

- **🎨 现代化 UI**：基于 Ant Design 构建的简洁直观界面
- **🌍 国际化支持**：完整支持英文和中文
- **📱 响应式设计**：在桌面、平板和移动设备上完美运行
- **⚡ 实时更新**：实时下载进度和状态更新
- **🔍 高级搜索**：强大的筛选和搜索功能
- **📊 统计信息**：全面的下载统计和分析
- **🎯 类型安全**：完整的 TypeScript 支持，提供更好的开发体验
- **♿ 无障碍访问**：符合 WCAG 2.1 无障碍标准

## 🛠 技术栈

- **React 18** - UI 库
- **TypeScript** - 类型安全的 JavaScript
- **Ant Design 5** - UI 组件库
- **React Router 6** - 客户端路由
- **React Query** - 服务器状态管理
- **Axios** - HTTP 客户端
- **i18next** - 国际化框架
- **Vite** - 构建工具和开发服务器
- **Socket.IO** - 实时通信

## 📁 项目结构

```
webui-frontend/
├── src/
│   ├── components/          # 可复用的 React 组件
│   │   ├── ErrorBoundary.tsx
│   │   ├── I18nProvider.tsx
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/               # 页面组件
│   │   ├── Dashboard.tsx    # 概览和统计
│   │   ├── Config.tsx       # 配置管理
│   │   ├── Download.tsx     # 下载管理
│   │   ├── History.tsx      # 下载历史
│   │   ├── Files.tsx        # 文件浏览
│   │   ├── Logs.tsx         # 应用日志
│   │   └── Login.tsx        # 身份认证
│   ├── services/            # API 服务
│   │   └── api.ts           # API 客户端和端点
│   ├── hooks/               # 自定义 React Hooks
│   │   ├── useDebounce.ts
│   │   ├── useLocalStorage.ts
│   │   ├── usePagination.ts
│   │   └── useTableSort.ts
│   ├── utils/               # 工具函数
│   │   ├── dateUtils.ts
│   │   ├── errorCodeTranslator.ts
│   │   ├── formatters.ts
│   │   └── validators.ts
│   ├── constants/           # 应用常量
│   │   ├── theme.ts
│   │   └── index.ts
│   ├── locales/             # i18n 翻译文件
│   │   ├── zh-CN.json
│   │   └── en-US.json
│   ├── i18n/                # i18n 配置
│   │   └── config.ts
│   ├── App.tsx              # 根组件
│   ├── main.tsx             # 应用入口点
│   └── index.css            # 全局样式
├── public/                  # 静态资源
├── check-translations.js    # 翻译完整性检查工具
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🚀 快速开始

### 前置要求

- Node.js 18+ 和 npm
- 运行中的后端服务器（参见主项目 README）

### 安装步骤

1. 克隆仓库：
```bash
git clone <repository-url>
cd PixivBatchDownloader-master/webui-frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 在浏览器中打开 `http://localhost:5173`

更详细的说明，请参阅 [快速开始指南](./docs/getting-started/QUICKSTART.md)。

## 📚 文档

完整的文档位于 [`docs/`](./docs/) 目录：

### 📖 快速开始

- [快速开始指南](./docs/getting-started/QUICKSTART.md) - 快速上手

### 🛠️ 使用指南

- [打包应用使用指南](./docs/guides/PACKAGED_APP_GUIDE.md) - 如何使用打包后的应用

### 🏗️ 构建文档

- [构建指南](./docs/build/BUILD_GUIDE.md) - 完整的构建说明
- [构建脚本](./docs/build/BUILD_README.md) - 构建脚本文档
- [构建和发布](./docs/build/BUILD_RELEASE.md) - 发布流程
- [构建工具](./docs/build/BUILD_TOOLS.md) - 构建工具参考

### 💻 开发文档

- [开发指南](./docs/development/DEVELOPMENT.md) - 开发环境设置和工作流程

### 📦 项目文档

- [更新日志](./docs/project/CHANGELOG.md) - 版本历史和变更

完整的文档索引，请参阅 [文档 README](./docs/README.md)。

## 🤝 贡献指南

我们欢迎贡献！请参阅 [开发指南](./docs/development/DEVELOPMENT.md) 了解详细信息：

- 开发环境设置
- 代码风格和约定
- 开发工作流程
- 测试指南
- 提交 Pull Request

## 📝 许可证

详细信息请参阅主项目的 LICENSE 文件。

## 🙏 致谢

- [Ant Design](https://ant.design/) - UI 组件库
- [React Query](https://tanstack.com/query) - 数据获取和缓存
- [i18next](https://www.i18next.com/) - 国际化框架
- [Vite](https://vitejs.dev/) - 构建工具

## 📧 支持

遇到问题或需要帮助：

- 在 GitHub 上提交 Issue
- 查阅现有文档
- 查看已关闭的 Issue 寻找解决方案

---

由 PixivFlow 团队用 ❤️ 构建

