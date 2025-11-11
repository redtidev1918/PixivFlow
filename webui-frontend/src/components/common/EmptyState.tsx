import { Empty, EmptyProps } from 'antd';

interface EmptyStateProps extends EmptyProps {
  description?: string;
  action?: React.ReactNode;
}

/**
 * Component for displaying empty state
 */
export function EmptyState({ description, action, ...props }: EmptyStateProps) {
  return (
    <Empty
      description={description || '暂无数据'}
      {...props}
    >
      {action}
    </Empty>
  );
}

