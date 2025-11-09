import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  Table,
  Input,
  Select,
  Space,
  Button,
  Typography,
  Tag,
  message,
  Popconfirm,
  Row,
  Col,
  Switch,
  Statistic,
  Tooltip,
  Badge,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  ClearOutlined,
  DownloadOutlined,
  CopyOutlined,
  VerticalAlignBottomOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import io, { Socket } from 'socket.io-client';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

interface LogEntry {
  line: string;
  level?: string;
  timestamp?: string;
  originalLine: string;
}

export default function Logs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [levelFilter, setLevelFilter] = useState<string | undefined>();
  const [searchText, setSearchText] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch logs
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', page, pageSize, levelFilter, searchText],
    queryFn: () =>
      api.getLogs({
        page,
        limit: pageSize,
        level: levelFilter,
        search: searchText || undefined,
      }),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: () => api.clearLogs(),
    onSuccess: () => {
      message.success(t('logs.logsCleared'));
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.error || t('logs.clearFailed'));
    },
  });

  // WebSocket connection for real-time logs
  useEffect(() => {
    if (autoRefresh) {
      const newSocket = io('http://localhost:3000', {
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        console.log('WebSocket connected');
        newSocket.emit('subscribe', 'logs');
      });

      newSocket.on('log', (_logData: { message: string }) => {
        // Invalidate query to refresh logs
        queryClient.invalidateQueries({ queryKey: ['logs'] });
      });

      newSocket.on('disconnect', () => {
        console.log('WebSocket disconnected');
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
      }
    }
  }, [autoRefresh, queryClient]);

  // Auto scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && autoRefresh && data?.data?.logs) {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        const tableBody = tableRef.current?.querySelector('.ant-table-body');
        if (tableBody) {
          tableBody.scrollTop = tableBody.scrollHeight;
        }
      }, 100);
    }
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [data?.data?.logs, autoScroll, autoRefresh]);

  // Parse log line to extract level and timestamp
  const parseLogLine = (line: string): LogEntry => {
    const levelMatch = line.match(/\[(DEBUG|INFO|WARN|ERROR|FATAL)\]/i);
    const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[\d:\.]+Z)\]/);
    
    return {
      line,
      originalLine: line,
      level: levelMatch ? levelMatch[1].toUpperCase() : undefined,
      timestamp: timestampMatch ? timestampMatch[1] : undefined,
    };
  };

  // Get level color
  const getLevelColor = (level?: string): string => {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return 'red';
      case 'WARN':
        return 'orange';
      case 'INFO':
        return 'blue';
      case 'DEBUG':
        return 'default';
      default:
        return 'default';
    }
  };

  // Format log line for display
  const formatLogLine = (line: string): string => {
    // Remove timestamp and level markers for cleaner display
    return line
      .replace(/\[\d{4}-\d{2}-\d{2}T[\d:\.]+Z\]/g, '')
      .replace(/\[(DEBUG|INFO|WARN|ERROR|FATAL)\]/gi, '')
      .trim();
  };

  // Highlight search text in log line
  const highlightText = (text: string, search: string): React.ReactNode => {
    if (!search || !text) return text;
    
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === search.toLowerCase() ? (
        <mark key={index} style={{ backgroundColor: '#ffd666', padding: '0 2px' }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return '-';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return t('logs.justNow');
      if (diffMins < 60) return `${diffMins} ${t('logs.minutesAgo')}`;
      if (diffHours < 24) return `${diffHours} ${t('logs.hoursAgo')}`;
      if (diffDays < 7) return `${diffDays} ${t('logs.daysAgo')}`;
      
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  // Copy log line to clipboard
  const copyLogLine = (line: string) => {
    navigator.clipboard.writeText(line).then(() => {
      message.success(t('logs.copied'));
    }).catch(() => {
      message.error(t('logs.copyFailed'));
    });
  };

  // Export logs to file
  const exportLogs = () => {
    const logEntries: LogEntry[] =
      (data?.data?.logs?.map((line: string) => parseLogLine(line)) || []);
    
    const content = logEntries.map(entry => entry.originalLine).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(t('logs.logsExported'));
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    const tableBody = tableRef.current?.querySelector('.ant-table-body');
    if (tableBody) {
      tableBody.scrollTop = tableBody.scrollHeight;
      message.success(t('logs.scrolledToBottom'));
    }
  };

  // Calculate log statistics
  const logEntries: LogEntry[] =
    (data?.data?.logs?.map((line: string) => parseLogLine(line)) || []);
  
  const stats = {
    total: data?.data?.total || 0,
    error: logEntries.filter(e => e.level === 'ERROR' || e.level === 'FATAL').length,
    warn: logEntries.filter(e => e.level === 'WARN').length,
    info: logEntries.filter(e => e.level === 'INFO').length,
  };

  const columns = [
    {
      title: t('logs.level'),
      dataIndex: 'level',
      key: 'level',
      width: 90,
      fixed: 'left' as const,
      render: (level: string | undefined) => {
        if (!level) return <Tag>-</Tag>;
        return <Tag color={getLevelColor(level)}>{level}</Tag>;
      },
    },
    {
      title: t('logs.time'),
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp: string | undefined) => {
        if (!timestamp) return <Text type="secondary">-</Text>;
        const formatted = formatTimestamp(timestamp);
        const fullTime = timestamp ? new Date(timestamp).toLocaleString('zh-CN') : '';
        return (
          <Tooltip title={fullTime}>
            <Text type="secondary" style={{ fontSize: '12px' }}>{formatted}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: t('logs.content'),
      dataIndex: 'line',
      key: 'line',
      ellipsis: { showTitle: false },
      render: (line: string, record: LogEntry) => {
        const formatted = formatLogLine(line);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ 
              fontSize: '12px', 
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-all',
              flex: 1,
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, "source-code-pro", monospace',
            }}>
              {searchText ? highlightText(formatted, searchText) : formatted}
            </code>
            <Tooltip title={t('logs.copyLine')}>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyLogLine(record.originalLine)}
                style={{ flexShrink: 0 }}
              />
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t('logs.title')}
          </Title>
        </Col>
        <Col>
          <Space>
            <Switch
              checked={autoRefresh}
              onChange={setAutoRefresh}
              checkedChildren={t('logs.autoRefresh')}
              unCheckedChildren={t('logs.manualRefresh')}
            />
            {autoRefresh && (
              <Switch
                checked={autoScroll}
                onChange={setAutoScroll}
                checkedChildren={t('logs.autoScroll')}
                unCheckedChildren={t('logs.manualScroll')}
                size="small"
              />
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isLoading}
            >
              {t('logs.refresh')}
            </Button>
            <Tooltip title={t('logs.scrollToBottom')}>
              <Button
                icon={<VerticalAlignBottomOutlined />}
                onClick={scrollToBottom}
              />
            </Tooltip>
            <Button
              icon={<DownloadOutlined />}
              onClick={exportLogs}
              disabled={!logEntries.length}
            >
              {t('logs.export')}
            </Button>
            <Popconfirm
              title={t('logs.confirmClear')}
              onConfirm={() => clearLogsMutation.mutate()}
              okText={t('common.ok')}
              cancelText={t('common.cancel')}
            >
              <Button
                danger
                icon={<ClearOutlined />}
                loading={clearLogsMutation.isPending}
              >
                {t('logs.clearLogs')}
              </Button>
            </Popconfirm>
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('logs.totalLogs')}
              value={stats.total}
              prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('logs.errors')}
              value={stats.error}
              prefix={<Badge status="error" />}
              valueStyle={{ color: '#cf1322', fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('logs.warnings')}
              value={stats.warn}
              prefix={<Badge status="warning" />}
              valueStyle={{ color: '#fa8c16', fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('logs.info')}
              value={stats.info}
              prefix={<Badge status="processing" />}
              valueStyle={{ color: '#1890ff', fontSize: '20px' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Row gutter={16}>
            <Col span={8}>
              <Search
                placeholder={t('logs.searchPlaceholder')}
                allowClear
                enterButton={<SearchOutlined />}
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                onSearch={() => {
                  setPage(1);
                  refetch();
                }}
              />
            </Col>
            <Col span={6}>
              <Select
                placeholder={t('logs.filterLevel')}
                allowClear
                style={{ width: '100%' }}
                value={levelFilter}
                onChange={(value) => {
                  setLevelFilter(value);
                  setPage(1);
                }}
              >
                <Option value="DEBUG">DEBUG</Option>
                <Option value="INFO">INFO</Option>
                <Option value="WARN">WARN</Option>
                <Option value="ERROR">ERROR</Option>
                <Option value="FATAL">FATAL</Option>
              </Select>
            </Col>
            <Col span={4}>
              <Select
                value={pageSize}
                onChange={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
                style={{ width: '100%' }}
              >
                <Option value={50}>50 {t('logs.pageSize')}</Option>
                <Option value={100}>100 {t('logs.pageSize')}</Option>
                <Option value={200}>200 {t('logs.pageSize')}</Option>
                <Option value={500}>500 {t('logs.pageSize')}</Option>
                <Option value={1000}>1000 {t('logs.pageSize')}</Option>
              </Select>
            </Col>
          </Row>

          <div ref={tableRef}>
            <Table
              columns={columns}
              dataSource={logEntries.map((entry, index) => ({
                ...entry,
                key: `${page}-${index}-${entry.timestamp || index}`,
              }))}
              loading={isLoading}
              pagination={{
                current: page,
                pageSize: pageSize,
                total: data?.data?.total || 0,
                showSizeChanger: false,
                showTotal: (total, range) => 
                  t('logs.displaying', { start: range[0], end: range[1], total }),
                onChange: (newPage) => {
                  setPage(newPage);
                  setAutoScroll(false);
                },
                showQuickJumper: true,
              }}
              scroll={{ y: 600, x: 'max-content' }}
              size="small"
              rowClassName={(record) => {
                if (record.level === 'ERROR' || record.level === 'FATAL') {
                  return 'log-row-error';
                }
                if (record.level === 'WARN') {
                  return 'log-row-warn';
                }
                return '';
              }}
            />
          </div>
        </Space>
      </Card>

      <style>{`
        .log-row-error {
          background-color: #fff1f0 !important;
        }
        .log-row-error:hover {
          background-color: #ffe7e5 !important;
        }
        .log-row-warn {
          background-color: #fffbe6 !important;
        }
        .log-row-warn:hover {
          background-color: #fff7d1 !important;
        }
        .ant-table-tbody > tr > td {
          padding: 8px 12px !important;
        }
      `}</style>
    </div>
  );
}
