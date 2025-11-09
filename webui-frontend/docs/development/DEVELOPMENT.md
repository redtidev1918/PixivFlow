# 💻 开发指南

本指南介绍如何开发和贡献 PixivFlow WebUI Frontend。

## 📋 目录

- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [代码规范](#代码规范)
- [开发工作流](#开发工作流)
- [测试](#测试)
- [提交代码](#提交代码)

## 🛠️ 开发环境设置

### 1. 克隆仓库

```bash
git clone <repository-url>
cd PixivBatchDownloader-master/webui-frontend
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 启动后端服务器

在项目根目录：

```bash
npm run webui
```

## 📁 项目结构

```
webui-frontend/
├── src/
│   ├── components/      # 可复用的 React 组件
│   ├── pages/          # 页面组件
│   ├── services/       # API 服务层
│   ├── hooks/          # 自定义 React Hooks
│   ├── utils/          # 工具函数
│   ├── constants/      # 常量定义
│   ├── locales/        # 国际化翻译
│   └── i18n/           # i18n 配置
├── public/             # 静态资源
├── docs/               # 文档
└── package.json
```

## 📝 代码规范

### TypeScript

- 使用显式类型定义
- 优先使用 `interface` 而非 `type`（对象形状）
- 使用枚举表示固定值集合
- 利用工具类型（Partial, Pick, Omit 等）

### React

- 使用函数组件和 Hooks
- 使用 `useMemo` 缓存昂贵计算
- 使用 `useCallback` 缓存回调函数
- 将复杂逻辑提取到自定义 Hooks
- 保持组件小而专注

### 文件命名

- 组件：PascalCase（如 `AppLayout.tsx`）
- Hooks：camelCase，以 'use' 开头（如 `useDebounce.ts`）
- 工具：camelCase（如 `formatters.ts`）
- 常量：UPPER_SNAKE_CASE（如 `API_CONFIG`）

### 导入顺序

1. 外部库（React, Ant Design 等）
2. 内部组件
3. Hooks
4. 工具和常量
5. 类型和接口
6. 样式

## 🔄 开发工作流

### 1. 创建功能分支

```bash
git checkout -b feature/your-feature-name
```

### 2. 开发功能

- 编写代码
- 确保没有 linter 错误
- 测试功能

### 3. 提交代码

```bash
git add .
git commit -m "feat: add your feature"
```

### 4. 推送并创建 PR

```bash
git push origin feature/your-feature-name
```

## 🧪 测试

### 运行 Linter

```bash
npm run lint
```

### 检查翻译完整性

```bash
node check-translations.js
```

### 手动测试

- 在不同浏览器中测试
- 测试响应式设计
- 检查无障碍性
- 验证国际化覆盖

## 📤 提交代码

### 提交信息格式

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更改
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 示例

```
feat(download): add batch download feature

Add ability to download multiple items at once with progress tracking.

Closes #123
```

## 🎨 UI 开发

### 使用 Ant Design

项目使用 Ant Design 5 作为 UI 组件库。参考 [Ant Design 文档](https://ant.design/components/overview-cn/)。

### 主题定制

主题配置在 `src/constants/theme.ts` 中定义。

### 响应式设计

使用 Ant Design 的 Grid 系统和响应式工具：

```typescript
import { useBreakpoint } from 'antd';

const { xs, sm, md, lg, xl } = useBreakpoint();
```

## 🌍 国际化

### 添加新翻译

1. 在 `src/locales/zh-CN.json` 和 `src/locales/en-US.json` 中添加键值对
2. 在代码中使用：

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<h1>{t('your.key')}</h1>
```

### 检查翻译完整性

运行翻译检查脚本：

```bash
node check-translations.js
```

## 🔍 调试

### 浏览器开发者工具

- 使用 React DevTools 检查组件状态
- 使用 Network 标签检查 API 调用
- 使用 Console 查看错误和日志

### 日志

使用 `console.log`、`console.error` 等进行调试。生产构建会自动移除这些日志。

## 📚 相关文档

- [API 文档](../api/API.md)
- [组件文档](../components/COMPONENTS.md)
- [Hooks 文档](../hooks/HOOKS.md)
- [工具函数文档](../utils/UTILS.md)

## 🤝 贡献

查看 [贡献指南](../project/CONTRIBUTING.md) 了解如何贡献代码。

## 💡 提示

- 保持代码简洁和可读
- 添加注释解释复杂逻辑
- 遵循现有代码风格
- 编写有意义的提交信息
- 测试您的更改

