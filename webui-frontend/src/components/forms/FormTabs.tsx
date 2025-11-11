import React from 'react';
import { Tabs } from 'antd';
import { FormTabsProps } from './types';

/**
 * Form tabs component that provides consistent tab navigation
 * for form sections. Wraps Ant Design Tabs with form-specific styling.
 */
export const FormTabs: React.FC<FormTabsProps> = ({
  items,
  activeKey,
  onChange,
  tabPosition = 'top',
  type = 'line',
  style,
  className,
}) => {
  const tabItems = items.map((item) => ({
    key: item.key,
    label: (
      <span>
        {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
        {item.label}
      </span>
    ),
    children: item.children,
    disabled: item.disabled,
  }));

  return (
    <Tabs
      activeKey={activeKey}
      onChange={onChange}
      items={tabItems}
      tabPosition={tabPosition}
      type={type}
      style={style}
      className={className}
    />
  );
};

export default FormTabs;

