import { useTranslation } from 'react-i18next';
import { useConfigFiles } from '../../hooks/useConfig';
import { useConfigForm, useConfigOperations, useConfigModals, useConfigTabs } from './hooks';
import { ConfigHeader } from './components/ConfigHeader';
import { ConfigActions } from './components/ConfigActions';
import { ConfigTabs } from './components/ConfigTabs';
import { ConfigPreviewModal } from './components/ConfigPreviewModal';
import { ConfigJsonEditor } from './components/ConfigJsonEditor';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';

export default function Config() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useConfigTabs();
  const {
    previewVisible,
    jsonEditorVisible,
    editingConfigFile,
    openPreview,
    closePreview,
    openJsonEditor,
    closeJsonEditor,
  } = useConfigModals();

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
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        <LoadingSpinner />
      </div>
    );
  }

  const currentConfigPath =
    config?._meta?.configPathRelative ??
    config?._meta?.configPath ??
    t('config.unknown');

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
          onPreview={openPreview}
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
        onJsonEditorOpen={openJsonEditor}
        onConfigApplied={handleConfigApplied}
        onTargetChange={handleTargetChange}
      />

      {/* Config Preview Modal */}
      <ConfigPreviewModal
        visible={previewVisible}
        configPreview={getConfigPreview()}
        onClose={closePreview}
      />

      {/* JSON Editor Modal - handled by ConfigFilesManager */}
      {jsonEditorVisible && editingConfigFile && (
        <ConfigJsonEditor
          visible={jsonEditorVisible}
          filename={editingConfigFile}
          onClose={closeJsonEditor}
          onConfigFileSwitch={handleConfigFileSwitch}
        />
      )}
    </div>
  );
}

