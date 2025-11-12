import React, { useEffect, useRef } from 'react';
import { Collapse, Space, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../utils/dateUtils';

const { Text } = Typography;

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface TaskLogsViewerProps {
  logs: LogEntry[];
  isRunning?: boolean;
}

export const TaskLogsViewer: React.FC<TaskLogsViewerProps> = ({
  logs,
  isRunning = false,
}) => {
  const { t } = useTranslation();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current && logs.length > 0) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  if (!logs || logs.length === 0) {
    return null;
  }

  const levelColor: Record<string, string> = {
    error: '#ff4d4f',
    warn: '#faad14',
    info: '#1890ff',
    debug: '#8c8c8c',
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Collapse
        items={[
          {
            key: 'logs',
            label: (
              <Space>
                <InfoCircleOutlined />
                <span>
                  {t('download.realtimeLogs')} ({logs.length}{' '}
                  {t('download.entries')})
                </span>
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
                {logs.map((log, index) => {
                  const timestamp = formatDate(log.timestamp, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
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
        defaultActiveKey={isRunning ? ['logs'] : []}
      />
    </div>
  );
};

