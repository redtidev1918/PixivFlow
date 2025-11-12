import React, { useState } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Alert, Popconfirm, message } from 'antd';
import { EditOutlined, PlayCircleOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConfigFiles } from '../../../hooks/useConfig';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { api } from '../../../services/api';
import { extractErrorInfo } from '../../../utils/errorCodeTranslator';
import { ConfigJsonEditor } from './ConfigJsonEditor';

const { Text } = Typography;

interface ConfigFile {
  filename: string;
  path: string;
  pathRelative: string;
  modifiedTime: string;
  size: number;
  isActive: boolean;
}

interface ConfigFilesManagerProps {
  onConfigFileSwitch?: () => void;
  onJsonEditorOpen?: (filename: string) => void;
}

export const ConfigFilesManager: React.FC<ConfigFilesManagerProps> = ({
  onConfigFileSwitch,
  onJsonEditorOpen,
}) => {
  const { t } = useTranslation();
  const { configFiles, isLoading, refetch, switchFileAsync, deleteFileAsync } = useConfigFiles();
  const { handleError } = useErrorHandler();
  const [jsonEditorVisible, setJsonEditorVisible] = useState(false);
  const [editingConfigFile, setEditingConfigFile] = useState<string | null>(null);
  const [jsonEditorLoading, setJsonEditorLoading] = useState(false);

  const handleEditJson = async (filename: string) => {
    if (onJsonEditorOpen) {
      onJsonEditorOpen(filename);
      return;
    }

    try {
      setJsonEditorLoading(true);
      setEditingConfigFile(filename);
      setJsonEditorVisible(true);
    } catch (error: any) {
      const { message: errorMessage } = extractErrorInfo(error);
      message.error(
        `${t('config.configFileReadFailed')}: ${errorMessage || error?.message || t('config.unknownError')}`
      );
    } finally {
      setJsonEditorLoading(false);
    }
  };

  const handleSwitchFile = async (file: ConfigFile) => {
    if (file.isActive) return;

    try {
      await switchFileAsync(file.path);
      message.success(t('config.configSwitched'));
      if (onConfigFileSwitch) {
        onConfigFileSwitch();
      }
    } catch (error: any) {
      handleError(error);
    }
  };

  const handleDeleteFile = async (filename: string) => {
    try {
      await deleteFileAsync(filename);
      message.success(t('config.configFileDeleted'));
      refetch();
    } catch (error: any) {
      handleError(error);
    }
  };

  const columns = [
    {
      title: t('config.fileName'),
      dataIndex: 'filename',
      key: 'filename',
      render: (filename: string, record: ConfigFile) => (
        <Space>
          <Text strong={record.isActive}>{filename}</Text>
          {record.isActive && <Tag color="green">{t('config.activeConfig')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('config.filePath'),
      dataIndex: 'pathRelative',
      key: 'pathRelative',
      render: (path: string) => <Text type="secondary" style={{ fontSize: 12 }}>{path}</Text>,
    },
    {
      title: t('config.fileModified'),
      dataIndex: 'modifiedTime',
      key: 'modifiedTime',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('config.fileSize'),
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => `${(size / 1024).toFixed(2)} KB`,
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 250,
      render: (_: any, record: ConfigFile) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditJson(record.filename)}
            size="small"
          >
            {t('config.editJson')}
          </Button>
          {!record.isActive && (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => handleSwitchFile(record)}
              size="small"
            >
              {t('config.switch')}
            </Button>
          )}
          <Popconfirm
            title={t('config.deleteConfigFileConfirm')}
            onConfirm={() => handleDeleteFile(record.filename)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title={t('config.configFiles')}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            {t('common.refresh')}
          </Button>
        }
      >
        {configFiles && configFiles.length > 0 ? (
          <Table
            columns={columns}
            dataSource={configFiles}
            rowKey="filename"
            loading={isLoading}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: t('config.configFilesEmpty') }}
          />
        ) : (
          <Alert
            message={t('config.configFilesEmpty')}
            description={t('config.configFilesEmptyDesc')}
            type="info"
            showIcon
          />
        )}
      </Card>

      {jsonEditorVisible && editingConfigFile && (
        <ConfigJsonEditor
          visible={jsonEditorVisible}
          filename={editingConfigFile}
          onClose={() => {
            setJsonEditorVisible(false);
            setEditingConfigFile(null);
          }}
          onConfigFileSwitch={onConfigFileSwitch}
        />
      )}
    </>
  );
};

