# PixivFlow WebUI Frontend

Modern, responsive web interface for PixivFlow - A powerful Pixiv content downloader.

> 📖 **中文版本**: 查看 [README.md](./README.md) 获取中文文档。

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

## ✨ Features

- **🎨 Modern UI**: Clean, intuitive interface built with Ant Design
- **🌍 Internationalization**: Full support for English and Chinese
- **📱 Responsive**: Works seamlessly on desktop, tablet, and mobile devices
- **⚡ Real-time Updates**: Live download progress and status updates
- **🔍 Advanced Search**: Powerful filtering and search capabilities
- **📊 Statistics**: Comprehensive download statistics and analytics
- **🎯 Type-Safe**: Full TypeScript support for better developer experience
- **♿ Accessible**: WCAG 2.1 compliant for accessibility

## 🛠 Tech Stack

- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Ant Design 5** - UI component library
- **React Router 6** - Client-side routing
- **React Query** - Server state management
- **Axios** - HTTP client
- **i18next** - Internationalization framework
- **Vite** - Build tool and dev server
- **Socket.IO** - Real-time communication

## 📁 Project Structure

```
webui-frontend/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── ErrorBoundary.tsx
│   │   ├── I18nProvider.tsx
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/               # Page components
│   │   ├── Dashboard.tsx    # Overview and statistics
│   │   ├── Config.tsx       # Configuration management
│   │   ├── Download.tsx     # Download management
│   │   ├── History.tsx      # Download history
│   │   ├── Files.tsx        # File browser
│   │   ├── Logs.tsx         # Application logs
│   │   └── Login.tsx        # Authentication
│   ├── services/            # API services
│   │   └── api.ts           # API client and endpoints
│   ├── hooks/               # Custom React hooks
│   │   ├── useDebounce.ts
│   │   ├── useLocalStorage.ts
│   │   ├── usePagination.ts
│   │   └── useTableSort.ts
│   ├── utils/               # Utility functions
│   │   ├── dateUtils.ts
│   │   ├── errorCodeTranslator.ts
│   │   ├── formatters.ts
│   │   └── validators.ts
│   ├── constants/           # Application constants
│   │   ├── theme.ts
│   │   └── index.ts
│   ├── locales/             # i18n translations
│   │   ├── zh-CN.json
│   │   └── en-US.json
│   ├── i18n/                # i18n configuration
│   │   └── config.ts
│   ├── App.tsx              # Root component
│   ├── main.tsx             # Application entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── check-translations.js    # Translation completeness checker
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Backend server running (see main project README)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd PixivBatchDownloader-master/webui-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

For more detailed instructions, see [Quick Start Guide](./docs/getting-started/QUICKSTART.md).

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:

### 📖 Getting Started

- [Quick Start Guide](./docs/getting-started/QUICKSTART.md) - Get up and running quickly

### 🛠️ Guides

- [Packaged App Guide](./docs/guides/PACKAGED_APP_GUIDE.md) - Using the packaged application

### 🏗️ Building

- [Build Guide](./docs/build/BUILD_GUIDE.md) - Complete build instructions
- [Build Scripts](./docs/build/BUILD_README.md) - Build script documentation
- [Build and Release](./docs/build/BUILD_RELEASE.md) - Release process
- [Build Tools](./docs/build/BUILD_TOOLS.md) - Build tools reference

### 💻 Development

- [Development Guide](./docs/development/DEVELOPMENT.md) - Development setup and workflow

### 📦 Project

- [Changelog](./docs/project/CHANGELOG.md) - Version history and changes

For the complete documentation index, see [Documentation README](./docs/README.md).

## 🤝 Contributing

We welcome contributions! Please see the [Development Guide](./docs/development/DEVELOPMENT.md) for detailed information on:

- Development environment setup
- Code style and conventions
- Development workflow
- Testing guidelines
- Submitting pull requests

## 📝 License

See the main project LICENSE file for details.

## 🙏 Acknowledgments

- [Ant Design](https://ant.design/) - UI component library
- [React Query](https://tanstack.com/query) - Data fetching and caching
- [i18next](https://www.i18next.com/) - Internationalization framework
- [Vite](https://vitejs.dev/) - Build tool

## 📧 Support

For issues and questions:

- Open an issue on GitHub
- Check existing documentation
- Review closed issues for solutions

---

Built with ❤️ by the PixivFlow team

