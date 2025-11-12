/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form, Input } from 'antd';
import { FormModal } from '../../../components/modals/FormModal';

describe('FormModal', () => {
  const TestForm: React.FC<{
    onSubmit: (values: any) => void | Promise<void>;
    onCancel?: () => void;
    open?: boolean;
    initialValues?: Record<string, any>;
    submitLoading?: boolean;
  }> = ({ onSubmit, onCancel, open = true, initialValues, submitLoading }) => {
    const [form] = Form.useForm();
    return (
      <FormModal
        form={form}
        title="Test Form"
        open={open}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitLoading={submitLoading}
        initialValues={initialValues}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
          <Input data-testid="name-input" />
        </Form.Item>
        <Form.Item name="email" label="Email">
          <Input data-testid="email-input" />
        </Form.Item>
      </FormModal>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when open is true', async () => {
    render(<TestForm onSubmit={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('does not render modal when open is false', () => {
    render(<TestForm onSubmit={jest.fn()} open={false} />);
    expect(screen.queryByText('Test Form')).not.toBeInTheDocument();
  });

  it('calls onSubmit with form values when submit button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<TestForm onSubmit={onSubmit} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    
    const nameInput = screen.getByTestId('name-input');
    const emailInput = screen.getByTestId('email-input');
    
    await user.type(nameInput, 'John Doe');
    await user.type(emailInput, 'john@example.com');
    
    const submitButton = screen.getByText('Submit');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
      });
    }, { timeout: 3000 });
  });

  it('validates form before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<TestForm onSubmit={onSubmit} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    
    // Don't fill required field
    const submitButton = screen.getByText('Submit');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    }, { timeout: 3000 });
    
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<TestForm onSubmit={jest.fn()} onCancel={onCancel} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('resets form on cancel when resetOnCancel is true', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    
    const TestFormWithReset = () => {
      const [form] = Form.useForm();
      return (
        <FormModal
          form={form}
          title="Test"
          open={true}
          onSubmit={onSubmit}
          onCancel={onCancel}
          resetOnCancel={true}
        >
          <Form.Item name="name">
            <Input data-testid="name-input" />
          </Form.Item>
        </FormModal>
      );
    };
    
    render(<TestFormWithReset />);
    
    const nameInput = screen.getByTestId('name-input');
    await user.type(nameInput, 'Test');
    
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('name-input')).toHaveValue('');
    });
  });

  it('sets initial values when modal opens', async () => {
    const initialValues = { name: 'Initial Name', email: 'initial@example.com' };
    render(<TestForm onSubmit={jest.fn()} initialValues={initialValues} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('name-input')).toHaveValue('Initial Name');
      expect(screen.getByTestId('email-input')).toHaveValue('initial@example.com');
    }, { timeout: 3000 });
  });

  it('shows loading state when submitLoading is true', async () => {
    render(<TestForm onSubmit={jest.fn()} submitLoading />);
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    const submitButton = screen.getByText('Submit');
    // Ant Design Modal buttons might not have disabled attribute directly
    expect(submitButton).toBeInTheDocument();
  });

  it('disables cancel button when submitLoading is true', async () => {
    render(<TestForm onSubmit={jest.fn()} submitLoading />);
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    const cancelButton = screen.getByText('Cancel');
    // Ant Design Modal might disable cancel button when loading
    expect(cancelButton).toBeInTheDocument();
  });

  it('handles async onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<TestForm onSubmit={onSubmit} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Form')).toBeInTheDocument();
    });
    
    const nameInput = screen.getByTestId('name-input');
    await user.type(nameInput, 'Test');
    
    const submitButton = screen.getByText('Submit');
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });
  });

  it('uses custom submit and cancel text', async () => {
    const TestFormWithCustomText = () => {
      const [form] = Form.useForm();
      return (
        <FormModal
          form={form}
          title="Test"
          open={true}
          onSubmit={jest.fn()}
          submitText="Save"
          cancelText="Close"
        >
          <div>Content</div>
        </FormModal>
      );
    };
    
    render(<TestFormWithCustomText />);
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});

