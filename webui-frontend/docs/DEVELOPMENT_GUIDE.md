# 🛠️ 开发指南

本文档介绍如何参与 PixivFlow WebUI 前端项目的开发工作。

## 📋 目录

1. [环境设置](#环境设置)
2. [项目结构](#项目结构)
3. [开发流程](#开发流程)
4. [代码规范](#代码规范)
5. [测试指南](#测试指南)
6. [常见问题](#常见问题)

---

## 🚀 环境设置

### 前置要求

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0 或 **yarn**: >= 1.22.0
- **Git**: 最新版本

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd PixivBatchDownloader/webui-frontend
   ```

2. **安装依赖**
   ```bash
   npm install
   # 或
   yarn install
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   # 或
   yarn dev
   ```

4. **访问应用**
   - 打开浏览器访问 `http://localhost:5173`

### 开发工具推荐

- **IDE**: VS Code
- **扩展**:
  - ESLint
  - Prettier
  - TypeScript
  - React snippets
  - Jest Runner

---

## 📁 项目结构

```
webui-frontend/
├── src/
│   ├── components/          # 通用组件
│   │   ├── common/         # 基础组件
│   │   ├── forms/          # 表单组件
│   │   ├── tables/         # 表格组件
│   │   └── modals/         # 模态框组件
│   ├── pages/              # 页面组件
│   │   ├── Config/         # 配置页面
│   │   ├── Download/       # 下载页面
│   │   ├── Files/          # 文件页面
│   │   └── ...
│   ├── hooks/              # 自定义 Hooks
│   ├── services/           # API 服务
│   ├── stores/             # 状态管理 (Zustand)
│   ├── utils/              # 工具函数
│   ├── types/              # TypeScript 类型定义
│   ├── constants/          # 常量定义
│   └── __tests__/          # 测试文件
├── public/                 # 静态资源
├── docs/                   # 文档
└── package.json
```

### 关键目录说明

- **components/**: 可复用的 UI 组件
- **pages/**: 页面级组件，通常包含业务逻辑
- **hooks/**: 自定义 React Hooks，封装业务逻辑
- **services/**: API 调用封装
- **stores/**: Zustand 状态管理
- **utils/**: 工具函数和辅助方法

---

## 🔄 开发流程

### 1. 创建新功能

1. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **开发新功能**
   - 在相应的目录下创建组件或页面
   - 遵循项目结构和命名规范
   - 编写必要的测试

3. **提交代码**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

### 2. 创建新组件

**步骤：**

1. 在 `src/components/` 下创建组件文件
2. 创建对应的测试文件 `ComponentName.test.tsx`
3. 导出组件并添加到相应的 index.ts

**示例：**

```tsx
// src/components/common/MyComponent.tsx
import React from 'react';
import { MyComponentProps } from './types';

export const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
  return <div>{title}</div>;
};

export default MyComponent;
```

### 3. 创建新页面

**步骤：**

1. 在 `src/pages/` 下创建页面目录
2. 创建主组件文件 `PageName.tsx`
3. 创建子组件（如需要）
4. 在路由中注册页面

**示例：**

```tsx
// src/pages/MyPage/MyPage.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function MyPage() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('myPage.title')}</h1>
    </div>
  );
}
```

### 4. 创建自定义 Hook

**步骤：**

1. 在 `src/hooks/` 下创建 Hook 文件
2. 使用 React Query 进行数据获取（如需要）
3. 创建对应的测试文件

**示例：**

```tsx
// src/hooks/useMyData.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useMyData() {
  return useQuery({
    queryKey: ['myData'],
    queryFn: () => api.getMyData(),
  });
}
```

---

## 📝 代码规范

### TypeScript

- **使用 TypeScript**: 所有新代码必须使用 TypeScript
- **类型定义**: 为所有函数、组件、变量定义类型
- **避免 any**: 尽量不使用 `any`，使用 `unknown` 或具体类型

```tsx
// ✅ 好的做法
interface UserProps {
  name: string;
  age: number;
}

// ❌ 避免
const props: any = { ... };
```

### React 组件

- **函数组件**: 优先使用函数组件和 Hooks
- **组件命名**: 使用 PascalCase
- **Props 接口**: 使用 `ComponentNameProps` 命名

```tsx
// ✅ 好的做法
interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ onClick, children }) => {
  return <button onClick={onClick}>{children}</button>;
};
```

### 文件命名

- **组件文件**: PascalCase (如 `MyComponent.tsx`)
- **工具文件**: camelCase (如 `dateUtils.ts`)
- **类型文件**: camelCase (如 `types.ts`)
- **常量文件**: UPPER_SNAKE_CASE (如 `API_CONSTANTS.ts`)

### 导入顺序

1. React 相关
2. 第三方库
3. 内部组件
4. 工具函数
5. 类型定义
6. 样式文件

```tsx
// ✅ 好的做法
import React, { useState } from 'react';
import { Button, Card } from 'antd';
import { useTranslation } from 'react-i18next';

import { MyComponent } from '../components/MyComponent';
import { formatDate } from '../utils/dateUtils';
import { User } from '../types';
```

### 代码格式化

使用 Prettier 自动格式化：

```bash
npm run format
```

### ESLint

运行 ESLint 检查：

```bash
npm run lint
```

---

## 🧪 测试指南

### 测试框架

- **Jest**: 测试运行器
- **React Testing Library**: React 组件测试
- **@testing-library/user-event**: 用户交互模拟

### 编写测试

**组件测试示例：**

```tsx
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

**Hook 测试示例：**

```tsx
// src/hooks/__tests__/useMyData.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { useMyData } from '../useMyData';

describe('useMyData', () => {
  it('fetches data correctly', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useMyData(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
```

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test MyComponent

# 运行测试并生成覆盖率报告
npm test -- --coverage

# 监视模式
npm test -- --watch
```

### 测试覆盖率目标

- **语句覆盖率**: >= 80%
- **分支覆盖率**: >= 75%
- **函数覆盖率**: >= 80%
- **行覆盖率**: >= 80%

---

## 🔧 常见问题

### 1. 依赖安装失败

**问题**: `npm install` 失败

**解决方案**:
- 清除缓存: `npm cache clean --force`
- 删除 `node_modules` 和 `package-lock.json`，重新安装
- 检查 Node.js 版本是否符合要求

### 2. TypeScript 类型错误

**问题**: TypeScript 编译错误

**解决方案**:
- 检查 `tsconfig.json` 配置
- 确保所有导入的类型定义正确
- 使用 `// @ts-ignore` 或 `// @ts-expect-error` 时添加注释说明

### 3. 测试失败

**问题**: 测试用例失败

**解决方案**:
- 检查 mock 是否正确设置
- 确保异步操作使用 `waitFor` 等待
- 检查测试环境配置

### 4. 样式问题

**问题**: 样式不生效

**解决方案**:
- 检查 CSS 模块导入是否正确
- 确保 Ant Design 主题配置正确
- 检查样式文件路径

### 5. 路由问题

**问题**: 路由不工作

**解决方案**:
- 检查路由配置是否正确
- 确保使用 `BrowserRouter` 或 `HashRouter`
- 检查路由路径是否匹配

---

## 📚 相关资源

- [React 文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [Ant Design 文档](https://ant.design/)
- [React Query 文档](https://tanstack.com/query/latest)
- [Zustand 文档](https://zustand-demo.pmnd.rs/)
- [React Testing Library](https://testing-library.com/react)

---

## 🤝 贡献指南

1. Fork 仓库
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

---

## 📝 更新日志

- **2025-01-XX**: 初始版本

