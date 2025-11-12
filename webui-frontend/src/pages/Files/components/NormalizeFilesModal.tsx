import { useState } from 'react';
import { Modal, Space, Alert, Checkbox, Select, Typography, Descriptions, Spin, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useFileNormalize } from '../../../hooks/useFiles';

const { Option } = Select;
const { Text } = Typography;

export interface NormalizeFilesModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * File normalization modal component
 */
export function NormalizeFilesModal({ visible, onClose }: NormalizeFilesModalProps) {
  const { t } = useTranslation();
  const { normalizeAsync, isNormalizing, normalizeResult } = useFileNormalize();

  const [normalizeOptions, setNormalizeOptions] = useState({
    dryRun: true,
    normalizeNames: true,
    reorganize: true,
    updateDatabase: true,
    type: 'all' as 'illustration' | 'novel' | 'all',
  });

  const handlePreview = async () => {
    try {
      await normalizeAsync({ ...normalizeOptions, dryRun: true });
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const handleExecute = async () => {
    try {
      await normalizeAsync({ ...normalizeOptions, dryRun: false });
      onClose();
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const handleClose = () => {
    setNormalizeOptions({
      dryRun: true,
      normalizeNames: true,
      reorganize: true,
      updateDatabase: true,
      type: 'all',
    });
    onClose();
  };

  const result = normalizeResult?.result;

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      title={t('files.normalizeTitle')}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="preview"
          onClick={handlePreview}
          loading={isNormalizing}
        >
          {t('files.previewButton')}
        </Button>,
        <Button
          key="execute"
          type="primary"
          onClick={handleExecute}
          loading={isNormalizing}
          danger={!normalizeOptions.dryRun}
        >
          {t('files.executeNormalize')}
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Alert
          message={t('files.normalizeTitle')}
          description={t('files.normalizeDescription')}
          type="info"
          showIcon
        />

        <div>
          <Text strong>{t('files.normalizeOptions')}</Text>
          <Space direction="vertical" style={{ marginTop: 8, width: '100%' }}>
            <Checkbox
              checked={normalizeOptions.normalizeNames}
              onChange={(e) =>
                setNormalizeOptions({ ...normalizeOptions, normalizeNames: e.target.checked })
              }
            >
              {t('files.normalizeNames')}
            </Checkbox>
            <Checkbox
              checked={normalizeOptions.reorganize}
              onChange={(e) =>
                setNormalizeOptions({ ...normalizeOptions, reorganize: e.target.checked })
              }
            >
              {t('files.reorganize')}
            </Checkbox>
            <Checkbox
              checked={normalizeOptions.updateDatabase}
              onChange={(e) =>
                setNormalizeOptions({ ...normalizeOptions, updateDatabase: e.target.checked })
              }
            >
              {t('files.updateDatabase')}
            </Checkbox>
          </Space>
        </div>

        <div>
          <Text strong>{t('files.fileType')}</Text>
          <Select
            value={normalizeOptions.type}
            onChange={(value) =>
              setNormalizeOptions({ ...normalizeOptions, type: value })
            }
            style={{ width: '100%', marginTop: 8 }}
          >
            <Option value="all">{t('files.allTypes')}</Option>
            <Option value="illustration">{t('files.illustrationOnly')}</Option>
            <Option value="novel">{t('files.novelOnly')}</Option>
          </Select>
        </div>

        {isNormalizing && (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text>{t('files.processing')}</Text>
            </div>
          </div>
        )}

        {result && (
          <div>
            <Text strong>{t('files.normalizeResult')}</Text>
            <Descriptions
              bordered
              column={1}
              size="small"
              style={{ marginTop: 8 }}
            >
              <Descriptions.Item label={t('files.totalFiles')}>
                {result.totalFiles}
              </Descriptions.Item>
              <Descriptions.Item label={t('files.processedFiles')}>
                {result.processedFiles}
              </Descriptions.Item>
              <Descriptions.Item label={t('files.movedFiles')}>
                <Text type="success">
                  {result.movedFiles}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('files.renamedFiles')}>
                <Text type="success">
                  {result.renamedFiles}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('files.updatedDatabase')}>
                <Text type="success">
                  {result.updatedDatabase}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('files.skippedFiles')}>
                {result.skippedFiles}
              </Descriptions.Item>
              <Descriptions.Item label={t('files.errors')}>
                {result.errors?.length > 0 ? (
                  <Text type="danger">
                    {result.errors.length}
                  </Text>
                ) : (
                  <Text type="success">0</Text>
                )}
              </Descriptions.Item>
            </Descriptions>

            {result.errors && result.errors.length > 0 && (
              <Alert
                message={t('files.processingErrors')}
                description={
                  <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {result.errors.map((error: any, index: number) => (
                      <div key={index} style={{ marginBottom: 8 }}>
                        <Text type="danger" strong>
                          {error.file}:
                        </Text>
                        <Text type="danger" style={{ marginLeft: 8 }}>
                          {error.error}
                        </Text>
                      </div>
                    ))}
                  </div>
                }
                type="error"
                style={{ marginTop: 16 }}
              />
            )}

            {normalizeOptions.dryRun && (
              <Alert
                message={t('files.previewMode')}
                description={t('files.previewModeDesc')}
                type="warning"
                style={{ marginTop: 16 }}
              />
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
}

