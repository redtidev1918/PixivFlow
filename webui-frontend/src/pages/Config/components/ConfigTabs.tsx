import { Form, Tabs, Typography } from 'antd';
import { FileTextOutlined, HistoryOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { BasicConfigForm } from './BasicConfigForm';
import { NetworkConfigForm } from './NetworkConfigForm';
import { StorageConfigForm } from './StorageConfigForm';
import { SchedulerConfigForm } from './SchedulerConfigForm';
import { DownloadConfigForm } from './DownloadConfigForm';
import { TargetsConfigForm } from './TargetsConfigForm';
import { ConfigFilesManager } from './ConfigFilesManager';
import { ConfigHistoryManager } from './ConfigHistoryManager';

const { Text } = Typography;

interface ConfigTabsProps {
  form: any;
  activeTab: string;
  onTabChange: (key: string) => void;
  onConfigFileSwitch: () => void;
  onJsonEditorOpen: (filename: string) => void;
  onConfigApplied: () => void;
  onTargetChange: () => void;
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
  const { t } = useTranslation();

  return (
    <Form form={form} layout="vertical">
      <Tabs activeKey={activeTab} onChange={onTabChange}>
        <Tabs.TabPane tab={<><FileTextOutlined /> {t('config.tabConfigFiles')}</>} key="files">
          <ConfigFilesManager
            onConfigFileSwitch={onConfigFileSwitch}
            onJsonEditorOpen={onJsonEditorOpen}
          />
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabBasic')} key="basic">
          <BasicConfigForm />
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabPixiv')} key="pixiv">
          <div>
            <Text type="secondary">
              {t('config.pixivCredentialsHidden')}
            </Text>
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabNetwork')} key="network">
          <NetworkConfigForm />
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabStorage')} key="storage">
          <StorageConfigForm />
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabScheduler')} key="scheduler">
          <SchedulerConfigForm />
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabDownload')} key="download">
          <DownloadConfigForm />
        </Tabs.TabPane>

        <Tabs.TabPane tab={<><HistoryOutlined /> {t('config.tabHistory')}</>} key="history">
          <ConfigHistoryManager onConfigApplied={onConfigApplied} />
        </Tabs.TabPane>

        <Tabs.TabPane tab={t('config.tabTargets')} key="targets">
          <TargetsConfigForm form={form} onTargetChange={onTargetChange} />
        </Tabs.TabPane>
      </Tabs>
    </Form>
  );
}

