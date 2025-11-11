import React from 'react';
import { Card, Collapse, Typography, Space } from 'antd';
import { FormSectionProps } from './types';

const { Panel } = Collapse;
const { Title, Text } = Typography;

/**
 * Form section component that provides consistent grouping
 * for form fields. Supports both card and collapsible modes.
 */
export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  collapsible = false,
  defaultCollapsed = false,
  card = true,
  extra,
  style,
  className,
}) => {
  if (collapsible) {
    return (
      <Collapse
        defaultActiveKey={defaultCollapsed ? [] : ['1']}
        style={style}
        className={className}
      >
        <Panel
          header={
            <Space direction="vertical" size={0}>
              <Title level={5} style={{ margin: 0 }}>
                {title}
              </Title>
              {description && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {description}
                </Text>
              )}
            </Space>
          }
          key="1"
          extra={extra}
        >
          {children}
        </Panel>
      </Collapse>
    );
  }

  if (card) {
    return (
      <Card
        title={
          <Space direction="vertical" size={0}>
            <Title level={5} style={{ margin: 0 }}>
              {title}
            </Title>
            {description && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {description}
              </Text>
            )}
          </Space>
        }
        extra={extra}
        style={style}
        className={className}
      >
        {children}
      </Card>
    );
  }

  return (
    <div style={style} className={className}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Title level={5} style={{ margin: 0 }}>
          {title}
        </Title>
        {description && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {description}
          </Text>
        )}
        {children}
      </Space>
    </div>
  );
};

export default FormSection;

