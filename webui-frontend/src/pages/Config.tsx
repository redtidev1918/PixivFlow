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
} from '@ant-design/icons';
import { api } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
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

// 配置模板
const configTemplates = {
  tagSearch: {
    name: '标签搜索',
    description: '按标签搜索并下载插画',
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
    name: '排行榜下载',
    description: '下载排行榜作品',
    config: {
      type: 'illustration',
      mode: 'ranking',
      rankingMode: 'day',
      limit: 30,
    },
  },
  multiTag: {
    name: '多标签搜索',
    description: '同时包含多个标签的作品',
    config: {
      type: 'illustration',
      mode: 'search',
      tag: '',
      limit: 30,
      searchTarget: 'partial_match_for_tags',
    },
  },
  highQuality: {
    name: '高质量筛选',
    description: '按收藏数筛选高质量作品',
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
    name: '小说下载',
    description: '下载小说作品',
    config: {
      type: 'novel',
      mode: 'search',
      tag: '',
      limit: 10,
    },
  },
};

export default function Config() {
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

  useEffect(() => {
    if (configData?.data) {
      // Remove _meta from form data
      const { _meta, ...configWithoutMeta } = configData.data;
      form.setFieldsValue(configWithoutMeta);
    }
  }, [configData, form]);

  const updateConfigMutation = useMutation({
    mutationFn: (values: any) => api.updateConfig(values),
    onSuccess: () => {
      message.success('配置保存成功');
      queryClient.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || '保存配置失败';
      const details = error.response?.data?.details;
      if (details && Array.isArray(details)) {
        message.error(`${errorMsg}: ${details.join(', ')}`);
      } else {
        message.error(errorMsg);
      }
    },
  });

  const validateConfigMutation = useMutation({
    mutationFn: (values: any) => api.validateConfig(values),
    onSuccess: (data) => {
      if (data.data.valid) {
        message.success('配置验证通过');
      } else {
        message.error(`配置验证失败: ${data.data.errors?.join(', ')}`);
      }
    },
  });

  const handleSave = () => {
    form.validateFields().then((values) => {
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

  const handleDeleteTarget = (index: number) => {
    const targets = form.getFieldValue('targets') || [];
    targets.splice(index, 1);
    form.setFieldsValue({ targets });
    message.success('下载目标已删除');
  };

  const handleSaveTarget = () => {
    targetForm.validateFields().then((values) => {
      const targets = form.getFieldValue('targets') || [];
      if (editingTarget && typeof editingTarget._index === 'number') {
        targets[editingTarget._index] = values;
      } else {
        targets.push(values);
      }
      form.setFieldsValue({ targets });
      setTargetModalVisible(false);
      setTargetStep(0);
      targetForm.resetFields();
      message.success('下载目标已保存');
    });
  };

  const handleApplyTemplate = (template: typeof configTemplates[keyof typeof configTemplates]) => {
    targetForm.setFieldsValue(template.config);
    setTargetStep(1);
    message.success(`已应用模板：${template.name}`);
  };

  const handleExportConfig = () => {
    // Export the actual server config, not form values (which may be unsaved)
    if (!configData?.data) {
      message.warning('配置数据未加载，请稍后再试');
      return;
    }
    
    // Remove _meta from exported config
    const { _meta, ...configToExport } = configData.data;
    const jsonStr = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('配置已导出');
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
              if (!validationResult.data.valid) {
                message.error(`配置验证失败: ${validationResult.data.errors?.join(', ')}`);
                return;
              }
            } catch (error) {
              // If validation fails, still allow import but warn user
              console.warn('Config validation error:', error);
            }
            
            // Set form values
            form.setFieldsValue(configToImport);
            
            // Auto-save after import
            try {
              await updateConfigMutation.mutateAsync(configToImport);
              message.success('配置已导入并保存');
            } catch (error: any) {
              message.warning('配置已导入到表单，但保存失败。请检查配置后手动保存。');
            }
          } catch (error) {
            message.error('配置文件格式错误，请确保是有效的 JSON 文件');
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
    message.success('配置已复制到剪贴板');
  };

  const getConfigPreview = () => {
    return JSON.stringify(form.getFieldsValue(), null, 2);
  };

  const targets = form.getFieldValue('targets') || [];

  const targetColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'illustration' ? 'blue' : 'green'}>
          {type === 'illustration' ? '插画' : '小说'}
        </Tag>
      ),
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode: string) => {
        if (!mode) return '-';
        return <Tag color={mode === 'ranking' ? 'purple' : 'cyan'}>{mode === 'ranking' ? '排行榜' : '搜索'}</Tag>;
      },
    },
    {
      title: '标签/配置',
      key: 'config',
      render: (_: any, record: TargetConfig) => {
        if (record.mode === 'ranking') {
          const rankingLabels: Record<string, string> = {
            day: '日榜',
            week: '周榜',
            month: '月榜',
            day_male: '男性日榜',
            day_female: '女性日榜',
            day_ai: 'AI日榜',
            week_original: '原创周榜',
            week_rookie: '新人周榜',
          };
          return (
            <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
              <Text strong>{rankingLabels[record.rankingMode || 'day'] || record.rankingMode}</Text>
              {record.filterTag && <Text type="secondary">筛选: {record.filterTag}</Text>}
              {record.rankingDate && <Text type="secondary">日期: {record.rankingDate}</Text>}
            </Space>
          );
        }
        if (record.seriesId) {
          return <Text>系列 ID: {record.seriesId}</Text>;
        }
        if (record.novelId) {
          return <Text>小说 ID: {record.novelId}</Text>;
        }
        return (
          <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
            <Text strong>{record.tag || '-'}</Text>
            {record.searchTarget && (
              <Text type="secondary">
                {record.searchTarget === 'partial_match_for_tags'
                  ? '部分匹配'
                  : record.searchTarget === 'exact_match_for_tags'
                  ? '精确匹配'
                  : '标题和说明'}
              </Text>
            )}
            {record.sort && (
              <Text type="secondary">
                {record.sort === 'date_desc'
                  ? '按日期降序'
                  : record.sort === 'date_asc'
                  ? '按日期升序'
                  : '按人气降序'}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '限制/筛选',
      key: 'filters',
      width: 150,
      render: (_: any, record: TargetConfig) => (
        <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
          {record.limit && <Text>数量: {record.limit}</Text>}
          {record.minBookmarks && <Text type="secondary">收藏数 ≥ {record.minBookmarks}</Text>}
          {(record.startDate || record.endDate) && (
            <Text type="secondary">
              {record.startDate && `从 ${record.startDate}`}
              {record.endDate && ` 至 ${record.endDate}`}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
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
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个下载目标吗？"
            onConfirm={() => handleDeleteTarget(index)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return <div>加载中...</div>;
  }

  const currentConfigPath = configData?.data?._meta?.configPathRelative || configData?.data?._meta?.configPath || '未知';

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            配置管理
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前配置文件: {currentConfigPath}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['config'] })}>
            刷新
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => setPreviewVisible(true)}>
            预览配置
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportConfig}>
            导出配置
          </Button>
          <Button icon={<UploadOutlined />} onClick={handleImportConfig}>
            导入配置
          </Button>
          <Button icon={<CopyOutlined />} onClick={handleCopyConfig}>
            复制配置
          </Button>
          <Button icon={<CheckCircleOutlined />} onClick={handleValidate} loading={validateConfigMutation.isPending}>
            验证配置
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={updateConfigMutation.isPending}
          >
            保存配置
          </Button>
        </Space>
      </Space>

      <Form form={form} layout="vertical">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          {/* 基础配置 */}
          <Tabs.TabPane tab="基础配置" key="basic">
            <Card>
              <Form.Item
                label={
                  <Space>
                    日志级别
                    <Tooltip title="控制日志输出的详细程度，debug 最详细，error 只显示错误">
                      <QuestionCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                  </Space>
                }
                name="logLevel"
              >
                <Select>
                  <Option value="debug">Debug - 调试信息（最详细）</Option>
                  <Option value="info">Info - 一般信息</Option>
                  <Option value="warn">Warn - 警告信息</Option>
                  <Option value="error">Error - 错误信息（最简洁）</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label={
                  <Space>
                    初始延迟 (毫秒)
                    <Tooltip title="下载开始前的延迟时间，用于避免请求过快">
                      <QuestionCircleOutlined style={{ color: '#999' }} />
                    </Tooltip>
                  </Space>
                }
                name="initialDelay"
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="建议值：1000-3000" />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* Pixiv 凭证 */}
          <Tabs.TabPane tab="Pixiv 凭证" key="pixiv">
            <Card>
              <Text type="secondary">
                敏感信息已隐藏。如需修改，请使用命令行工具或直接编辑配置文件。
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
          <Tabs.TabPane tab="网络配置" key="network">
            <Card>
              <Form.Item label="请求超时 (毫秒)" name={['network', 'timeoutMs']}>
                <InputNumber min={1000} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="重试次数" name={['network', 'retries']}>
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="重试延迟 (毫秒)" name={['network', 'retryDelay']}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Divider>代理设置</Divider>

              <Form.Item label="启用代理" name={['network', 'proxy', 'enabled']} valuePropName="checked">
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
                      <Form.Item label="代理主机" name={['network', 'proxy', 'host']}>
                        <Input />
                      </Form.Item>
                      <Form.Item label="代理端口" name={['network', 'proxy', 'port']}>
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item label="代理协议" name={['network', 'proxy', 'protocol']}>
                        <Select>
                          <Option value="http">HTTP</Option>
                          <Option value="https">HTTPS</Option>
                          <Option value="socks4">SOCKS4</Option>
                          <Option value="socks5">SOCKS5</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item label="用户名" name={['network', 'proxy', 'username']}>
                        <Input />
                      </Form.Item>
                      <Form.Item label="密码" name={['network', 'proxy', 'password']}>
                        <Input.Password />
                      </Form.Item>
                    </>
                  ) : null
                }
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 存储配置 */}
          <Tabs.TabPane tab="存储配置" key="storage">
            <Card>
              <Form.Item label="数据库路径" name={['storage', 'databasePath']}>
                <Input />
              </Form.Item>

              <Form.Item label="下载目录" name={['storage', 'downloadDirectory']}>
                <Input />
              </Form.Item>

              <Form.Item label="插画目录" name={['storage', 'illustrationDirectory']}>
                <Input />
              </Form.Item>

              <Form.Item label="小说目录" name={['storage', 'novelDirectory']}>
                <Input />
              </Form.Item>

              <Form.Item label="插画组织方式" name={['storage', 'illustrationOrganization']}>
                <Select>
                  <Option value="flat">扁平结构</Option>
                  <Option value="byAuthor">按作者</Option>
                  <Option value="byTag">按标签</Option>
                  <Option value="byDate">按日期</Option>
                  <Option value="byAuthorAndTag">按作者和标签</Option>
                  <Option value="byDateAndAuthor">按日期和作者</Option>
                </Select>
              </Form.Item>

              <Form.Item label="小说组织方式" name={['storage', 'novelOrganization']}>
                <Select>
                  <Option value="flat">扁平结构</Option>
                  <Option value="byAuthor">按作者</Option>
                  <Option value="byTag">按标签</Option>
                  <Option value="byDate">按日期</Option>
                  <Option value="byAuthorAndTag">按作者和标签</Option>
                  <Option value="byDateAndAuthor">按日期和作者</Option>
                </Select>
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 调度器配置 */}
          <Tabs.TabPane tab="调度器配置" key="scheduler">
            <Card>
              <Form.Item label="启用调度器" name={['scheduler', 'enabled']} valuePropName="checked">
                <Switch />
              </Form.Item>

              <Form.Item label="Cron 表达式" name={['scheduler', 'cron']}>
                <Input placeholder="例如: 0 3 * * * (每天凌晨3点)" />
              </Form.Item>

              <Form.Item label="时区" name={['scheduler', 'timezone']}>
                <Input placeholder="例如: Asia/Shanghai" />
              </Form.Item>

              <Form.Item label="最大执行次数" name={['scheduler', 'maxExecutions']}>
                <InputNumber min={1} style={{ width: '100%' }} placeholder="留空表示无限制" />
              </Form.Item>

              <Form.Item label="最小执行间隔 (毫秒)" name={['scheduler', 'minInterval']}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="超时时间 (毫秒)" name={['scheduler', 'timeout']}>
                <InputNumber min={1000} style={{ width: '100%' }} placeholder="留空表示无超时" />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 下载配置 */}
          <Tabs.TabPane tab="下载配置" key="download">
            <Card>
              <Form.Item label="并发数" name={['download', 'concurrency']}>
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="最大重试次数" name={['download', 'maxRetries']}>
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="重试延迟 (毫秒)" name={['download', 'retryDelay']}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="超时时间 (毫秒)" name={['download', 'timeout']}>
                <InputNumber min={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Card>
          </Tabs.TabPane>

          {/* 下载目标 */}
          <Tabs.TabPane tab="下载目标" key="targets">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Alert
                message="下载目标配置"
                description="配置要下载的内容。支持标签搜索、排行榜、系列下载等多种模式。可以添加多个目标，它们会按顺序执行。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Card
                title="下载目标列表"
                extra={
                  <Space>
                    <Button icon={<ThunderboltOutlined />} onClick={handleAddTarget}>
                      添加目标
                    </Button>
                  </Space>
                }
              >
                <Table
                  columns={targetColumns}
                  dataSource={targets}
                  rowKey={(_, index) => String(index)}
                  pagination={false}
                  locale={{ emptyText: '暂无下载目标，请点击"添加目标"按钮添加' }}
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
            {editingTarget ? '编辑下载目标' : '添加下载目标'}
            {!editingTarget && (
              <Tooltip title="使用模板可以快速创建常用配置">
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
        okText="保存"
        cancelText="取消"
      >
        <Steps current={targetStep} style={{ marginBottom: 24 }}>
          <Step title="选择模板" description="快速开始" />
          <Step title="配置参数" description="详细设置" />
        </Steps>

        {targetStep === 0 && !editingTarget && (
          <div>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              选择一个配置模板快速开始，或直接进入下一步手动配置
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
                      使用模板
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
                跳过模板，手动配置
              </Button>
            </Space>
          </div>
        )}

        {targetStep === 1 && (
          <Form form={targetForm} layout="vertical">
            <Collapse defaultActiveKey={['basic']} ghost>
              <Panel header="基础设置" key="basic">
                <Form.Item
                  label={
                    <Space>
                      类型
                      <Tooltip title="选择要下载的内容类型">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="type"
                  rules={[{ required: true, message: '请选择类型' }]}
                >
                  <Select>
                    <Option value="illustration">插画（图片）</Option>
                    <Option value="novel">小说</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      模式
                      <Tooltip title="搜索模式：按标签搜索作品；排行榜模式：下载排行榜作品">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="mode"
                  initialValue="search"
                >
                  <Select>
                    <Option value="search">搜索模式</Option>
                    <Option value="ranking">排行榜模式</Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      下载数量限制
                      <Tooltip title="每次运行最多下载的作品数量，建议值：10-50">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="limit"
                  rules={[{ type: 'number', min: 1, max: 1000, message: '限制数量应在 1-1000 之间' }]}
                >
                  <InputNumber min={1} max={1000} style={{ width: '100%' }} placeholder="例如：20" />
                </Form.Item>
              </Panel>

              <Panel header="搜索/排行榜设置" key="mode">
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
                                标签
                                <Tooltip title="搜索标签，支持多个标签用空格分隔（AND关系）。例如：'原神' 或 '明日方舟 アークナイツ'">
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="tag"
                            rules={[
                              {
                                validator: (_, value) => {
                                  if (!value || value.trim() === '') {
                                    return Promise.reject(new Error('搜索模式下标签不能为空'));
                                  }
                                  return Promise.resolve();
                                },
                              },
                            ]}
                          >
                            <Input placeholder="例如：原神 或 明日方舟 アークナイツ（多标签用空格分隔）" />
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                搜索目标
                                <Tooltip title="部分匹配：标签部分匹配即可；精确匹配：标签必须完全匹配；标题和说明：在标题和说明中搜索">
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="searchTarget"
                            initialValue="partial_match_for_tags"
                          >
                            <Select>
                              <Option value="partial_match_for_tags">部分匹配标签（推荐）</Option>
                              <Option value="exact_match_for_tags">精确匹配标签</Option>
                              <Option value="title_and_caption">标题和说明</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                排序方式
                                <Tooltip title="日期降序：最新作品优先；日期升序：最旧作品优先；人气降序：收藏数最多优先">
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="sort"
                            initialValue="date_desc"
                          >
                            <Select>
                              <Option value="date_desc">日期降序（最新优先）</Option>
                              <Option value="date_asc">日期升序（最旧优先）</Option>
                              <Option value="popular_desc">人气降序（收藏最多优先）</Option>
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
                                排行榜模式
                                <Tooltip title="选择要下载的排行榜类型">
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="rankingMode"
                            initialValue="day"
                          >
                            <Select>
                              <Option value="day">日榜</Option>
                              <Option value="week">周榜</Option>
                              <Option value="month">月榜</Option>
                              <Option value="day_male">男性向日榜</Option>
                              <Option value="day_female">女性向日榜</Option>
                              <Option value="day_ai">AI作品日榜</Option>
                              <Option value="week_original">原创周榜</Option>
                              <Option value="week_rookie">新人周榜</Option>
                            </Select>
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                排行榜日期
                                <Tooltip title="指定排行榜日期，格式：YYYY-MM-DD 或使用 YESTERDAY 表示昨天">
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="rankingDate"
                          >
                            <Input placeholder="例如：2024-01-15 或 YESTERDAY（留空表示今天）" />
                          </Form.Item>
                          <Form.Item
                            label={
                              <Space>
                                筛选标签
                                <Tooltip title="可选：从排行榜结果中筛选包含此标签的作品">
                                  <QuestionCircleOutlined style={{ color: '#999' }} />
                                </Tooltip>
                              </Space>
                            }
                            name="filterTag"
                          >
                            <Input placeholder="可选：例如 原神（留空表示不过滤）" />
                          </Form.Item>
                        </>
                      );
                    }
                  }}
                </Form.Item>
              </Panel>

              <Panel header="高级筛选（可选）" key="advanced">
                <Form.Item
                  label={
                    <Space>
                      最小收藏数
                      <Tooltip title="只下载收藏数大于等于此值的作品，用于筛选高质量作品">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="minBookmarks"
                >
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="例如：1000（留空表示不限制）" />
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      开始日期
                      <Tooltip title="只下载此日期之后发布的作品，格式：YYYY-MM-DD">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="startDate"
                >
                  <Input placeholder="例如：2024-01-01（留空表示不限制）" />
                </Form.Item>

                <Form.Item
                  label={
                    <Space>
                      结束日期
                      <Tooltip title="只下载此日期之前发布的作品，格式：YYYY-MM-DD">
                        <QuestionCircleOutlined style={{ color: '#999' }} />
                      </Tooltip>
                    </Space>
                  }
                  name="endDate"
                >
                  <Input placeholder="例如：2024-12-31（留空表示不限制）" />
                </Form.Item>
              </Panel>
            </Collapse>
          </Form>
        )}
      </Modal>

      {/* 配置预览模态框 */}
      <Modal
        title="配置预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => {
            navigator.clipboard.writeText(getConfigPreview());
            message.success('配置已复制到剪贴板');
          }}>
            复制
          </Button>,
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
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
