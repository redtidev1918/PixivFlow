import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Space, Alert, Spin, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { CodeEditor } from '../../../components/common/CodeEditor';
import { useConfigFiles } from '../../../hooks/useConfig';
import { extractErrorInfo, translateErrorCode } from '../../../utils/errorCodeTranslator';

interface ConfigJsonEditorProps {
  visible: boolean;
  filename: string;
  onClose: () => void;
  onConfigFileSwitch?: () => void;
}

export const ConfigJsonEditor: React.FC<ConfigJsonEditorProps> = ({
  visible,
  filename,
  onClose,
  onConfigFileSwitch,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { configFiles, refetch: refetchConfigFiles } = useConfigFiles();
  const [jsonContent, setJsonContent] = useState<string>('');
  const [jsonEditorLoading, setJsonEditorLoading] = useState(false);
  const [lastReadContent, setLastReadContent] = useState<string>('');
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  
  const lastReadContentRef = useRef<string>('');
  const jsonContentRef = useRef<string>('');

  // Load file content when modal opens
  useEffect(() => {
    if (visible && filename) {
      loadFileContent();
    } else {
      // Reset state when closing
      setJsonContent('');
      setLastReadContent('');
      setHasExternalChanges(false);
      lastReadContentRef.current = '';
      jsonContentRef.current = '';
    }
  }, [visible, filename]);

  // Poll for external changes
  useEffect(() => {
    if (!visible || !filename) {
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isPolling = true;

    const pollFileContent = async () => {
      if (!isPolling || !filename) return;

      try {
        const response = await api.getConfigFileContent(filename);
        const newContent = response.data.data.content;
        const currentLastRead = lastReadContentRef.current;
        const currentEditorContent = jsonContentRef.current;
        
        if (newContent !== currentLastRead && newContent !== currentEditorContent) {
          setHasExternalChanges(true);
          setLastReadContent(newContent);
          lastReadContentRef.current = newContent;
        } else if (newContent === currentEditorContent) {
          setHasExternalChanges(false);
          setLastReadContent(newContent);
          lastReadContentRef.current = newContent;
        } else {
          setLastReadContent(newContent);
          lastReadContentRef.current = newContent;
        }
      } catch (error) {
        console.warn('Failed to poll config file content:', error);
      }
    };

    pollFileContent();
    intervalId = setInterval(pollFileContent, 2000);

    return () => {
      isPolling = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [visible, filename]);

  // Sync refs
  useEffect(() => {
    lastReadContentRef.current = lastReadContent;
  }, [lastReadContent]);

  useEffect(() => {
    jsonContentRef.current = jsonContent;
  }, [jsonContent]);

  const loadFileContent = async () => {
    try {
      setJsonEditorLoading(true);
      const response = await api.getConfigFileContent(filename);
      const content = response.data.data.content;
      setJsonContent(content);
      setLastReadContent(content);
      lastReadContentRef.current = content;
      jsonContentRef.current = content;
      setHasExternalChanges(false);
    } catch (error: any) {
      const { message: errorMessage } = extractErrorInfo(error);
      message.error(
        `${t('config.configFileReadFailed')}: ${errorMessage || error?.message || t('config.unknownError')}`
      );
    } finally {
      setJsonEditorLoading(false);
    }
  };

  const handleRefresh = async () => {
    await loadFileContent();
    message.success(t('config.jsonEditorRefreshed'));
  };

  const handleSave = async () => {
    if (!filename) return;
    
    try {
      setJsonEditorLoading(true);
      
      // Validate JSON first
      try {
        JSON.parse(jsonContent);
      } catch (error) {
        message.error(t('config.jsonFormatError'));
        return;
      }
      
      await api.updateConfigFileContent(filename, jsonContent);
      message.success(t('config.configSaved'));
      
      // Update last read content
      setLastReadContent(jsonContent);
      lastReadContentRef.current = jsonContent;
      jsonContentRef.current = jsonContent;
      setHasExternalChanges(false);
      
      // Refresh config data
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      await queryClient.invalidateQueries({ queryKey: ['configFiles'] });
      refetchConfigFiles();
      
      // If this is the active config, reload the page
      const currentFile = configFiles?.find(
        (f: any) => f.filename === filename && f.isActive
      );
      if (currentFile) {
        if (onConfigFileSwitch) {
          onConfigFileSwitch();
        } else {
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        onClose();
      }
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
        message.error(errorMessage || t('config.configSaveFailed'));
      }
    } finally {
      setJsonEditorLoading(false);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonContent);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonContent(formatted);
      message.success(t('config.jsonFormatted'));
    } catch (error) {
      message.error(t('config.jsonFormatError'));
    }
  };

  return (
    <Modal
      title={
        <Space>
          {t('config.editJson')}
          <span style={{ color: '#999', fontSize: 14 }}>({filename})</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="format" onClick={handleFormat}>
          {t('config.formatJson')}
        </Button>,
        <Button key="cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          loading={jsonEditorLoading}
          onClick={handleSave}
        >
          {t('config.saveConfig')}
        </Button>,
      ]}
    >
      <Spin spinning={jsonEditorLoading && !jsonContent}>
        {hasExternalChanges && (
          <Alert
            message={t('config.jsonEditorExternalChanges')}
            description={t('config.jsonEditorExternalChangesDesc')}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={handleRefresh}>
                {t('config.refresh')}
              </Button>
            }
          />
        )}
        <CodeEditor
          value={jsonContent}
          onChange={(value) => {
            setJsonContent(value);
            if (hasExternalChanges && value !== lastReadContent) {
              setHasExternalChanges(false);
            }
          }}
          language="json"
          minHeight={400}
          maxHeight={600}
          placeholder={t('config.jsonEditorPlaceholder')}
        />
        <Alert
          message={t('config.jsonEditorWarning')}
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Spin>
    </Modal>
  );
};

