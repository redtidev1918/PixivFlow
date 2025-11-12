import React, { useState } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Alert, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { FormInstance } from 'antd';
import { TargetModal } from './TargetModal';

const { Text } = Typography;

export interface TargetConfig {
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
  _index?: number;
  [key: string]: any;
}

interface TargetsConfigFormProps {
  form: FormInstance;
  onTargetChange?: () => void;
}

export const TargetsConfigForm: React.FC<TargetsConfigFormProps> = ({
  form,
  onTargetChange,
}) => {
  const { t } = useTranslation();
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetConfig | null>(null);

  const targets = form.getFieldValue('targets') || [];

  const handleAddTarget = () => {
    setEditingTarget(null);
    setTargetModalVisible(true);
  };

  const handleEditTarget = (target: TargetConfig, index: number) => {
    setEditingTarget({ ...target, _index: index });
    setTargetModalVisible(true);
  };

  const handleDeleteTarget = async (index: number) => {
    const currentTargets = form.getFieldValue('targets') || [];
    const newTargets = [...currentTargets];
    newTargets.splice(index, 1);
    form.setFieldsValue({ targets: newTargets });
    if (onTargetChange) {
      onTargetChange();
    }
  };

  const handleSaveTarget = (values: TargetConfig) => {
    const currentTargets = form.getFieldValue('targets') || [];
    const newTargets = [...currentTargets];
    
    if (editingTarget && typeof editingTarget._index === 'number') {
      newTargets[editingTarget._index] = values;
    } else {
      newTargets.push(values);
    }
    
    form.setFieldsValue({ targets: newTargets });
    setTargetModalVisible(false);
    setEditingTarget(null);
    if (onTargetChange) {
      onTargetChange();
    }
  };

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

  return (
    <>
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
            <Button icon={<ThunderboltOutlined />} onClick={handleAddTarget}>
              {t('config.addTarget')}
            </Button>
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

      <TargetModal
        visible={targetModalVisible}
        editingTarget={editingTarget}
        onSave={handleSaveTarget}
        onCancel={() => {
          setTargetModalVisible(false);
          setEditingTarget(null);
        }}
      />
    </>
  );
};

