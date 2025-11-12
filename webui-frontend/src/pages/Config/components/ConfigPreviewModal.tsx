import { Modal, Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CodeEditor } from '../../../components/common/CodeEditor';

interface ConfigPreviewModalProps {
  visible: boolean;
  configPreview: string;
  onClose: () => void;
}

/**
 * Config preview modal component
 */
export function ConfigPreviewModal({
  visible,
  configPreview,
  onClose,
}: ConfigPreviewModalProps) {
  const { t } = useTranslation();

  const handleCopy = () => {
    navigator.clipboard.writeText(configPreview);
    message.success(t('config.configCopied'));
  };

  return (
    <Modal
      title={t('config.previewConfig')}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={handleCopy}>
          {t('common.copy')}
        </Button>,
        <Button key="close" onClick={onClose}>
          {t('common.close')}
        </Button>,
      ]}
      width={800}
    >
      <CodeEditor
        value={configPreview}
        readOnly
        language="json"
        minHeight={400}
        maxHeight={600}
      />
    </Modal>
  );
}

