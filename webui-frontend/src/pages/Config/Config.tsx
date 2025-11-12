import { useState } from 'react';
import { Modal, Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConfigFiles } from '../../hooks/useConfig';
import { useConfigForm, useConfigOperations } from './hooks';
import { ConfigHeader } from './components/ConfigHeader';
import { ConfigActions } from './components/ConfigActions';
import { ConfigTabs } from './components/ConfigTabs';
import { CodeEditor } from '../../components/common/CodeEditor';

export default function Config() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('files');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
  const [editingConfigFile, setEditingConfigFile] = useState<string | null>(null);

  const {
    form,
    config,
    isLoading,
    isUpdating,
    isValidating,
    handleSave,
    handleValidate,
    handleTargetChange,
    getConfigPreview,
    refreshConfig,
  } = useConfigForm();

  const {
    handleExportConfig,
    handleImportConfig,
    handleCopyConfig,
    handleConfigFileSwitch,
    handleConfigApplied,
  } = useConfigOperations(config);

  const { configFiles, refetch: refetchConfigFiles } = useConfigFiles();


  if (isLoading) {
    return <div>{t('common.loading')}</div>;
  }

  const currentConfigPath = (config as any)?._meta?.configPathRelative || (config as any)?._meta?.configPath || t('config.unknown');

  return (
    <div>
      <div style={{ marginBottom: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <ConfigHeader
          currentConfigPath={currentConfigPath}
          configFiles={configFiles}
          onConfigFileSwitch={handleConfigFileSwitch}
          refetchConfigFiles={refetchConfigFiles}
        />
        <ConfigActions
          onRefresh={refreshConfig}
          onPreview={() => setPreviewVisible(true)}
          onExport={handleExportConfig}
          onImport={handleImportConfig}
          onCopy={() => handleCopyConfig(getConfigPreview())}
          onValidate={handleValidate}
          onSave={handleSave}
          isValidating={isValidating}
          isUpdating={isUpdating}
        />
      </div>

      <ConfigTabs
        form={form}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onConfigFileSwitch={handleConfigFileSwitch}
        onJsonEditorOpen={(filename) => {
          setEditingConfigFile(filename);
          setJsonEditorVisible(true);
        }}
        onConfigApplied={handleConfigApplied}
        onTargetChange={handleTargetChange}
      />

      {/* Config Preview Modal */}
      <Modal
        title={t('config.previewConfig')}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => {
            navigator.clipboard.writeText(getConfigPreview());
            message.success(t('config.configCopied'));
          }}>
            {t('common.copy')}
          </Button>,
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            {t('common.close')}
          </Button>,
        ]}
        width={800}
      >
        <CodeEditor
          value={getConfigPreview()}
          readOnly
          language="json"
          minHeight={400}
          maxHeight={600}
        />
      </Modal>

      {/* JSON Editor Modal - handled by ConfigFilesManager */}
      {jsonEditorVisible && editingConfigFile && (
        <div>
          {/* This will be handled by ConfigJsonEditor component */}
        </div>
      )}
    </div>
  );
}

