# PixivFlow WebUI 前端

> Modern, responsive web interface for PixivFlow - A powerful Pixiv content downloader.

PixivFlow 的现代化、响应式 Web 界面 - 强大的 Pixiv 内容下载器。

> 📖 **English Version**: See [README_EN.md](./README_EN.md) for the English translation.

## 📋 目录 (Table of Contents)

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [文档](#文档)
- [项目结构](#项目结构)
- [贡献指南](#贡献指南)

## ✨ 功能特性 (Features)

- **🎨 现代化 UI (Modern UI)**: 基于 Ant Design 构建的简洁直观界面
- **🌍 国际化支持 (Internationalization)**: 完整支持英文和中文
- **📱 响应式设计 (Responsive)**: 在桌面、平板和移动设备上完美运行
- **⚡ 实时更新 (Real-time Updates)**: 实时下载进度和状态更新
- **🔍 高级搜索 (Advanced Search)**: 强大的筛选和搜索功能
- **📊 统计信息 (Statistics)**: 全面的下载统计和分析
- **🎯 类型安全 (Type-Safe)**: 完整的 TypeScript 支持，提供更好的开发体验
- **♿ 无障碍访问 (Accessible)**: 符合 WCAG 2.1 无障碍标准

## 🛠 技术栈 (Tech Stack)

- **React 18** - UI 库 (UI library)
- **TypeScript** - 类型安全的 JavaScript (Type-safe JavaScript)
- **Ant Design 5** - UI 组件库 (UI component library)
- **React Router 6** - 客户端路由 (Client-side routing)
- **React Query** - 服务器状态管理 (Server state management)
- **Axios** - HTTP 客户端 (HTTP client)
- **i18next** - 国际化框架 (Internationalization framework)
- **Vite** - 构建工具和开发服务器 (Build tool and dev server)
- **Socket.IO** - 实时通信 (Real-time communication)

## 📁 项目结构 (Project Structure)

```
webui-frontend/
├── src/
│   ├── components/          # 可复用的 React 组件 (Reusable React components)
│   │   ├── ErrorBoundary.tsx
│   │   ├── I18nProvider.tsx
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/               # 页面组件 (Page components)
│   │   ├── Dashboard.tsx    # 概览和统计 (Overview and statistics)
│   │   ├── Config.tsx       # 配置管理 (Configuration management)
│   │   ├── Download.tsx     # 下载管理 (Download management)
│   │   ├── History.tsx      # 下载历史 (Download history)
│   │   ├── Files.tsx        # 文件浏览 (File browser)
│   │   ├── Logs.tsx         # 应用日志 (Application logs)
│   │   └── Login.tsx        # 身份认证 (Authentication)
│   ├── services/            # API 服务 (API services)
│   │   └── api.ts           # API 客户端和端点 (API client and endpoints)
│   ├── hooks/               # 自定义 React Hooks (Custom React hooks)
│   │   ├── useDebounce.ts
│   │   ├── useLocalStorage.ts
│   │   ├── usePagination.ts
│   │   └── useTableSort.ts
│   ├── utils/               # 工具函数 (Utility functions)
│   │   ├── dateUtils.ts
│   │   ├── errorCodeTranslator.ts
│   │   ├── formatters.ts
│   │   └── validators.ts
│   ├── constants/           # 应用常量 (Application constants)
│   │   ├── theme.ts
│   │   └── index.ts
│   ├── locales/             # i18n 翻译文件 (i18n translations)
│   │   ├── zh-CN.json
│   │   └── en-US.json
│   ├── i18n/                # i18n 配置 (i18n configuration)
│   │   └── config.ts
│   ├── App.tsx              # 根组件 (Root component)
│   ├── main.tsx             # 应用入口点 (Application entry point)
│   └── index.css            # 全局样式 (Global styles)
├── public/                  # 静态资源 (Static assets)
├── check-translations.js    # 翻译完整性检查工具 (Translation completeness checker)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🚀 快速开始 (Quick Start)

### 前置要求 (Prerequisites)

- Node.js 18+ 和 npm
- 运行中的后端服务器（参见主项目 README）
- Backend server running (see main project README)

### 安装步骤 (Installation)

1. 克隆仓库 (Clone the repository):
```bash
git clone <repository-url>
cd PixivBatchDownloader-master/webui-frontend
```

2. 安装依赖 (Install dependencies):
```bash
npm install
```

3. 启动开发服务器 (Start the development server):
```bash
npm run dev
```

4. 在浏览器中打开 `http://localhost:5173` (Open your browser and navigate to `http://localhost:5173`)

更详细的说明，请参阅 [快速开始指南](./docs/getting-started/QUICKSTART.md)。  
For more detailed instructions, see [Quick Start Guide](./docs/getting-started/QUICKSTART.md).

## 📚 文档 (Documentation)

完整的文档位于 [`docs/`](./docs/) 目录：  
Comprehensive documentation is available in the [`docs/`](./docs/) directory:

### 📖 快速开始 (Getting Started)

- [快速开始指南](./docs/getting-started/QUICKSTART.md) - 快速上手 (Get up and running quickly)

### 🛠️ 使用指南 (Guides)

- [打包应用使用指南](./docs/guides/PACKAGED_APP_GUIDE.md) - 如何使用打包后的应用 (Using the packaged application)

### 🏗️ 构建文档 (Building)

- [构建指南](./docs/build/BUILD_GUIDE.md) - 完整的构建说明 (Complete build instructions)
- [构建脚本](./docs/build/BUILD_README.md) - 构建脚本文档 (Build script documentation)
- [构建和发布](./docs/build/BUILD_RELEASE.md) - 发布流程 (Release process)
- [构建工具](./docs/build/BUILD_TOOLS.md) - 构建工具参考 (Build tools reference)

### 💻 开发文档 (Development)

- [开发指南](./docs/development/DEVELOPMENT.md) - 开发环境设置和工作流程 (Development setup and workflow)

### 📦 项目文档 (Project)

- [更新日志](./docs/project/CHANGELOG.md) - 版本历史和变更 (Version history and changes)

完整的文档索引，请参阅 [文档 README](./docs/README.md)。  
For the complete documentation index, see [Documentation README](./docs/README.md).

## 🤝 贡献指南 (Contributing)

我们欢迎贡献！请参阅 [开发指南](./docs/development/DEVELOPMENT.md) 了解详细信息：  
We welcome contributions! Please see the [Development Guide](./docs/development/DEVELOPMENT.md) for detailed information on:

- 开发环境设置 (Development environment setup)
- 代码风格和约定 (Code style and conventions)
- 开发工作流程 (Development workflow)
- 测试指南 (Testing guidelines)
- 提交 Pull Request (Submitting pull requests)

## 📝 许可证 (License)

详细信息请参阅主项目的 LICENSE 文件。  
See the main project LICENSE file for details.

## 🙏 致谢 (Acknowledgments)

- [Ant Design](https://ant.design/) - UI 组件库 (UI component library)
- [React Query](https://tanstack.com/query) - 数据获取和缓存 (Data fetching and caching)
- [i18next](https://www.i18next.com/) - 国际化框架 (Internationalization framework)
- [Vite](https://vitejs.dev/) - 构建工具 (Build tool)

## 📧 支持 (Support)

遇到问题或需要帮助：  
For issues and questions:

- 在 GitHub 上提交 Issue (Open an issue on GitHub)
- 查阅现有文档 (Check existing documentation)
- 查看已关闭的 Issue 寻找解决方案 (Review closed issues for solutions)

---

由 PixivFlow 团队用 ❤️ 构建  
Built with ❤️ by the PixivFlow team
