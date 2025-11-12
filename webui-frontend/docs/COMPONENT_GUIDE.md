# 📚 组件使用指南

本文档介绍 PixivFlow WebUI 前端项目中通用组件的使用方法。

## 📋 目录

1. [表单组件](#表单组件)
2. [表格组件](#表格组件)
3. [模态框组件](#模态框组件)
4. [状态组件](#状态组件)
5. [工具组件](#工具组件)

---

## 📝 表单组件

### FormField

通用表单项组件，支持多种输入类型。

```tsx
import { FormField } from '@/components/forms/FormField';
import { Form } from 'antd';

function MyForm() {
  const [form] = Form.useForm();

  return (
    <Form form={form}>
      <FormField
        name="username"
        label="用户名"
        type="input"
        required
        tooltip="请输入用户名"
      />
      <FormField
        name="age"
        label="年龄"
        type="number"
        min={0}
        max={120}
      />
      <FormField
        name="enabled"
        label="启用"
        type="switch"
      />
    </Form>
  );
}
```

**Props:**
- `name`: 字段名
- `label`: 标签文本
- `type`: 输入类型 (`input` | `number` | `select` | `switch` | `date` | `dateRange`)
- `required`: 是否必填
- `tooltip`: 提示信息
- 其他 Ant Design Form.Item 支持的属性

### FormSection

表单分组组件，支持卡片模式和折叠模式。

```tsx
import { FormSection } from '@/components/forms/FormSection';

function MyForm() {
  return (
    <FormSection
      title="基础配置"
      description="配置基本信息"
      mode="card"
      collapsible
    >
      {/* 表单内容 */}
    </FormSection>
  );
}
```

**Props:**
- `title`: 标题
- `description`: 描述（可选）
- `mode`: 显示模式 (`card` | `collapse` | `default`)
- `collapsible`: 是否可折叠
- `defaultCollapsed`: 默认是否折叠

### FormTabs

表单标签页组件。

```tsx
import { FormTabs } from '@/components/forms/FormTabs';

function MyForm() {
  return (
    <FormTabs
      items={[
        { key: 'basic', label: '基础配置', children: <BasicForm /> },
        { key: 'advanced', label: '高级配置', children: <AdvancedForm /> },
      ]}
    />
  );
}
```

---

## 📊 表格组件

### DataTable

通用数据表格组件，支持排序、筛选、分页。

```tsx
import { DataTable } from '@/components/tables/DataTable';

interface User {
  id: string;
  name: string;
  email: string;
}

function UserTable() {
  const columns = [
    { key: 'name', title: '姓名', sorter: true },
    { key: 'email', title: '邮箱' },
  ];

  const data: User[] = [
    { id: '1', name: '张三', email: 'zhangsan@example.com' },
    { id: '2', name: '李四', email: 'lisi@example.com' },
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      loading={false}
      pagination={{ pageSize: 10 }}
    />
  );
}
```

**Props:**
- `data`: 数据数组
- `columns`: 列定义
- `loading`: 加载状态
- `pagination`: 分页配置
- `filters`: 筛选配置
- `onRowClick`: 行点击回调

### TableFilters

表格筛选组件。

```tsx
import { TableFilters } from '@/components/tables/TableFilters';

function MyTable() {
  const filters = [
    {
      key: 'name',
      label: '名称',
      type: 'input',
    },
    {
      key: 'status',
      label: '状态',
      type: 'select',
      options: [
        { label: '启用', value: 'enabled' },
        { label: '禁用', value: 'disabled' },
      ],
    },
  ];

  return (
    <TableFilters
      filters={filters}
      onFilterChange={(values) => {
        console.log('筛选值:', values);
      }}
    />
  );
}
```

### TablePagination

表格分页组件。

```tsx
import { TablePagination } from '@/components/tables/TablePagination';

function MyTable() {
  return (
    <TablePagination
      current={1}
      pageSize={10}
      total={100}
      onChange={(page, size) => {
        console.log('页码:', page, '每页数量:', size);
      }}
    />
  );
}
```

---

## 🪟 模态框组件

### FormModal

表单对话框组件。

```tsx
import { FormModal } from '@/components/modals/FormModal';
import { Form } from 'antd';

function MyComponent() {
  const [form] = Form.useForm();
  const [visible, setVisible] = useState(false);

  const handleSubmit = async (values: any) => {
    // 处理提交
    console.log(values);
    setVisible(false);
  };

  return (
    <FormModal
      form={form}
      title="编辑用户"
      open={visible}
      onSubmit={handleSubmit}
      onCancel={() => setVisible(false)}
      submitLoading={false}
    >
      <Form.Item name="name" label="姓名">
        <input />
      </Form.Item>
    </FormModal>
  );
}
```

**Props:**
- `form`: Ant Design Form 实例
- `title`: 标题
- `open`: 是否显示
- `onSubmit`: 提交回调
- `onCancel`: 取消回调
- `submitLoading`: 提交加载状态
- `initialValues`: 初始值

### ConfirmModal

确认对话框组件。

```tsx
import { ConfirmModal } from '@/components/modals/ConfirmModal';

function MyComponent() {
  const [visible, setVisible] = useState(false);

  return (
    <ConfirmModal
      title="确认删除"
      content="确定要删除这个项目吗？"
      open={visible}
      onConfirm={async () => {
        // 执行删除操作
        setVisible(false);
      }}
      onCancel={() => setVisible(false)}
    />
  );
}
```

### PreviewModal

预览对话框组件。

```tsx
import { PreviewModal } from '@/components/modals/PreviewModal';

function MyComponent() {
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <PreviewModal
      open={visible}
      preview={preview}
      type="image"
      onClose={() => setVisible(false)}
    />
  );
}
```

---

## 🔄 状态组件

### LoadingSpinner

加载动画组件。

```tsx
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

function MyComponent() {
  return (
    <LoadingSpinner
      size="large"
      tip="加载中..."
      fullScreen={false}
    />
  );
}
```

### ErrorBoundary

错误边界组件。

```tsx
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### EmptyState

空状态组件。

```tsx
import { EmptyState } from '@/components/common/EmptyState';

function MyComponent() {
  return (
    <EmptyState
      description="暂无数据"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  );
}
```

### ErrorDisplay

错误显示组件。

```tsx
import { ErrorDisplay } from '@/components/common/ErrorDisplay';

function MyComponent() {
  const error = { code: 'NETWORK_ERROR', message: '网络错误' };

  return (
    <ErrorDisplay
      error={error}
      onRetry={() => {
        // 重试逻辑
      }}
    />
  );
}
```

### LoadingWrapper

加载包装器组件。

```tsx
import { LoadingWrapper } from '@/components/common/LoadingWrapper';

function MyComponent() {
  return (
    <LoadingWrapper loading={isLoading}>
      <Content />
    </LoadingWrapper>
  );
}
```

---

## 🛠️ 工具组件

### CodeEditor

代码编辑器组件。

```tsx
import { CodeEditor } from '@/components/common/CodeEditor';

function MyComponent() {
  const [value, setValue] = useState('{}');

  return (
    <CodeEditor
      value={value}
      onChange={setValue}
      language="json"
      readOnly={false}
    />
  );
}
```

### FileUploader

文件上传组件。

```tsx
import { FileUploader } from '@/components/common/FileUploader';

function MyComponent() {
  return (
    <FileUploader
      accept=".json"
      maxSize={1024 * 1024}
      onUpload={(file) => {
        console.log('上传文件:', file);
      }}
    />
  );
}
```

### DateRangePicker

日期范围选择组件。

```tsx
import { DateRangePicker } from '@/components/common/DateRangePicker';

function MyComponent() {
  return (
    <DateRangePicker
      onChange={(dates) => {
        console.log('选择的日期范围:', dates);
      }}
    />
  );
}
```

---

## 📖 最佳实践

1. **使用 TypeScript**: 所有组件都有完整的类型定义，充分利用类型检查
2. **统一错误处理**: 使用 `useErrorHandler` Hook 统一处理错误
3. **统一加载状态**: 使用 `useLoading` Hook 或 `LoadingWrapper` 组件
4. **组件复用**: 优先使用通用组件，避免重复实现
5. **性能优化**: 使用 `React.memo`、`useMemo`、`useCallback` 优化性能

---

## 🔗 相关文档

- [React 文档](https://react.dev/)
- [Ant Design 文档](https://ant.design/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)

