import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Form, Space } from 'antd';
import type { FormInstance } from 'antd';
import { TargetModal } from './TargetModal';
import { TargetsInfoAlert } from './targets/TargetsInfoAlert';
import { TargetsTable } from './targets/TargetsTable';
import type { TargetConfig } from './targets/types';

interface TargetsConfigFormProps {
  form: FormInstance;
  onTargetChange?: () => void;
}

export const TargetsConfigForm: React.FC<TargetsConfigFormProps> = ({
  form,
  onTargetChange,
}) => {
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetConfig | null>(null);

  useEffect(() => {
    const currentTargets = form.getFieldValue('targets');
    if (!Array.isArray(currentTargets)) {
      form.setFieldsValue({ targets: [] });
    }
  }, [form]);

  const targets =
    Form.useWatch<TargetConfig[]>('targets', form) ||
    (form.getFieldValue('targets') as TargetConfig[] | undefined) ||
    [];

  const notifyTargetChange = useCallback(() => {
    if (onTargetChange) {
      onTargetChange();
    }
  }, [onTargetChange]);

  const handleAddTarget = useCallback(() => {
    setEditingTarget(null);
    setTargetModalVisible(true);
  }, []);

  const handleEditTarget = useCallback((target: TargetConfig, index: number) => {
    setEditingTarget({ ...target, _index: index });
    setTargetModalVisible(true);
  }, []);

  const handleDeleteTarget = useCallback((index: number) => {
    const currentTargets = (form.getFieldValue('targets') || []) as TargetConfig[];
    const nextTargets = currentTargets.filter((_target, idx) => idx !== index);
    form.setFieldsValue({ targets: nextTargets });
    notifyTargetChange();
  }, [form, notifyTargetChange]);

  const handleSaveTarget = useCallback((values: TargetConfig) => {
    const currentTargets = (form.getFieldValue('targets') || []) as TargetConfig[];
    const nextTargets = [...currentTargets];

    if (editingTarget && typeof editingTarget._index === 'number') {
      nextTargets[editingTarget._index] = values;
    } else {
      nextTargets.push(values);
    }

    form.setFieldsValue({ targets: nextTargets });
    setTargetModalVisible(false);
    setEditingTarget(null);
    notifyTargetChange();
  }, [editingTarget, form, notifyTargetChange]);

  const handleModalClose = useCallback(() => {
    setTargetModalVisible(false);
    setEditingTarget(null);
  }, []);

  const targetsWithMetadata = useMemo(
    () => targets.map((target, index) => ({
      ...target,
      _index: index,
      _rowKey: `${target.type || 'target'}-${index}`,
    })),
    [targets],
  );

  return (
    <>
      <Form.Item name="targets" hidden>
        <input type="hidden" />
      </Form.Item>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <TargetsInfoAlert />
        <TargetsTable
          targets={targetsWithMetadata}
          onAdd={handleAddTarget}
          onEdit={handleEditTarget}
          onDelete={handleDeleteTarget}
        />
      </Space>

      <TargetModal
        visible={targetModalVisible}
        editingTarget={editingTarget}
        onSave={handleSaveTarget}
        onCancel={handleModalClose}
      />
    </>
  );
};

