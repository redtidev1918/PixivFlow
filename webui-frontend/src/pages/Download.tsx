import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Button,
  Table,
  Tag,
  Space,
  message,
  Modal,
  Select,
  Form,
  Spin,
  Typography,
  Descriptions,
  Progress,
  Alert,
  Statistic,
  Row,
  Col,
  Collapse,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  RedoOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';

const { Title, Text, Paragraph } = Typography;

export default function Download() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [showStartModal, setShowStartModal] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Poll download status every 2 seconds
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['download', 'status'],
    queryFn: () => api.getDownloadStatus(),
    refetchInterval: 2000,
  });

  // Get task logs for active task
  const activeTaskId = statusData?.data?.activeTask?.taskId;
  const { data: taskLogsData } = useQuery({
    queryKey: ['download', 'logs', activeTaskId],
    queryFn: () => api.getTaskLogs(activeTaskId!),
    enabled: !!activeTaskId,
    refetchInterval: activeTaskId ? 2000 : false,
  });

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current && taskLogsData?.data?.logs) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [taskLogsData?.data?.logs]);

  // Get config to show available targets and paths
  // Add refetchInterval to auto-refresh config (e.g., when paths are updated)
  const { data: configData, refetch: refetchConfig } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    refetchInterval: 5000, // Refresh every 5 seconds to catch config changes
  });

  // Get incomplete tasks
  const { data: incompleteTasksData, refetch: refetchIncompleteTasks } = useQuery({
    queryKey: ['download', 'incomplete'],
    queryFn: () => api.getIncompleteTasks(),
  });

  const startDownloadMutation = useMutation({
    mutationFn: (values: { targetId?: string; config?: any }) =>
      api.startDownload(values.targetId, values.config),
    onSuccess: () => {
      message.success(t('download.taskStarted'));
      setShowStartModal(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['download', 'status'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || t('download.startFailed'));
    },
  });

  const stopDownloadMutation = useMutation({
    mutationFn: (taskId: string) => api.stopDownload(taskId),
    onSuccess: () => {
      message.success(t('download.taskStopped'));
      queryClient.invalidateQueries({ queryKey: ['download', 'status'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || t('download.stopFailed'));
    },
  });

  const runAllMutation = useMutation({
    mutationFn: () => api.runAllDownloads(),
    onSuccess: () => {
      message.success(t('download.allTargetsStarted'));
      queryClient.invalidateQueries({ queryKey: ['download', 'status'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || t('download.startFailed'));
    },
  });

  const resumeDownloadMutation = useMutation({
    mutationFn: ({ tag, type }: { tag: string; type: 'illustration' | 'novel' }) =>
      api.resumeDownload(tag, type),
    onSuccess: (_, variables) => {
      message.success(t('download.taskResumedWithTag', { tag: variables.tag, type: variables.type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel') }));
      queryClient.invalidateQueries({ queryKey: ['download', 'status'] });
      refetchIncompleteTasks();
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || t('download.resumeFailed'));
    },
  });

  const deleteIncompleteTaskMutation = useMutation({
    mutationFn: (id: number) => api.deleteIncompleteTask(id),
    onSuccess: () => {
      message.success(t('download.incompleteTaskDeleted'));
      refetchIncompleteTasks();
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || t('download.deleteFailed'));
    },
  });

  const deleteAllIncompleteTasksMutation = useMutation({
    mutationFn: () => api.deleteAllIncompleteTasks(),
    onSuccess: (response) => {
      const deletedCount = response.data?.deletedCount || 0;
      if (deletedCount === 0) {
        message.info(t('download.noIncompleteTasks'));
      } else {
        message.success(t('download.allIncompleteTasksDeleted', { count: deletedCount }));
      }
      refetchIncompleteTasks();
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t('download.deleteAllFailed');
      message.error(errorMessage);
      console.error('Delete all incomplete tasks error:', error);
    },
  });

  const handleStart = (values: any) => {
    startDownloadMutation.mutate(values);
  };

  const handleStop = () => {
    if (statusData?.data?.activeTask?.taskId) {
      stopDownloadMutation.mutate(statusData.data.activeTask.taskId);
    }
  };

  const handleRunAll = () => {
    runAllMutation.mutate();
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; icon: any; text: string }> = {
      running: { color: 'processing', icon: <ClockCircleOutlined />, text: t('download.statusRunning') },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: t('download.statusCompleted') },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: t('download.statusFailed') },
      stopped: { color: 'default', icon: <StopOutlined />, text: t('download.statusStopped') },
    };
    const statusInfo = statusMap[status] || statusMap.running;
    return (
      <Tag color={statusInfo.color} icon={statusInfo.icon}>
        {statusInfo.text}
      </Tag>
    );
  };

  // Calculate task duration
  const calculateDuration = (startTime: Date, endTime?: Date) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000); // seconds
    
    if (duration < 60) {
      return `${duration} ${t('download.seconds')}`;
    } else if (duration < 3600) {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return `${minutes} ${t('download.minutes')} ${seconds} ${t('download.seconds')}`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours} ${t('download.hours')} ${minutes} ${t('download.minutes')}`;
    }
  };

  // Task statistics
  const taskStats = useMemo(() => {
    const allTasks = statusData?.data?.allTasks || [];
    const completed = allTasks.filter((t: any) => t.status === 'completed').length;
    const failed = allTasks.filter((t: any) => t.status === 'failed').length;
    const stopped = allTasks.filter((t: any) => t.status === 'stopped').length;
    return { total: allTasks.length, completed, failed, stopped };
  }, [statusData]);

  const taskColumns = [
    {
      title: t('download.taskId'),
      dataIndex: 'taskId',
      key: 'taskId',
      width: 120,
      render: (taskId: string) => <Text code>{taskId.slice(0, 8)}...</Text>,
    },
    {
      title: t('download.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: t('download.duration'),
      key: 'duration',
      width: 120,
      render: (_: any, record: any) => {
        return calculateDuration(record.startTime, record.endTime);
      },
    },
    {
      title: t('download.startTime'),
      dataIndex: 'startTime',
      key: 'startTime',
      width: 180,
      render: (time: string) => {
        const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
        return new Date(time).toLocaleString(locale);
      },
    },
    {
      title: t('download.endTime'),
      dataIndex: 'endTime',
      key: 'endTime',
      width: 180,
      render: (time: string | undefined) => {
        if (!time) return '-';
        const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
        return new Date(time).toLocaleString(locale);
      },
    },
    {
      title: t('download.errorInfo'),
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: (error: string | undefined) => 
        error ? (
          <Text type="danger" ellipsis={{ tooltip: error }}>
            {error}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
  ];

  return (
    <div>
      <Title level={2}>{t('download.title')}</Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {t('download.description')}
      </Paragraph>

      {/* Task Statistics */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title={t('download.totalTasks')}
              value={taskStats.total}
              prefix={<DownloadOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('download.completed')}
              value={taskStats.completed}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('download.failed')}
              value={taskStats.failed}
              valueStyle={{ color: '#cf1322' }}
              prefix={<CloseCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('download.stopped')}
              value={taskStats.stopped}
              valueStyle={{ color: '#8c8c8c' }}
              prefix={<StopOutlined />}
            />
          </Col>
        </Row>
      </Card>

      {/* Action Buttons */}
      <Card 
        title={
          <Space>
            <InfoCircleOutlined />
            <span>{t('download.taskOperations')}</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Space wrap>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            onClick={() => setShowStartModal(true)}
            disabled={statusData?.data?.hasActiveTask}
            loading={startDownloadMutation.isPending}
          >
            {t('download.startDownload')}
          </Button>
          <Button
            size="large"
            icon={<ReloadOutlined />}
            onClick={handleRunAll}
            disabled={statusData?.data?.hasActiveTask}
            loading={runAllMutation.isPending}
          >
            {t('download.downloadAll')}
          </Button>
          <Button
            danger
            size="large"
            icon={<StopOutlined />}
            onClick={handleStop}
            disabled={!statusData?.data?.hasActiveTask}
            loading={stopDownloadMutation.isPending}
          >
            {t('download.stopCurrent')}
          </Button>
        </Space>
        {statusData?.data?.hasActiveTask && (
          <Alert
            message={t('download.hasActiveTask')}
            description={t('download.hasActiveTaskDesc')}
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
        {configData?.data?.storage && (
          <Alert
            message={
              <Space>
                <span>{t('download.fileSavePath')}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => refetchConfig()}
                  title={t('download.refreshPath')}
                />
              </Space>
            }
            description={
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Text>
                  <Text strong>{t('download.illustrationPath')}</Text>
                  {configData.data.storage.illustrationDirectory || 
                   (configData.data.storage.downloadDirectory 
                     ? `${configData.data.storage.downloadDirectory}/illustrations` 
                     : './downloads/illustrations')}
                </Text>
                <Text>
                  <Text strong>{t('download.novelPath')}</Text>
                  {configData.data.storage.novelDirectory || 
                   (configData.data.storage.downloadDirectory 
                     ? `${configData.data.storage.downloadDirectory}/novels` 
                     : './downloads/novels')}
                </Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {t('download.pathTip')}
                </Text>
              </Space>
            }
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* Current Active Task */}
      {statusData?.data?.activeTask && (
        <Card 
          title={
            <Space>
              <ClockCircleOutlined />
              <span>{t('download.currentTask')}</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
          extra={
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
              loading={stopDownloadMutation.isPending}
            >
              {t('download.stopTask')}
            </Button>
          }
        >
          <Descriptions column={2} bordered>
            <Descriptions.Item label={t('download.taskId')} span={1}>
              <Text code>{statusData.data.activeTask.taskId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('download.status')} span={1}>
              {getStatusTag(statusData.data.activeTask.status)}
            </Descriptions.Item>
            <Descriptions.Item label={t('download.startTime')} span={1}>
              {(() => {
                const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
                return new Date(statusData.data.activeTask.startTime).toLocaleString(locale);
              })()}
            </Descriptions.Item>
            <Descriptions.Item label={t('download.duration')} span={1}>
              <Text strong>{calculateDuration(statusData.data.activeTask.startTime, statusData.data.activeTask.endTime)}</Text>
            </Descriptions.Item>
            {statusData.data.activeTask.progress && (
              <Descriptions.Item label={t('download.progress')} span={2}>
                <Progress
                  percent={Math.round((statusData.data.activeTask.progress.current / statusData.data.activeTask.progress.total) * 100)}
                  status={statusData.data.activeTask.status === 'running' ? 'active' : 'success'}
                  format={() => `${statusData.data.activeTask.progress?.current || 0} / ${statusData.data.activeTask.progress?.total || 0}`}
                />
                {statusData.data.activeTask.progress.message && (
                  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    {statusData.data.activeTask.progress.message}
                  </Text>
                )}
              </Descriptions.Item>
            )}
            {statusData.data.activeTask.endTime && (
              <Descriptions.Item label={t('download.endTime')} span={2}>
                {(() => {
                  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
                  return new Date(statusData.data.activeTask.endTime).toLocaleString(locale);
                })()}
              </Descriptions.Item>
            )}
            {statusData.data.activeTask.error && (
              <Descriptions.Item label={t('download.errorInfo')} span={2}>
                <Alert
                  message={statusData.data.activeTask.error}
                  type="error"
                  showIcon
                />
              </Descriptions.Item>
            )}
          </Descriptions>
          
          {/* Task Logs */}
          {taskLogsData?.data?.logs && taskLogsData.data.logs.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Collapse
                items={[
                  {
                    key: 'logs',
                    label: (
                      <Space>
                        <InfoCircleOutlined />
                        <span>{t('download.realtimeLogs')} ({taskLogsData.data.logs.length} {t('download.entries')})</span>
                      </Space>
                    ),
                    children: (
                      <div
                        style={{
                          maxHeight: '400px',
                          overflowY: 'auto',
                          backgroundColor: '#1f1f1f',
                          padding: '12px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          lineHeight: '1.6',
                        }}
                      >
                        {taskLogsData.data.logs.map((log: any, index: number) => {
                          const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
                          const timestamp = new Date(log.timestamp).toLocaleTimeString(locale);
                          const levelColor: Record<string, string> = {
                            error: '#ff4d4f',
                            warn: '#faad14',
                            info: '#1890ff',
                            debug: '#8c8c8c',
                          };
                          return (
                            <div
                              key={index}
                              style={{
                                marginBottom: '4px',
                                color: levelColor[log.level] || '#ffffff',
                              }}
                            >
                              <span style={{ color: '#8c8c8c', marginRight: '8px' }}>
                                [{timestamp}]
                              </span>
                              <span
                                style={{
                                  color: levelColor[log.level] || '#ffffff',
                                  marginRight: '8px',
                                  fontWeight: 'bold',
                                }}
                              >
                                [{log.level.toUpperCase()}]
                              </span>
                              <span>{log.message}</span>
                            </div>
                          );
                        })}
                        <div ref={logsEndRef} />
                      </div>
                    ),
                  },
                ]}
                defaultActiveKey={statusData.data.activeTask.status === 'running' ? ['logs'] : []}
              />
            </div>
          )}
        </Card>
      )}

      {/* Incomplete Tasks */}
      {incompleteTasksData?.data?.tasks && incompleteTasksData.data.tasks.length > 0 && (
        <Card 
          title={
            <Space>
              <InfoCircleOutlined />
              <span>{t('download.incompleteTasks')}</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => refetchIncompleteTasks()}
              >
                {t('download.refreshList')}
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: t('download.confirmDeleteAll'),
                    content: t('download.confirmDeleteAllDesc', { count: incompleteTasksData.data.tasks.length }),
                    okText: t('common.delete'),
                    okType: 'danger',
                    cancelText: t('common.cancel'),
                    onOk: () => {
                      deleteAllIncompleteTasksMutation.mutate();
                    },
                  });
                }}
                loading={deleteAllIncompleteTasksMutation.isPending}
                disabled={deleteAllIncompleteTasksMutation.isPending}
              >
                {t('download.deleteAll')}
              </Button>
            </Space>
          }
        >
          <Alert
            message={t('download.incompleteTasksFound', { count: incompleteTasksData.data.tasks.length })}
            description={t('download.incompleteTasksDesc')}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Table
            columns={[
              {
                title: t('download.tag'),
                dataIndex: 'tag',
                key: 'tag',
                width: 150,
                render: (tag: string) => <Text strong>{tag}</Text>,
              },
              {
                title: t('download.type'),
                dataIndex: 'type',
                key: 'type',
                width: 100,
                render: (type: string) => (
                  <Tag color={type === 'illustration' ? 'blue' : 'purple'}>
                    {type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel')}
                  </Tag>
                ),
              },
              {
                title: t('download.incompleteStatus'),
                dataIndex: 'status',
                key: 'status',
                width: 120,
                render: (status: string) => {
                  const statusMap: Record<string, { color: string; text: string }> = {
                    failed: { color: 'error', text: t('download.statusFailed') },
                    partial: { color: 'warning', text: t('download.statusPartial') },
                  };
                  const statusInfo = statusMap[status] || { color: 'default', text: status };
                  return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
                },
              },
              {
                title: t('download.errorMessage'),
                dataIndex: 'message',
                key: 'message',
                ellipsis: { showTitle: false },
                width: 300,
                render: (message: string | null) => {
                  if (!message) {
                    return <Text type="secondary">-</Text>;
                  }
                  
                  // Check for common error patterns and provide suggestions
                  const msgLower = message.toLowerCase();
                  let suggestion: string | null = null;
                  
                  if (msgLower.includes('401') || msgLower.includes('unauthorized')) {
                    suggestion = t('download.error401');
                  } else if (msgLower.includes('403') || msgLower.includes('forbidden')) {
                    suggestion = t('download.error403');
                  } else if (msgLower.includes('timeout') || msgLower.includes('timed out')) {
                    suggestion = t('download.errorTimeout');
                  } else if (msgLower.includes('failed after')) {
                    suggestion = t('download.errorRetries');
                  }
                  
                  return (
                    <div>
                      <Text type="danger" ellipsis={{ tooltip: message }}>
                        {message}
                      </Text>
                      {suggestion && (
                        <div style={{ marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            💡 {suggestion}
                          </Text>
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                title: t('download.executedAt'),
                dataIndex: 'executedAt',
                key: 'executedAt',
                width: 180,
                render: (time: string) => {
                  const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US';
                  return new Date(time).toLocaleString(locale);
                },
              },
              {
                title: t('download.actions'),
                key: 'action',
                width: 150,
                fixed: 'right' as const,
                render: (_: any, record: any) => (
                  <Space>
                    <Button
                      type="link"
                      icon={<RedoOutlined />}
                      onClick={() => {
                        resumeDownloadMutation.mutate({
                          tag: record.tag,
                          type: record.type,
                        });
                      }}
                      disabled={statusData?.data?.hasActiveTask || resumeDownloadMutation.isPending}
                      loading={resumeDownloadMutation.isPending}
                    >
                      {t('download.resumeDownload')}
                    </Button>
                    <Button
                      type="link"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        Modal.confirm({
                          title: t('download.confirmDelete'),
                          content: t('download.confirmDeleteDesc', { 
                            tag: record.tag, 
                            type: record.type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel') 
                          }),
                          okText: t('common.delete'),
                          okType: 'danger',
                          cancelText: t('common.cancel'),
                          onOk: () => {
                            deleteIncompleteTaskMutation.mutate(record.id);
                          },
                        });
                      }}
                      disabled={deleteIncompleteTaskMutation.isPending}
                      loading={deleteIncompleteTaskMutation.isPending}
                    >
                      {t('download.deleteTask')}
                    </Button>
                  </Space>
                ),
              },
            ]}
            dataSource={incompleteTasksData.data.tasks}
            rowKey="id"
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('download.totalEntries', { total }) }}
            size="small"
            scroll={{ x: 800 }}
          />
        </Card>
      )}

      {/* Task History */}
      <Card 
        title={
          <Space>
            <InfoCircleOutlined />
            <span>{t('download.taskHistory')}</span>
          </Space>
        }
      >
        {statusLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">{t('download.loadingHistory')}</Text>
            </div>
          </div>
        ) : statusData?.data?.allTasks && statusData.data.allTasks.length > 0 ? (
          <Table
            columns={taskColumns}
            dataSource={statusData.data.allTasks}
            rowKey="taskId"
            pagination={{ 
              pageSize: 10, 
              showSizeChanger: true,
              showTotal: (total) => t('download.taskRecords', { total }),
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            size="middle"
            scroll={{ x: 1000 }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Text type="secondary">{t('download.noHistory')}</Text>
          </div>
        )}
      </Card>

      {/* Start Download Modal */}
      <Modal
        title={
          <Space>
            <PlayCircleOutlined />
            <span>{t('download.startDownloadModal')}</span>
          </Space>
        }
        open={showStartModal}
        onCancel={() => {
          setShowStartModal(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={startDownloadMutation.isPending}
        okText={t('common.start')}
        cancelText={t('common.cancel')}
        width={600}
      >
        <Alert
          message={t('download.startDownloadTip')}
          description={t('download.startDownloadTipDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        <Form form={form} onFinish={handleStart} layout="vertical">
          <Form.Item
            name="targetId"
            label={t('download.selectTarget')}
            tooltip={t('download.selectTargetTooltip')}
            extra={t('download.selectTargetExtra')}
          >
            <Select 
              placeholder={t('download.selectTargetPlaceholder')} 
              allowClear
              size="large"
              showSearch
              filterOption={(input, option) => {
                const children = option?.children as any;
                const text = typeof children === 'string' ? children : String(children || '');
                return text.toLowerCase().includes(input.toLowerCase());
              }}
            >
              {configData?.data?.targets?.map((target: any, index: number) => (
                <Select.Option key={index} value={index.toString()}>
                  <Space>
                    <Tag color={target.type === 'illustration' ? 'blue' : 'purple'}>
                      {target.type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel')}
                    </Tag>
                    <Text strong>{target.tag}</Text>
                    {target.limit && (
                      <Text type="secondary">({t('download.limit')}: {target.limit} {t('download.entries')})</Text>
                    )}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {configData?.data?.targets && configData.data.targets.length === 0 && (
            <Alert
              message={t('download.noTargetsFound')}
              description={t('download.noTargetsFoundDesc')}
              type="warning"
              showIcon
            />
          )}
        </Form>
      </Modal>
    </div>
  );
}

