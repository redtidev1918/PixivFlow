import React, { useEffect } from 'react';
import { Modal, Form, FormProps, Button, Space, ModalProps } from 'antd';

export interface FormModalProps extends Omit<ModalProps, 'onOk' | 'onCancel'> {
  /**
   * Form instance (from Form.useForm())
   */
  form: ReturnType<typeof Form.useForm>[0];
  
  /**
   * Form title
   */
  title: string;
  
  /**
   * Form content/fields
   */
  children: React.ReactNode;
  
  /**
   * Callback when form is submitted
   */
  onSubmit: (values: any) => void | Promise<void>;
  
  /**
   * Callback when modal is cancelled
   */
  onCancel?: () => void;
  
  /**
   * Text for submit button
   */
  submitText?: string;
  
  /**
   * Text for cancel button
   */
  cancelText?: string;
  
  /**
   * Whether the submit action is loading
   */
  submitLoading?: boolean;
  
  /**
   * Initial form values
   */
  initialValues?: Record<string, any>;
  
  /**
   * Form layout
   */
  formLayout?: FormProps['layout'];
  
  /**
   * Form props
   */
  formProps?: Omit<FormProps, 'form' | 'onFinish' | 'initialValues' | 'layout'>;
  
  /**
   * Whether to reset form on cancel
   */
  resetOnCancel?: boolean;
  
  /**
   * Whether to reset form on submit
   */
  resetOnSubmit?: boolean;
}

/**
 * Form modal component that provides consistent form dialogs.
 * Handles form validation, submission, and reset automatically.
 */
export const FormModal: React.FC<FormModalProps> = ({
  form,
  title,
  children,
  onSubmit,
  onCancel,
  submitText = 'Submit',
  cancelText = 'Cancel',
  submitLoading = false,
  initialValues,
  formLayout = 'vertical',
  formProps,
  resetOnCancel = true,
  resetOnSubmit = true,
  open,
  ...modalProps
}) => {
  // Set initial values when modal opens
  useEffect(() => {
    if (open && initialValues) {
      form.setFieldsValue(initialValues);
    }
  }, [open, initialValues, form]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open && resetOnCancel) {
      form.resetFields();
    }
  }, [open, resetOnCancel, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit(values);
      if (resetOnSubmit) {
        form.resetFields();
      }
    } catch (error) {
      // Form validation errors are handled by Ant Design
      if (error && typeof error === 'object' && 'errorFields' in error) {
        // Validation error, don't throw
        return;
      }
      // Other errors should be handled by the caller
      throw error;
    }
  };

  const handleCancel = () => {
    if (resetOnCancel) {
      form.resetFields();
    }
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button onClick={handleCancel} disabled={submitLoading}>
            {cancelText}
          </Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={submitLoading}
          >
            {submitText}
          </Button>
        </Space>
      }
      {...modalProps}
    >
      <Form
        form={form}
        layout={formLayout}
        onFinish={handleSubmit}
        {...formProps}
      >
        {children}
      </Form>
    </Modal>
  );
};

export default FormModal;

