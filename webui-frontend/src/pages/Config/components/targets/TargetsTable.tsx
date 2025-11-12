import { useMemo } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TargetConfig } from './types';

const { Text } = Typography;

interface TargetsTableProps {
  targets: TargetConfig[];
  onAdd: () => void;
  onEdit: (target: TargetConfig, index: number) => void;
  onDelete: (index: number) => void;
}

export function TargetsTable({
  targets,
  onAdd,
  onEdit,
  onDelete,
}: TargetsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<ColumnsType<TargetConfig>>(() => [
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
        return (
          <Tag color={mode === 'ranking' ? 'purple' : 'cyan'}>
            {mode === 'ranking' ? t('config.modeRanking') : t('config.modeSearch')}
          </Tag>
        );
      },
    },
    {
      title: t('config.targetConfig'),
      key: 'config',
      render: (_: unknown, record: TargetConfig) => {
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
      render: (_: unknown, record: TargetConfig) => (
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
      render: (_: unknown, record: TargetConfig, index: number) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => onEdit(record, index)}
            size="small"
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('config.deleteTargetConfirm')}
            onConfirm={() => onDelete(index)}
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
  ], [onDelete, onEdit, t]);

  return (
    <Card
      title={t('config.targetsList')}
      extra={
        <Button icon={<ThunderboltOutlined />} onClick={onAdd}>
          {t('config.addTarget')}
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={targets}
        rowKey={(record) => (
          record._rowKey
            ? record._rowKey
            : String(record._index ?? record.tag ?? record.mode ?? 'target')
        )}
        pagination={false}
        locale={{ emptyText: t('config.targetsEmpty') }}
      />
    </Card>
  );
}

