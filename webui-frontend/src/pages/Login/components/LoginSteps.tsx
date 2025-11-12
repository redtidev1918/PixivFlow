import { Steps } from 'antd';
import { SafetyOutlined, ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';

interface LoginStepsProps {
  current: number;
}

/**
 * Login steps indicator component
 */
export function LoginSteps({ current }: LoginStepsProps) {
  return (
    <Steps
      current={current}
      size="small"
      items={[
        { title: '选择模式', icon: <SafetyOutlined /> },
        { title: '认证中', icon: <ThunderboltOutlined /> },
        { title: '完成', icon: <CheckCircleOutlined /> },
      ]}
      style={{ marginBottom: 8 }}
    />
  );
}

