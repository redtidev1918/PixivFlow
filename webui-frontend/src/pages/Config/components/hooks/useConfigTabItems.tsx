import { useMemo } from 'react';
import type { FormInstance } from 'antd';
import type { TabsProps } from 'antd';
import { Typography } from 'antd';
import {
  FileTextOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { BasicConfigForm } from '../BasicConfigForm';
import { NetworkConfigForm } from '../NetworkConfigForm';
import { StorageConfigForm } from '../StorageConfigForm';
import { SchedulerConfigForm } from '../SchedulerConfigForm';
import { DownloadConfigForm } from '../DownloadConfigForm';
import { TargetsConfigForm } from '../TargetsConfigForm';
import { ConfigFilesManager } from '../ConfigFilesManager';
import { ConfigHistoryManager } from '../ConfigHistoryManager';
import type { ConfigFormValues } from '../../hooks';

const { Text } = Typography;

interface UseConfigTabItemsParams {
  form: FormInstance<ConfigFormValues>;
  onConfigFileSwitch: () => void;
  onJsonEditorOpen: (filename: string) => void;
  onConfigApplied: () => void;
  onTargetChange: () => void | Promise<void>;
}

/**
 * Hook that groups config tabs into form tabs and management tabs.
 */
export function useConfigTabItems({
  form,
  onConfigFileSwitch,
  onJsonEditorOpen,
  onConfigApplied,
  onTargetChange,
}: UseConfigTabItemsParams) {
  const { t } = useTranslation();

  const managementTabItems = useMemo<TabsProps['items']>(() => [
    {
      key: 'files',
      label: (
        <>
          <FileTextOutlined /> {t('config.tabConfigFiles')}
        </>
      ),
      children: (
        <ConfigFilesManager
          onConfigFileSwitch={onConfigFileSwitch}
          onJsonEditorOpen={onJsonEditorOpen}
        />
      ),
    },
    {
      key: 'history',
      label: (
        <>
          <HistoryOutlined /> {t('config.tabHistory')}
        </>
      ),
      children: (
        <ConfigHistoryManager
          onConfigApplied={onConfigApplied}
        />
      ),
    },
  ], [onConfigApplied, onConfigFileSwitch, onJsonEditorOpen, t]);

  const formTabItems = useMemo<TabsProps['items']>(() => [
    {
      key: 'basic',
      label: t('config.tabBasic'),
      children: <BasicConfigForm />,
    },
    {
      key: 'pixiv',
      label: t('config.tabPixiv'),
      children: (
        <div>
          <Text type="secondary">
            {t('config.pixivCredentialsHidden')}
          </Text>
        </div>
      ),
    },
    {
      key: 'network',
      label: t('config.tabNetwork'),
      children: <NetworkConfigForm />,
    },
    {
      key: 'storage',
      label: t('config.tabStorage'),
      children: <StorageConfigForm />,
    },
    {
      key: 'scheduler',
      label: t('config.tabScheduler'),
      children: <SchedulerConfigForm />,
    },
    {
      key: 'download',
      label: t('config.tabDownload'),
      children: <DownloadConfigForm />,
    },
    {
      key: 'targets',
      label: t('config.tabTargets'),
      children: (
        <TargetsConfigForm
          form={form}
          onTargetChange={onTargetChange}
        />
      ),
    },
  ], [form, onTargetChange, t]);

  const tabItems = useMemo<TabsProps['items']>(() => [
    ...(managementTabItems || []),
    ...(formTabItems || []),
  ], [formTabItems, managementTabItems]);

  return {
    managementTabItems,
    formTabItems,
    tabItems,
  };
}


