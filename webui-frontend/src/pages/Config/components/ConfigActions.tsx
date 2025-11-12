import { Button, Space, Tooltip } from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileTextOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../hooks/useAuth';

interface ConfigActionsProps {
  onRefresh: () => void;
  onPreview: () => void;
  onExport: () => void;
  onImport: () => void;
  onCopy: () => void | Promise<void>;
  onValidate: () => void;
  onSave: () => void;
  isValidating: boolean;
  isUpdating: boolean;
  isImporting?: boolean;
}

/**
 * ConfigActions component - Action buttons for configuration operations
 */
export function ConfigActions({
  onRefresh,
  onPreview,
  onExport,
  onImport,
  onCopy,
  onValidate,
  onSave,
  isValidating,
  isUpdating,
  isImporting = false,
}: ConfigActionsProps) {
  const { t } = useTranslation();
  const { authenticated } = useAuth();
  
  // Buttons that require authentication
  const requiresAuth = !authenticated;
  const loginTip = t('common.loginRequired');

  return (
    <Space wrap>
      <Button icon={<ReloadOutlined />} onClick={onRefresh}>
        {t('common.refresh')}
      </Button>
      <Button icon={<FileTextOutlined />} onClick={onPreview}>
        {t('config.previewConfig')}
      </Button>
      <Button icon={<DownloadOutlined />} onClick={onExport}>
        {t('config.exportConfig')}
      </Button>
      <Tooltip title={requiresAuth ? loginTip : undefined}>
        <Button 
          icon={<UploadOutlined />} 
          onClick={onImport} 
          loading={isImporting} 
          disabled={isImporting || requiresAuth}
        >
          {t('config.importConfig')}
        </Button>
      </Tooltip>
      <Button icon={<CopyOutlined />} onClick={onCopy}>
        {t('config.copyConfig')}
      </Button>
      <Button icon={<CheckCircleOutlined />} onClick={onValidate} loading={isValidating}>
        {t('config.validateConfig')}
      </Button>
      <Tooltip title={requiresAuth ? loginTip : undefined}>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={onSave}
          loading={isUpdating}
          disabled={requiresAuth}
        >
          {t('config.saveConfig')}
        </Button>
      </Tooltip>
    </Space>
  );
}

