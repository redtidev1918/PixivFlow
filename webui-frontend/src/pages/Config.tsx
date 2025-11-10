import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Select,
  Tabs,
  message,
  Space,
  Typography,
  Divider,
  Table,
  Tag,
  Popconfirm,
  Modal,
  Tooltip,
  Steps,
  Collapse,
  Alert,
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileTextOutlined,
  CopyOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { translateErrorCode, extractErrorInfo } from '../utils/errorCodeTranslator';

const { Title, Text, Paragraph } = Typography;
const { Option, OptGroup } = Select;
const { Panel } = Collapse;
const { Step } = Steps;

interface TargetConfig {
  type: 'illustration' | 'novel';
  tag?: string;
  limit?: number;
  searchTarget?: string;
  sort?: string;
  mode?: string;
  rankingMode?: string;
  rankingDate?: string;
  filterTag?: string;
  minBookmarks?: number;
  startDate?: string;
  endDate?: string;
  seriesId?: number;
  novelId?: number;
  [key: string]: any;
}

export default function Config() {
  const { t } = useTranslation();
  
  // 配置模板
  const configTemplates = {
    tagSearch: {
      name: t('config.templateTagSearch'),
      description: t('config.templateTagSearchDesc'),
    config: {
      type: 'illustration',
      mode: 'search',
      tag: '',
      limit: 20,
      searchTarget: 'partial_match_for_tags',
      sort: 'date_desc',
    },
  },
    ranking: {
      name: t('config.templateRanking'),
      description: t('config.templateRankingDesc'),
    config: {
      type: 'illustration',
      mode: 'ranking',
      rankingMode: 'day',
      limit: 30,
    },
  },
    multiTag: {
      name: t('config.templateMultiTag'),
      description: t('config.templateMultiTagDesc'),
    config: {
      type: 'illustration',
      mode: 'search',
      tag: '',
      limit: 30,
      searchTarget: 'partial_match_for_tags',
    },
  },
    highQuality: {
      name: t('config.templateHighQuality'),
      description: t('config.templateHighQualityDesc'),
    config: {
      type: 'illustration',
      mode: 'search',
      tag: '',
      limit: 20,
      minBookmarks: 1000,
      sort: 'popular_desc',
    },
  },
    novel: {
      name: t('config.templateNovel'),
      description: t('config.templateNovelDesc'),
    config: {
      type: 'novel',
      mode: 'search',
      tag: '',
      limit: 10,
    },
    },
  };

  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [targetForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('basic');
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetConfig | null>(null);
  const [targetStep, setTargetStep] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);

  const { data: configData, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
  });

  // Get configuration history
  const { data: configHistoryData, refetch: refetchHistory } = useQuery({
    queryKey: ['configHistory'],
    queryFn: () => api.getConfigHistory(),
  });

  // Get configuration files list
  const { data: configFilesData, refetch: refetchConfigFiles } = useQuery({
    queryKey: ['configFiles'],
    queryFn: () => api.listConfigFiles(),
  });

  useEffect(() => {
    if (configData?.data?.data) {
      // Remove _meta from form data
      const { _meta, ...configWithoutMeta } = configData.data.data;
      // Ensure targets is always an array (even if undefined in config)
      const formData = {
        ...configWithoutMeta,
        targets: configWithoutMeta.targets || [],
      };
      form.setFieldsValue(formData);
    }
  }, [configData, form]);

  const updateConfigMutation = useMutation({
    mutationFn: (values: any) => api.updateConfig(values),
    onSuccess: async () => {
      message.success(t('config.saveSuccess'));
      // Invalidate and refetch config to ensure UI is in sync
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      // Refetch immediately to get the latest config
      await queryClient.refetchQueries({ queryKey: ['config'] });
    },
    onError: (error: any) => {
      const { errorCode, message: errorMessage, details } = extractErrorInfo(error);
      if (errorCode) {
        // Handle validation errors
        if (errorCode === 'CONFIG_INVALID' && details && Array.isArray(details)) {
          const errorMessages = details.map((err: any) => {
            if (typeof err === 'object' && err.code) {
              return translateErrorCode(err.code, t, err.params);
            }
            return String(err);
          });
          message.error(`${translateErrorCode(errorCode, t)}: ${errorMessages.join(', ')}`);
        } else {
          message.error(translateErrorCode(errorCode, t, undefined, errorMessage || t('config.saveFailed')));
        }
      } else {
        message.error(errorMessage || t('config.saveFailed'));
      }
    },
  });

  const validateConfigMutation = useMutation({
    mutationFn: (values: any) => api.validateConfig(values),
    onSuccess: (data) => {
      if (data.data.data.valid) {
        message.success(t('config.validationPassed'));
      } else {
        message.error(`${t('config.validationFailed')}: ${data.data.data.errors?.join(', ')}`);
      }
    },
  });

  const handleSave = () => {
    // Get all field values first (form.getFieldsValue() gets all values regardless of validation)
    const values = form.getFieldsValue();
    
    // Try to validate fields, but don't block saving if validation fails
    // Backend will do the final validation anyway
    form.validateFields()
      .then(() => {
        // If validation passes, save
        updateConfigMutation.mutate(values);
      })
      .catch(() => {
        // Even if frontend validation fails, still try to save
        // Backend validation is more complete and will catch real issues
        updateConfigMutation.mutate(values);
      });
  };

  const handleValidate = () => {
    form.validateFields().then((values) => {
      validateConfigMutation.mutate(values);
    });
  };

  const handleAddTarget = () => {
    setEditingTarget(null);
    targetForm.resetFields();
    setTargetStep(0);
    setTargetModalVisible(true);
  };

  const handleEditTarget = (target: TargetConfig, index: number) => {
    setEditingTarget({ ...target, _index: index });
    targetForm.setFieldsValue(target);
    setTargetStep(1);
    setTargetModalVisible(true);
  };

  const handleDeleteTarget = async (index: number) => {
    const targets = form.getFieldValue('targets') || [];
    const newTargets = [...targets]; // Create a new array to avoid mutation issues
    newTargets.splice(index, 1);
    form.setFieldsValue({ targets: newTargets });
    
    // Auto-save to backend immediately
    try {
      // Get current config from server to ensure we have all fields
      const currentConfig = configData?.data?.data || {};
      const { _meta, ...configWithoutMeta } = currentConfig;
      
      // Get all form values and merge with server config
      const allValues = form.getFieldsValue();
      // Ensure targets is always included in the payload, and merge with server config
      const payload = {
        ...configWithoutMeta, // Start with server config to preserve all fields
        ...allValues, // Override with form values
        targets: newTargets, // Explicitly set targets
      };
      await updateConfigMutation.mutateAsync(payload);
      message.success(t('config.targetDeleted'));
    } catch (error) {
      // If save fails, still show success for UI update, but warn user
      message.warning(t('config.targetDeletedButSaveFailed'));
      console.error('Failed to auto-save after deleting target:', error);
    }
  };

  const handleSaveTarget = () => {
    targetForm.validateFields().then(async (values) => {
      const currentTargets = form.getFieldValue('targets') || [];
      const newTargets = [...currentTargets]; // Create a new array to avoid mutation issues
      
      if (editingTarget && typeof editingTarget._index === 'number') {
        newTargets[editingTarget._index] = values;
      } else {
        newTargets.push(values);
      }
      
      form.setFieldsValue({ targets: newTargets });
      setTargetModalVisible(false);
      setTargetStep(0);
      targetForm.resetFields();
      
      // Auto-save to backend immediately
      try {
        // Get current config from server to ensure we have all fields
        const currentConfig = configData?.data?.data || {};
        const { _meta, ...configWithoutMeta } = currentConfig;
        
        // Get all form values and merge with server config
        const allValues = form.getFieldsValue();
        // Ensure targets is always included in the payload, and merge with server config
        const payload = {
          ...configWithoutMeta, // Start with server config to preserve all fields
          ...allValues, // Override with form values
          targets: newTargets, // Explicitly set targets
        };
        await updateConfigMutation.mutateAsync(payload);
        message.success(t('config.targetSaved'));
      } catch (error) {
        // If save fails, still show success for UI update, but warn user
        message.warning(t('config.targetSavedButSaveFailed'));
        console.error('Failed to auto-save after adding target:', error);
      }
    });
  };

  const handleApplyTemplate = (template: typeof configTemplates[keyof typeof configTemplates]) => {
    targetForm.setFieldsValue(template.config);
    setTargetStep(1);
    message.success(`${t('config.templateApplied')}: ${template.name}`);
  };

  const handleExportConfig = () => {
    // Export the actual server config, not form values (which may be unsaved)
    if (!configData?.data?.data) {
      message.warning(t('config.configNotLoaded'));
      return;
    }
    
    // Remove _meta from exported config
    const { _meta, ...configToExport } = configData.data.data;
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
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const config = JSON.parse(event.target?.result as string);
            // Remove _meta if present
            const { _meta, ...configToImport } = config;
            
            // Validate before importing
            try {
              const validationResult = await api.validateConfig(configToImport);
              if (!validationResult.data.data.valid) {
                message.error(`${t('config.validationFailed')}: ${validationResult.data.data.errors?.join(', ')}`);
                return;
              }
            } catch (error) {
              // If validation fails, still allow import but warn user
              console.warn('Config validation error:', error);
            }
          
          // Import configuration file with auto-numbering
          try {
            const timestamp = new Date().toISOString().split('T')[0];
            const importName = `imported-${timestamp}`;
            const result = await api.importConfigFile(configToImport, importName);
            
            // Switch to the newly imported config
            await api.switchConfigFile(result.data.data.path);
            
            // Refresh config data and files list
            await queryClient.invalidateQueries({ queryKey: ['config'] });
            await queryClient.invalidateQueries({ queryKey: ['configFiles'] });
            refetchConfigFiles();
            
            message.success(t('config.configImportedAndSaved'));
          } catch (error: any) {
            const { message: errorMessage } = extractErrorInfo(error);
            message.error(
              `${t('config.configImportFailed')}: ${errorMessage || error?.message || t('config.unknownError')}`
            );
            console.error('Failed to import config file:', error);
          }
        } catch (error) {
          message.error(t('config.configFormatError'));
          console.error('Failed to parse imported config:', error);
        }
        };
        reader.readAsText(file);
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

  const targets = form.getFieldValue('targets') || [];

  const targetColumns = [
    {
      title: t('config.targetType'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'illustration' ? 'blue' : 'green'}>
          {type === 'illustration' ? t('config.typeIllustration') : t('config.typeNovel')}
        </Tag>
      ),
    },
    {
      title: t('config.targetMode'),
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode: string) => {
        if (!mode) return '-';
        return <Tag color={mode === 'ranking' ? 'purple' : 'cyan'}>{mode === 'ranking' ? t('config.modeRanking') : t('config.modeSearch')}</Tag>;
      },
    },
    {
      title: t('config.targetConfig'),
      key: 'config',
      render: (_: any, record: TargetConfig) => {
        if (record.mode === 'ranking') {
          const rankingLabels: Record<string, string> = {
            day: t('config.rankingDay'),
            week: t('config.rankingWeek'),
            month: t('config.rankingMonth'),
            day_male: t('config.rankingDayMale'),
            day_female: t('config.rankingDayFemale'),
            day_ai: t('config.rankingDayAI'),
            week_original: t('config.rankingWeekOriginal'),
            week_rookie: t('config.rankingWeekRookie'),
          };
          return (
            <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
              <Text strong>{rankingLabels[record.rankingMode || 'day'] || record.rankingMode}</Text>
              {record.filterTag && <Text type="secondary">{t('config.filterTag')}: {record.filterTag}</Text>}
              {record.rankingDate && <Text type="secondary">{t('config.rankingDate')}: {record.rankingDate}</Text>}
            </Space>
          );
        }
        if (record.seriesId) {
          return <Text>{t('config.seriesId')}: {record.seriesId}</Text>;
        }
        if (record.novelId) {
          return <Text>{t('config.novelId')}: {record.novelId}</Text>;
        }
        return (
          <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
            <Text strong>{record.tag || '-'}</Text>
            {record.searchTarget && (
              <Text type="secondary">
                {record.searchTarget === 'partial_match_for_tags'
                  ? t('config.searchTargetPartial')
                  : record.searchTarget === 'exact_match_for_tags'
                  ? t('config.searchTargetExact')
                  : t('config.searchTargetTitle')}
              </Text>
            )}
            {record.sort && (
              <Text type="secondary">
                {record.sort === 'date_desc'
                  ? t('config.sortDateDesc')
                  : record.sort === 'date_asc'
                  ? t('config.sortDateAsc')
                  : t('config.sortPopularDesc')}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: t('config.targetFilters'),
      key: 'filters',
      width: 150,
      render: (_: any, record: TargetConfig) => (
        <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
          {record.limit && <Text>{t('config.limit')}: {record.limit}</Text>}
          {record.minBookmarks && <Text type="secondary">{t('config.minBookmarks')} ≥ {record.minBookmarks}</Text>}
          {(record.startDate || record.endDate) && (
            <Text type="secondary">
              {record.startDate && `${t('config.from')} ${record.startDate}`}
              {record.endDate && ` ${t('config.to')} ${record.endDate}`}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 150,
      render: (_: any, record: TargetConfig, index: number) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditTarget(record, index)}
            size="small"
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('config.deleteTargetConfirm')}
            onConfirm={() => handleDeleteTarget(index)}
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

  if (isLoading) {
    return <div>{t('common.loading')}</div>;
  }

  const currentConfigPath = configData?.data?.data?._meta?.configPathRelative || configData?.data?.data?._meta?.configPath || t('config.unknown');

  return (
    <div>
      <div style={{ marginBottom: 16, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 auto', minWidth: 200 }}>
          <Title level={2} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'normal' }}>
            {t('config.title')}
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('config.currentConfigFile')}: {currentConfigPath}
          </Text>
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
          <Button icon={<CheckCircleOutlined />} onClick={handleValidate} loading={validateConfigMutation.isPending}>
            {t('config.validateConfig')}
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={updateConfigMutation.isPending}
          >
            {t('config.saveConfig')}
          </Button>
        </Space>
      </div>

      <Form form={form} layout="vertical">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          {/* 基础配置 */}
          <Tabs.TabPane tab={t('config.tabBasic')} key="basic">
            <Card>
              <Form.Item
                label={
                  <Space>
                    {t('config.logLevel')}
                    <Tooltip title={t('config.logLevelTooltip')}>
                      <QuestionCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                  </Space>
                }
                name="logLevel"
              >
                <Select>
                  <Option value="debug">{t('config.logLevelDebug')}</Option>
                  <Option value="info">{t('config.logLevelInfo')}</Option>
                  <Option value="warn">{t('config.logLevelWarn')}</Option>
                  <Option value="error">{t('config.logLevelError')}</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label={
                  <Space>
                    {t('config.initialDelay')}
                    <Tooltip title={t('config.initialDelayTooltip')}>
                      <QuestionCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                  </Space>
                }
                name="initialDelay"
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder={t('config.initialDelayPlaceholder')} />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* Pixiv 凭证 */}
          <Tabs.TabPane tab={t('config.tabPixiv')} key="pixiv">
            <Card>
              <Text type="secondary">
                {t('config.pixivCredentialsHidden')}
              </Text>
              <Divider />
              <Form.Item label="Client ID" name={['pixiv', 'clientId']}>
                <Input disabled />
              </Form.Item>
              <Form.Item label="Refresh Token" name={['pixiv', 'refreshToken']}>
                <Input.Password disabled placeholder="***" />
              </Form.Item>
              <Form.Item label="User Agent" name={['pixiv', 'userAgent']}>
                <Input disabled />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 网络配置 */}
          <Tabs.TabPane tab={t('config.tabNetwork')} key="network">
            <Card>
              <Form.Item label={t('config.networkTimeout')} name={['network', 'timeoutMs']}>
                <InputNumber min={1000} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={t('config.networkRetries')} name={['network', 'retries']}>
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={t('config.networkRetryDelay')} name={['network', 'retryDelay']}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Divider>{t('config.proxySettings')}</Divider>

              <Form.Item label={t('config.proxyEnabled')} name={['network', 'proxy', 'enabled']} valuePropName="checked">
                <Switch />
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues.network?.proxy?.enabled !== currentValues.network?.proxy?.enabled
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue(['network', 'proxy', 'enabled']) ? (
                    <>
                      <Form.Item label={t('config.proxyHost')} name={['network', 'proxy', 'host']}>
                        <Input />
                      </Form.Item>
                      <Form.Item label={t('config.proxyPort')} name={['network', 'proxy', 'port']}>
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label={t('config.proxyProtocol')} name={['network', 'proxy', 'protocol']}>
                        <Select>
                          <Option value="http">HTTP</Option>
                          <Option value="https">HTTPS</Option>
                          <Option value="socks4">SOCKS4</Option>
                          <Option value="socks5">SOCKS5</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item label={t('config.proxyUsername')} name={['network', 'proxy', 'username']}>
                        <Input />
                      </Form.Item>
                      <Form.Item label={t('config.proxyPassword')} name={['network', 'proxy', 'password']}>
                        <Input.Password />
                      </Form.Item>
                    </>
                  ) : null
                }
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 存储配置 */}
          <Tabs.TabPane tab={t('config.tabStorage')} key="storage">
            <Card>
              <Form.Item label={t('config.storageDatabasePath')} name={['storage', 'databasePath']}>
                <Input />
              </Form.Item>

              <Form.Item label={t('config.storageDownloadDirectory')} name={['storage', 'downloadDirectory']}>
                <Input />
              </Form.Item>

              <Form.Item label={t('config.storageIllustrationDirectory')} name={['storage', 'illustrationDirectory']}>
                <Input />
              </Form.Item>

              <Form.Item label={t('config.storageNovelDirectory')} name={['storage', 'novelDirectory']}>
                <Input />
              </Form.Item>

              <Form.Item 
                label={t('config.storageIllustrationOrganization')} 
                name={['storage', 'illustrationOrganization']}
                tooltip={t('config.storageIllustrationOrganizationTooltip')}
              >
                <Select>
                  <OptGroup label={t('config.organizationGroupSimple')}>
                    <Option value="flat">{t('config.organizationFlat')}</Option>
                    <Option value="byAuthor">{t('config.organizationByAuthor')}</Option>
                    <Option value="byTag">{t('config.organizationByTag')}</Option>
                  </OptGroup>
                  <OptGroup label={t('config.organizationGroupDate')}>
                    <Option value="byDate">{t('config.organizationByDate')}</Option>
                    <Option value="byDay">{t('config.organizationByDay')}</Option>
                    <Option value="byDownloadDate">{t('config.organizationByDownloadDate')}</Option>
                    <Option value="byDownloadDay">{t('config.organizationByDownloadDay')}</Option>
                  </OptGroup>
                  <OptGroup label={t('config.organizationGroupCombined')}>
                    <Option value="byAuthorAndTag">{t('config.organizationByAuthorAndTag')}</Option>
                    <Option value="byDateAndAuthor">{t('config.organizationByDateAndAuthor')}</Option>
                    <Option value="byDayAndAuthor">{t('config.organizationByDayAndAuthor')}</Option>
                    <Option value="byDownloadDateAndAuthor">{t('config.organizationByDownloadDateAndAuthor')}</Option>
                    <Option value="byDownloadDayAndAuthor">{t('config.organizationByDownloadDayAndAuthor')}</Option>
                  </OptGroup>
                </Select>
              </Form.Item>

              <Form.Item 
                label={t('config.storageNovelOrganization')} 
                name={['storage', 'novelOrganization']}
                tooltip={t('config.storageNovelOrganizationTooltip')}
              >
                <Select>
                  <OptGroup label={t('config.organizationGroupSimple')}>
                    <Option value="flat">{t('config.organizationFlat')}</Option>
                    <Option value="byAuthor">{t('config.organizationByAuthor')}</Option>
                    <Option value="byTag">{t('config.organizationByTag')}</Option>
                  </OptGroup>
                  <OptGroup label={t('config.organizationGroupDate')}>
                    <Option value="byDate">{t('config.organizationByDate')}</Option>
                    <Option value="byDay">{t('config.organizationByDay')}</Option>
                    <Option value="byDownloadDate">{t('config.organizationByDownloadDate')}</Option>
                    <Option value="byDownloadDay">{t('config.organizationByDownloadDay')}</Option>
                  </OptGroup>
                  <OptGroup label={t('config.organizationGroupCombined')}>
                    <Option value="byAuthorAndTag">{t('config.organizationByAuthorAndTag')}</Option>
                    <Option value="byDateAndAuthor">{t('config.organizationByDateAndAuthor')}</Option>
                    <Option value="byDayAndAuthor">{t('config.organizationByDayAndAuthor')}</Option>
                    <Option value="byDownloadDateAndAuthor">{t('config.organizationByDownloadDateAndAuthor')}</Option>
                    <Option value="byDownloadDayAndAuthor">{t('config.organizationByDownloadDayAndAuthor')}</Option>
                  </OptGroup>
                </Select>
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 调度器配置 */}
          <Tabs.TabPane tab={t('config.tabScheduler')} key="scheduler">
            <Card>
              <Form.Item label={t('config.schedulerEnabled')} name={['scheduler', 'enabled']} valuePropName="checked">
                <Switch />
              </Form.Item>

              <Form.Item label={t('config.schedulerCron')} name={['scheduler', 'cron']}>
                <Input placeholder={t('config.schedulerCronPlaceholder')} />
              </Form.Item>

              <Form.Item label={t('config.schedulerTimezone')} name={['scheduler', 'timezone']}>
                <Input placeholder={t('config.schedulerTimezonePlaceholder')} />
              </Form.Item>

              <Form.Item label={t('config.schedulerMaxExecutions')} name={['scheduler', 'maxExecutions']}>
                <InputNumber min={1} style={{ width: '100%' }} placeholder={t('config.schedulerMaxExecutionsPlaceholder')} />
              </Form.Item>

              <Form.Item label={t('config.schedulerMinInterval')} name={['scheduler', 'minInterval']}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={t('config.schedulerTimeout')} name={['scheduler', 'timeout']}>
                <InputNumber min={1000} style={{ width: '100%' }} placeholder={t('config.schedulerTimeoutPlaceholder')} />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 下载配置 */}
          <Tabs.TabPane tab={t('config.tabDownload')} key="download">
            <Card>
              <Form.Item label={t('config.downloadConcurrency')} name={['download', 'concurrency']}>
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={t('config.downloadMaxRetries')} name={['download', 'maxRetries']}>
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={t('config.downloadRetryDelay')} name={['download', 'retryDelay']}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label={t('config.downloadTimeout')} name={['download', 'timeout']}>
                <InputNumber min={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 配置文件管理 */}
          <Tabs.TabPane tab={t('config.tabConfigFiles')} key="files">
            <Card
              title={t('config.configFiles')}
              extra={
                <Button icon={<ReloadOutlined />} onClick={() => refetchConfigFiles()}>
                  {t('common.refresh')}
                </Button>
              }
            >
              {configFilesData?.data?.data && configFilesData.data.data.length > 0 ? (
                <Table
                  columns={[
                    {
                      title: t('config.fileName'),
                      dataIndex: 'filename',
                      key: 'filename',
                      render: (filename: string, record: any) => (
                        <Space>
                          <Text strong={record.isActive}>{filename}</Text>
                          {record.isActive && (
                            <Tag color="green">{t('config.activeConfig')}</Tag>
                          )}
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
                      width: 200,
                      render: (_: any, record: any) => (
                        <Space>
                          {!record.isActive && (
                            <Button
                              type="link"
                              icon={<PlayCircleOutlined />}
                              onClick={async () => {
                                try {
                                  await api.switchConfigFile(record.path);
                                  message.success(t('config.configSwitched'));
                                  await queryClient.invalidateQueries({ queryKey: ['config'] });
                                  await queryClient.invalidateQueries({ queryKey: ['configFiles'] });
                                  refetchConfigFiles();
                                  // Reload config data
                                  setTimeout(() => {
                                    window.location.reload();
                                  }, 1000);
                                } catch (error: any) {
                                  message.error(t('config.configSwitchFailed'));
                                }
                              }}
                              size="small"
                            >
                              {t('config.switch')}
                            </Button>
                          )}
                          <Popconfirm
                            title={t('config.deleteConfigFileConfirm')}
                            onConfirm={async () => {
                              try {
                                await api.deleteConfigFile(record.filename);
                                message.success(t('config.configFileDeleted'));
                                refetchConfigFiles();
                                // If we deleted the active config, reload
                                if (record.isActive) {
                                  setTimeout(() => {
                                    window.location.reload();
                                  }, 1000);
                                }
                              } catch (error: any) {
                                message.error(t('config.configFileDeleteFailed'));
                              }
                            }}
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
                  ]}
                  dataSource={configFilesData.data.data}
                  rowKey="filename"
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
          </Tabs.TabPane>

          {/* 配置历史 */}
          <Tabs.TabPane tab={<><HistoryOutlined /> {t('config.tabHistory')}</>} key="history">
            <Card
              title={t('config.configHistory')}
              extra={
                <Button icon={<ReloadOutlined />} onClick={() => refetchHistory()}>
                  {t('common.refresh')}
                </Button>
              }
            >
              {configHistoryData?.data?.data && configHistoryData.data.data.length > 0 ? (
                <Table
                  columns={[
                    {
                      title: t('config.historyName'),
                      dataIndex: 'name',
                      key: 'name',
                      render: (name: string, record: any) => (
                        <Space>
                          <Text strong={record.is_active === 1}>{name}</Text>
                          {record.is_active === 1 && (
                            <Tag color="green">{t('config.activeConfig')}</Tag>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: t('config.historyDescription'),
                      dataIndex: 'description',
                      key: 'description',
                      render: (desc: string | null) => desc || <Text type="secondary">-</Text>,
                    },
                    {
                      title: t('config.historyCreatedAt'),
                      dataIndex: 'created_at',
                      key: 'created_at',
                      render: (date: string) => new Date(date).toLocaleString(),
                    },
                    {
                      title: t('config.historyUpdatedAt'),
                      dataIndex: 'updated_at',
                      key: 'updated_at',
                      render: (date: string) => new Date(date).toLocaleString(),
                    },
                    {
                      title: t('common.actions'),
                      key: 'action',
                      width: 200,
                      render: (_: any, record: any) => (
                        <Space>
                          <Button
                            type="link"
                            icon={<PlayCircleOutlined />}
                            onClick={async () => {
                              try {
                                await api.applyConfigHistory(record.id);
                                message.success(t('config.configApplied'));
                                queryClient.invalidateQueries({ queryKey: ['config'] });
                                refetchHistory();
                                // Reload config data
                                setTimeout(() => {
                                  window.location.reload();
                                }, 1000);
                              } catch (error: any) {
                                message.error(t('config.configApplyFailed'));
                              }
                            }}
                            size="small"
                          >
                            {t('config.apply')}
                          </Button>
                          <Popconfirm
                            title={t('config.deleteHistoryConfirm')}
                            onConfirm={async () => {
                              try {
                                await api.deleteConfigHistory(record.id);
                                message.success(t('config.historyDeleted'));
                                refetchHistory();
                              } catch (error: any) {
                                message.error(t('config.historyDeleteFailed'));
                              }
                            }}
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
                  ]}
                  dataSource={configHistoryData.data.data}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: t('config.historyEmpty') }}
                />
              ) : (
                <Alert
                  message={t('config.historyEmpty')}
                  description={t('config.historyEmptyDesc')}
                  type="info"
                  showIcon
                />
              )}
            </Card>
          </Tabs.TabPane>

          {/* 下载目标 */}
          <Tabs.TabPane tab={t('config.tabTargets')} key="targets">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Alert
                message={t('config.targetsTitle')}
                description={t('config.targetsDescription')}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Card
                title={t('config.targetsList')}
                extra={
                  <Space>
                    <Button icon={<ThunderboltOutlined />} onClick={handleAddTarget}>
                      {t('config.addTarget')}
                    </Button>
                  </Space>
                }
              >
                <Table
                  columns={targetColumns}
                  dataSource={targets}
                  rowKey={(_, index) => String(index)}
                  pagination={false}
                  locale={{ emptyText: t('config.targetsEmpty') }}
                />
              </Card>
            </Space>
          </Tabs.TabPane>
        </Tabs>
      </Form>

      {/* 下载目标编辑模态框 */}
      <Modal
        title={
          <Space>
            {editingTarget ? t('config.editTarget') : t('config.addTarget')}
            {!editingTarget && (
              <Tooltip title={t('config.templateTooltip')}>
                <QuestionCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            )}
          </Space>
        }
        open={targetModalVisible}
        onOk={handleSaveTarget}
        onCancel={() => {
          setTargetModalVisible(false);
          setTargetStep(0);
          targetForm.resetFields();
        }}
        width={800}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Steps current={targetStep} style={{ marginBottom: 24 }}>
          <Step title={t('config.stepSelectTemplate')} description={t('config.stepSelectTemplateDesc')} />
          <Step title={t('config.stepConfigure')} description={t('config.stepConfigureDesc')} />
        </Steps>

        {targetStep === 0 && !editingTarget && (
          <div>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              {t('config.templateSelectDescription')}
            </Paragraph>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {Object.entries(configTemplates).map(([key, template]) => (
                <Card
                  key={key}
                  hoverable
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleApplyTemplate(template)}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <Title level={5} style={{ margin: 0 }}>
                        {template.name}
                      </Title>
                      <Text type="secondary">{template.description}</Text>
                    </div>
                    <Button type="primary" icon={<ThunderboltOutlined />}>
                      {t('config.useTemplate')}
                    </Button>
                  </Space>
                </Card>
              ))}
              <Button
                block
                type="dashed"
                onClick={() => setTargetStep(1)}
                style={{ marginTop: 8 }}
              >
                {t('config.skipTemplate')}
              </Button>
            </Space>
          </div>
        )}

        {targetStep === 1 && (
          <Form form={targetForm} layout="vertical">
            <Collapse defaultActiveKey={['basic']} ghost>
              <Panel header={t('config.targetBasicSettings')} key="basic">
                <Form.Item
                  label={
                    <Space>
                      {t('config.targetType')}
                      <Tooltip title={t('config.targetTypeTooltip')}>
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="type"
                  rules={[{ required: true, message: t('config.targetTypeRequired') }]}
                >
                  <Select>
                    <Option value="illustration">{t('config.typeIllustration')}</Option>
                    <Option value="novel">{t('config.typeNovel')}</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      {t('config.targetMode')}
                      <Tooltip title={t('config.targetModeTooltip')}>
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="mode"
                  initialValue="search"
                >
                  <Select>
                    <Option value="search">{t('config.modeSearch')}</Option>
                    <Option value="ranking">{t('config.modeRanking')}</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      {t('config.targetLimit')}
                      <Tooltip title={t('config.targetLimitTooltip')}>
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="limit"
                  rules={[{ type: 'number', min: 1, max: 1000, message: t('config.targetLimitRange') }]}
                >
                  <InputNumber min={1} max={1000} style={{ width: '100%' }} placeholder={t('config.targetLimitPlaceholder')} />
                </Form.Item>
              </Panel>

              <Panel header={t('config.targetModeSettings')} key="mode">
                <Form.Item
                  noStyle
                  shouldUpdate={(prevValues, currentValues) => prevValues.mode !== currentValues.mode}
                >
                  {({ getFieldValue }) => {
                    const mode = getFieldValue('mode') || 'search';
                    if (mode === 'search') {
                      return (
                        <>
                          <Form.Item
                            label={
                              <Space>
                                {t('config.targetTag')}
                                <Tooltip title={t('config.targetTagTooltip')}>
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="tag"
                            rules={[
                              {
                                validator: (_, value) => {
                                  if (!value || value.trim() === '') {
                                    return Promise.reject(new Error(t('config.targetTagRequired')));
                                  }
                                  return Promise.resolve();
                                },
                              },
                            ]}
                          >
                            <Input placeholder={t('config.targetTagPlaceholder')} />
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                {t('config.searchTarget')}
                                <Tooltip title={t('config.searchTargetTooltip')}>
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="searchTarget"
                            initialValue="partial_match_for_tags"
                          >
                            <Select>
                              <Option value="partial_match_for_tags">{t('config.searchTargetPartial')} ({t('common.recommended')})</Option>
                              <Option value="exact_match_for_tags">{t('config.searchTargetExact')}</Option>
                              <Option value="title_and_caption">{t('config.searchTargetTitle')}</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                {t('config.sort')}
                                <Tooltip title={t('config.sortTooltip')}>
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="sort"
                            initialValue="date_desc"
                          >
                            <Select>
                              <Option value="date_desc">{t('config.sortDateDesc')}</Option>
                              <Option value="date_asc">{t('config.sortDateAsc')}</Option>
                              <Option value="popular_desc">{t('config.sortPopularDesc')}</Option>
                            </Select>
                          </Form.Item>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <Form.Item
                            label={
                              <Space>
                                {t('config.rankingMode')}
                                <Tooltip title={t('config.rankingModeTooltip')}>
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="rankingMode"
                            initialValue="day"
                          >
                            <Select>
                              <Option value="day">{t('config.rankingDay')}</Option>
                              <Option value="week">{t('config.rankingWeek')}</Option>
                              <Option value="month">{t('config.rankingMonth')}</Option>
                              <Option value="day_male">{t('config.rankingDayMale')}</Option>
                              <Option value="day_female">{t('config.rankingDayFemale')}</Option>
                              <Option value="day_ai">{t('config.rankingDayAI')}</Option>
                              <Option value="week_original">{t('config.rankingWeekOriginal')}</Option>
                              <Option value="week_rookie">{t('config.rankingWeekRookie')}</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                {t('config.rankingDate')}
                                <Tooltip title={t('config.rankingDateTooltip')}>
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="rankingDate"
                          >
                            <Input placeholder={t('config.rankingDatePlaceholder')} />
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                {t('config.filterTag')}
                                <Tooltip title={t('config.filterTagTooltip')}>
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="filterTag"
                          >
                            <Input placeholder={t('config.filterTagPlaceholder')} />
                          </Form.Item>
                        </>
                      );
                    }
                  }}
                </Form.Item>
              </Panel>

              <Panel header={t('config.targetAdvancedFilters')} key="advanced">
                <Form.Item
                  label={
                    <Space>
                      {t('config.minBookmarks')}
                      <Tooltip title={t('config.minBookmarksTooltip')}>
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="minBookmarks"
                >
                  <InputNumber min={0} style={{ width: '100%' }} placeholder={t('config.minBookmarksPlaceholder')} />
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      {t('config.startDate')}
                      <Tooltip title={t('config.startDateTooltip')}>
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="startDate"
                >
                  <Input placeholder={t('config.startDatePlaceholder')} />
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      {t('config.endDate')}
                      <Tooltip title={t('config.endDateTooltip')}>
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="endDate"
                >
                  <Input placeholder={t('config.endDatePlaceholder')} />
                </Form.Item>
              </Panel>
            </Collapse>
          </Form>
        )}
      </Modal>

      {/* 配置预览模态框 */}
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
        <pre style={{ maxHeight: '60vh', overflow: 'auto', background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
          {getConfigPreview()}
        </pre>
      </Modal>
    </div>
  );
}
