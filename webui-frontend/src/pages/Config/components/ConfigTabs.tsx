import { Form, Tabs } from 'antd';
import type { FormInstance } from 'antd';
import { useConfigTabItems } from './hooks/useConfigTabItems';
import type { ConfigFormValues } from '../hooks';

interface ConfigTabsProps {
  form: FormInstance<ConfigFormValues>;
  activeTab: string;
  onTabChange: (key: string) => void;
  onConfigFileSwitch: () => void;
  onJsonEditorOpen: (filename: string) => void;
  onConfigApplied: () => void;
  onTargetChange: () => void | Promise<void>;
}

/**
 * ConfigTabs component - Tab navigation for configuration sections
 */
export function ConfigTabs({
  form,
  activeTab,
  onTabChange,
  onConfigFileSwitch,
  onJsonEditorOpen,
  onConfigApplied,
  onTargetChange,
}: ConfigTabsProps) {
  const { tabItems } = useConfigTabItems({
    form,
    onConfigFileSwitch,
    onJsonEditorOpen,
    onConfigApplied,
    onTargetChange,
  });

  return (
    <Form form={form} layout="vertical">
      <Tabs activeKey={activeTab} onChange={onTabChange} items={tabItems} />
    </Form>
  );
}

