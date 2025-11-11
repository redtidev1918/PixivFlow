import { Button, Result } from 'antd';
import { AppError } from '../../types/errors';

interface ErrorDisplayProps {
  error: AppError;
  onRetry?: () => void;
  title?: string;
  subTitle?: string;
}

/**
 * Component for displaying errors in a user-friendly way
 */
export function ErrorDisplay({
  error,
  onRetry,
  title,
  subTitle,
}: ErrorDisplayProps) {
  const getStatus = () => {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'warning';
      case 'AUTH_ERROR':
        return '403';
      case 'VALIDATION_ERROR':
        return 'error';
      case 'SERVER_ERROR':
        return '500';
      default:
        return 'error';
    }
  };

  return (
    <Result
      status={getStatus()}
      title={title || '发生错误'}
      subTitle={subTitle || error.message}
      extra={
        onRetry
          ? [
              <Button type="primary" key="retry" onClick={onRetry}>
                重试
              </Button>,
            ]
          : undefined
      }
    />
  );
}

