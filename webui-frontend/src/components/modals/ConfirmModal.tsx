import React from 'react';
import { Modal, ModalProps } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

export interface ConfirmModalProps extends Omit<ModalProps, 'onOk' | 'onCancel'> {
  /**
   * Modal title
   */
  title?: string;
  
  /**
   * Modal content/message
   */
  content: React.ReactNode;
  
  /**
   * Callback when user confirms
   */
  onConfirm: () => void | Promise<void>;
  
  /**
   * Callback when user cancels
   */
  onCancel?: () => void;
  
  /**
   * Text for confirm button
   */
  okText?: string;
  
  /**
   * Text for cancel button
   */
  cancelText?: string;
  
  /**
   * Type of the modal (affects icon and button style)
   */
  type?: 'warning' | 'danger' | 'info' | 'success';
  
  /**
   * Whether the confirm action is loading
   */
  confirmLoading?: boolean;
}

/**
 * Confirmation modal component that provides consistent confirmation dialogs.
 * Supports different types (warning, danger, info, success) with appropriate styling.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  content,
  onConfirm,
  onCancel,
  okText = 'OK',
  cancelText = 'Cancel',
  type = 'warning',
  confirmLoading = false,
  open,
  ...modalProps
}) => {
  const handleOk = async () => {
    try {
      await onConfirm();
    } catch (error) {
      // Error handling is up to the caller
      throw error;
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      case 'info':
        return <ExclamationCircleOutlined style={{ color: '#1890ff' }} />;
      case 'success':
        return <ExclamationCircleOutlined style={{ color: '#52c41a' }} />;
      default:
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    }
  };

  const getOkButtonProps = () => {
    if (type === 'danger') {
      return { danger: true };
    }
    return {};
  };

  return (
    <Modal
      title={
        <span>
          {getIcon()}
          <span style={{ marginLeft: 8 }}>{title || 'Confirm'}</span>
        </span>
      }
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={okText}
      cancelText={cancelText}
      confirmLoading={confirmLoading}
      okButtonProps={getOkButtonProps()}
      {...modalProps}
    >
      {content}
    </Modal>
  );
};

/**
 * Helper function to show a confirmation modal
 */
export const showConfirmModal = (props: Omit<ConfirmModalProps, 'open'>) => {
  return new Promise<boolean>((resolve) => {
    const modal = Modal.confirm({
      title: props.title || 'Confirm',
      content: props.content,
      okText: props.okText || 'OK',
      cancelText: props.cancelText || 'Cancel',
      okType: props.type === 'danger' ? 'danger' : 'primary',
      onOk: async () => {
        try {
          await props.onConfirm();
          resolve(true);
        } catch (error) {
          throw error;
        }
      },
      onCancel: () => {
        if (props.onCancel) {
          props.onCancel();
        }
        resolve(false);
      },
    });
  });
};

export default ConfirmModal;

