import { Button, Space } from 'antd';
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

interface ConfigActionsProps {
  onRefresh: () => void;
  onPreview: () => void;
  onExport: () => void;
  onImport: () => void;
  onCopy: () => void;
  onValidate: () => void;
  onSave: () => void;
  isValidating: boolean;
  isUpdating: boolean;
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
}: ConfigActionsProps) {
  const { t } = useTranslation();

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
      <Button icon={<UploadOutlined />} onClick={onImport}>
        {t('config.importConfig')}
      </Button>
      <Button icon={<CopyOutlined />} onClick={onCopy}>
        {t('config.copyConfig')}
      </Button>
      <Button icon={<CheckCircleOutlined />} onClick={onValidate} loading={isValidating}>
        {t('config.validateConfig')}
      </Button>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        onClick={onSave}
        loading={isUpdating}
      >
        {t('config.saveConfig')}
      </Button>
    </Space>
  );
}

