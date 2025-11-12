import { Spin, SpinProps } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface LoadingSpinnerProps extends Omit<SpinProps, 'spinning'> {
  size?: 'small' | 'default' | 'large';
  tip?: string;
  fullScreen?: boolean;
  spinning?: boolean;
}

/**
 * Unified loading spinner component
 */
export function LoadingSpinner({
  size = 'default',
  tip,
  fullScreen = false,
  spinning = true,
  ...props
}: LoadingSpinnerProps) {
  const iconSize = size === 'small' ? 16 : size === 'large' ? 32 : 24;

  if (fullScreen) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 9999,
        }}
      >
        <Spin
          spinning={spinning}
          size={size}
          tip={tip}
          indicator={<LoadingOutlined style={{ fontSize: iconSize }} spin />}
          role="status"
          aria-live="polite"
          aria-label={tip ?? 'loading'}
          {...props}
        />
      </div>
    );
  }

  return (
    <Spin
      spinning={spinning}
      size={size}
      tip={tip}
      indicator={<LoadingOutlined style={{ fontSize: iconSize }} spin />}
      role="status"
      aria-live="polite"
      aria-label={tip ?? 'loading'}
      {...props}
    />
  );
}

