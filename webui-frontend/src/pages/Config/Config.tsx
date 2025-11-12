import React, { useState, useEffect } from 'react';
import { Form, Tabs, Button, Space, Typography, Select, Tag, Modal, message } from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileTextOutlined,
  CopyOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useConfig, useConfigFiles } from '../../hooks/useConfig';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { api } from '../../services/api';
import { extractErrorInfo, translateErrorCode } from '../../utils/errorCodeTranslator';
import { BasicConfigForm } from './components/BasicConfigForm';
import { NetworkConfigForm } from './components/NetworkConfigForm';
import { StorageConfigForm } from './components/StorageConfigForm';
import { SchedulerConfigForm } from './components/SchedulerConfigForm';
import { DownloadConfigForm } from './components/DownloadConfigForm';
import { TargetsConfigForm } from './components/TargetsConfigForm';
import { ConfigFilesManager } from './components/ConfigFilesManager';
import { ConfigHistoryManager } from './components/ConfigHistoryManager';
import { CodeEditor } from '../../components/common/CodeEditor';

const { Title, Text } = Typography;
const { Option } = Select;

export default function Config() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('files');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
  const [editingConfigFile, setEditingConfigFile] = useState<string | null>(null);

  const { config, isLoading, update, updateAsync, validate, isUpdating, isValidating } = useConfig();
  const { configFiles, refetch: refetchConfigFiles } = useConfigFiles();
  const { handleError } = useErrorHandler();

  // Load config into form when it's available
  useEffect(() => {
    if (config) {
      const { _meta, _validation, ...configWithoutMeta } = config as any;
      const formData = {
        ...configWithoutMeta,
        targets: Array.isArray(configWithoutMeta.targets) ? configWithoutMeta.targets : [],
      };
      form.setFieldsValue(formData);
    }
  }, [config, form]);

  const handleSave = async () => {
    try {
      const values = form.getFieldsValue();
      await updateAsync(values);
      message.success(t('config.saveSuccess'));
    } catch (error: any) {
      const { errorCode, message: errorMessage, details } = extractErrorInfo(error);
      if (errorCode === 'CONFIG_INVALID' && details && Array.isArray(details)) {
        const errorMessages = details.map((err: any) => {
          if (typeof err === 'object' && err.code) {
            return translateErrorCode(err.code, t, err.params);
          }
          return String(err);
        });
        message.error(`${translateErrorCode(errorCode, t)}: ${errorMessages.join(', ')}`);
      } else {
        message.error(errorMessage || t('config.saveFailed'));
      }
    }
  };

  const handleValidate = () => {
    form.validateFields().then((values) => {
      validate(values);
    });
  };

  const handleExportConfig = () => {
    if (!config) {
      message.warning(t('config.configNotLoaded'));
      return;
    }
    
    const { _meta, ...configToExport } = config as any;
    const jsonStr = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('config.configExported'));
  };

  const handleImportConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length === 0) return;

      let successCount = 0;
      let failCount = 0;
      const failedFiles: string[] = [];
      let lastImportedPath: string | null = null;

      for (const file of files) {
        try {
          const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });

          const config = JSON.parse(fileContent);
          const { _meta, ...configToImport } = config;
          
          try {
            const validationResult = await api.validateConfig(configToImport);
            if (!validationResult.data.data.valid) {
              failedFiles.push(`${file.name}: ${t('config.validationFailed')}`);
              failCount++;
              continue;
            }
          } catch (error) {
            console.warn('Config validation error:', error);
          }
        
          try {
            const baseName = file.name.replace(/\.json$/i, '').replace(/^standalone\.config\./i, '');
            const timestamp = new Date().toISOString().split('T')[0];
            const importName = baseName ? `${baseName}-${timestamp}` : `imported-${timestamp}`;
            const result = await api.importConfigFile(configToImport, importName);
            lastImportedPath = result.data.data.path;
            successCount++;
          } catch (error: any) {
            const { message: errorMessage } = extractErrorInfo(error);
            failedFiles.push(`${file.name}: ${errorMessage || error?.message || t('config.unknownError')}`);
            failCount++;
          }
        } catch (error) {
          failedFiles.push(`${file.name}: ${t('config.configFormatError')}`);
          failCount++;
        }
      }

      if (lastImportedPath) {
        try {
          await api.switchConfigFile(lastImportedPath);
        } catch (error) {
          console.warn('Failed to switch to imported config:', error);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['config'] });
      await queryClient.invalidateQueries({ queryKey: ['configFiles'] });
      refetchConfigFiles();

      if (successCount > 0 && failCount === 0) {
        message.success(
          files.length === 1 
            ? t('config.configImportedAndSaved')
            : t('config.configBatchImportedSuccess', { count: successCount })
        );
      } else if (successCount > 0 && failCount > 0) {
        message.warning(
          t('config.configBatchImportedPartial', { 
            success: successCount, 
            total: files.length,
            failed: failCount 
          })
        );
      } else {
        message.error(
          files.length === 1
            ? `${t('config.configImportFailed')}: ${failedFiles[0] || t('config.unknownError')}`
            : t('config.configBatchImportedFailed', { count: failCount })
        );
      }
    };
    input.click();
  };

  const handleCopyConfig = () => {
    const values = form.getFieldsValue();
    const jsonStr = JSON.stringify(values, null, 2);
    navigator.clipboard.writeText(jsonStr);
    message.success(t('config.configCopied'));
  };

  const getConfigPreview = () => {
    return JSON.stringify(form.getFieldsValue(), null, 2);
  };

  const handleConfigFileSwitch = () => {
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleConfigApplied = () => {
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleTargetChange = async () => {
    // Auto-save targets when changed
    try {
      const values = form.getFieldsValue();
      const currentConfig = config || {};
      const { _meta, ...configWithoutMeta } = currentConfig as any;
      const payload = {
        ...configWithoutMeta,
        ...values,
        targets: values.targets,
      };
      await updateAsync(payload);
    } catch (error) {
      console.error('Failed to auto-save targets:', error);
    }
  };

  if (isLoading) {
    return <div>{t('common.loading')}</div>;
  }

  const currentConfigPath = (config as any)?._meta?.configPathRelative || (config as any)?._meta?.configPath || t('config.unknown');
  const activeConfigFile = configFiles?.find((f: any) => f.isActive);

  return (
    <div>
      <div style={{ marginBottom: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 200 }}>
          <Title level={2} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'normal' }}>
            {t('config.title')}
          </Title>
          <Space direction="vertical" size="small" style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('config.currentConfigFile')}: {currentConfigPath}
            </Text>
            {configFiles && configFiles.length > 0 && (
              <Select
                value={activeConfigFile?.filename || undefined}
                onChange={async (filename: string) => {
                  const file = configFiles.find((f: any) => f.filename === filename);
                  if (file && !file.isActive) {
                    try {
                      await api.switchConfigFile(file.path);
                      message.success(t('config.configSwitched'));
                      await queryClient.invalidateQueries({ queryKey: ['config'] });
                      await queryClient.invalidateQueries({ queryKey: ['configFiles'] });
                      refetchConfigFiles();
                      handleConfigFileSwitch();
                    } catch (error: any) {
                      message.error(t('config.configSwitchFailed'));
                    }
                  }
                }}
                style={{ width: 300, fontSize: 12 }}
                placeholder={t('config.selectConfigFile')}
                size="small"
              >
                {configFiles.map((file: any) => (
                  <Option key={file.filename} value={file.filename}>
                    {file.isActive && <Tag color="green" style={{ marginRight: 8 }}>{t('config.activeConfig')}</Tag>}
                    {file.filename}
                  </Option>
                ))}
              </Select>
            )}
          </Space>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['config'] })}>
            {t('common.refresh')}
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => setPreviewVisible(true)}>
            {t('config.previewConfig')}
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportConfig}>
            {t('config.exportConfig')}
          </Button>
          <Button icon={<UploadOutlined />} onClick={handleImportConfig}>
            {t('config.importConfig')}
          </Button>
          <Button icon={<CopyOutlined />} onClick={handleCopyConfig}>
            {t('config.copyConfig')}
          </Button>
          <Button icon={<CheckCircleOutlined />} onClick={handleValidate} loading={isValidating}>
            {t('config.validateConfig')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={isUpdating}
          >
            {t('config.saveConfig')}
          </Button>
        </Space>
      </div>

      <Form form={form} layout="vertical">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab={<><FileTextOutlined /> {t('config.tabConfigFiles')}</>} key="files">
            <ConfigFilesManager
              onConfigFileSwitch={handleConfigFileSwitch}
              onJsonEditorOpen={(filename) => {
                setEditingConfigFile(filename);
                setJsonEditorVisible(true);
              }}
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
            <ConfigHistoryManager onConfigApplied={handleConfigApplied} />
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('config.tabTargets')} key="targets">
            <TargetsConfigForm form={form} onTargetChange={handleTargetChange} />
          </Tabs.TabPane>
        </Tabs>
      </Form>

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

