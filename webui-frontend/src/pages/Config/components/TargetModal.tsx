import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Steps, Collapse, Card, Button, Space, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TargetConfig } from './TargetsConfigForm';

const { Option } = Select;
const { Panel } = Collapse;
const { Step } = Steps;
const { Text, Paragraph } = Typography;

interface TargetModalProps {
  visible: boolean;
  editingTarget: TargetConfig | null;
  onSave: (values: TargetConfig) => void;
  onCancel: () => void;
}

export const TargetModal: React.FC<TargetModalProps> = ({
  visible,
  editingTarget,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [targetStep, setTargetStep] = useState(0);

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

  useEffect(() => {
    if (visible) {
      if (editingTarget) {
        form.setFieldsValue(editingTarget);
        setTargetStep(1);
      } else {
        form.resetFields();
        setTargetStep(0);
      }
    }
  }, [visible, editingTarget, form]);

  const handleApplyTemplate = (template: typeof configTemplates[keyof typeof configTemplates]) => {
    form.setFieldsValue(template.config);
    setTargetStep(1);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSave(values);
      form.resetFields();
      setTargetStep(0);
    } catch (error) {
      // Validation errors are handled by Ant Design
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setTargetStep(0);
    onCancel();
  };

  return (
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
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
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
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {template.name}
                    </Typography.Title>
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
        <Form form={form} layout="vertical">
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
  );
};

