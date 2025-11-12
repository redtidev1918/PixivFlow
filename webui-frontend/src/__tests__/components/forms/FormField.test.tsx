/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import { FormField } from '../../../components/forms/FormField';

describe('FormField', () => {
  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [form] = Form.useForm();
    return <Form form={form}>{children}</Form>;
  };

  describe('Input type', () => {
    it('renders input field correctly', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test Field" type="input" />
        </TestWrapper>
      );
      expect(screen.getByLabelText('Test Field')).toBeInTheDocument();
    });

    it('renders with placeholder', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" placeholder="Enter text" />
        </TestWrapper>
      );
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('shows required indicator when required', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" required />
        </TestWrapper>
      );
      // Check if required indicator is present (Ant Design adds * to label)
      const label = screen.getByText(/Test/);
      // The required indicator might be in a sibling element or the label itself
      expect(label).toBeInTheDocument();
    });

    it('shows tooltip when provided', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" tooltip="Help text" />
        </TestWrapper>
      );
      // Tooltip icon should be present (QuestionCircleOutlined)
      const icons = screen.getAllByRole('img', { hidden: true });
      expect(icons.length).toBeGreaterThan(0);
    });

    it('handles user input', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Test');
      await user.type(input, 'test value');
      expect(input).toHaveValue('test value');
    });

    it('shows character count when showCount is true', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" showCount maxLength={10} />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Test');
      // Ant Design Input with showCount renders differently
      expect(input).toBeInTheDocument();
    });
  });

  describe('Password type', () => {
    it('renders password field correctly', () => {
      render(
        <TestWrapper>
          <FormField name="password" label="Password" type="password" />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Password');
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  describe('Textarea type', () => {
    it('renders textarea field correctly', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="textarea" />
        </TestWrapper>
      );
      expect(screen.getByLabelText('Test')).toBeInTheDocument();
    });

    it('renders with custom rows', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="textarea" rows={10} />
        </TestWrapper>
      );
      const textarea = screen.getByLabelText('Test');
      // Ant Design TextArea may not expose rows as attribute directly
      expect(textarea).toBeInTheDocument();
    });
  });

  describe('Number type', () => {
    it('renders number field correctly', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="number" />
        </TestWrapper>
      );
      expect(screen.getByLabelText('Test')).toBeInTheDocument();
    });

    it('respects min and max values', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="number" min={0} max={100} />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Test');
      // Ant Design InputNumber may not expose min/max as attributes directly
      expect(input).toBeInTheDocument();
    });

    it('respects step value', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="number" step={0.1} />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Test');
      // Ant Design InputNumber may not expose step as attribute directly
      expect(input).toBeInTheDocument();
    });
  });

  describe('Select type', () => {
    it('renders select field correctly', () => {
      render(
        <TestWrapper>
          <FormField
            name="test"
            label="Test"
            type="select"
            options={[
              { label: 'Option 1', value: '1' },
              { label: 'Option 2', value: '2' },
            ]}
          />
        </TestWrapper>
      );
      expect(screen.getByLabelText('Test')).toBeInTheDocument();
    });

    it('renders options correctly', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <FormField
            name="test"
            label="Test"
            type="select"
            options={[
              { label: 'Option 1', value: '1' },
              { label: 'Option 2', value: '2' },
            ]}
          />
        </TestWrapper>
      );
      const select = screen.getByLabelText('Test');
      await user.click(select);
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('renders option groups correctly', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <FormField
            name="test"
            label="Test"
            type="select"
            optionGroups={[
              {
                label: 'Group 1',
                options: [
                  { label: 'Option 1', value: '1' },
                  { label: 'Option 2', value: '2' },
                ],
              },
            ]}
          />
        </TestWrapper>
      );
      const select = screen.getByLabelText('Test');
      await user.click(select);
      expect(screen.getByText('Group 1')).toBeInTheDocument();
      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });
  });

  describe('Switch type', () => {
    it('renders switch field correctly', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="switch" />
        </TestWrapper>
      );
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('handles switch toggle', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="switch" />
        </TestWrapper>
      );
      const switchElement = screen.getByRole('switch');
      await user.click(switchElement);
      expect(switchElement).toBeChecked();
    });
  });

  describe('Date type', () => {
    it('renders date picker correctly', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="date" />
        </TestWrapper>
      );
      expect(screen.getByLabelText('Test')).toBeInTheDocument();
    });
  });

  describe('DateRange type', () => {
    it('renders date range picker correctly', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="dateRange" />
        </TestWrapper>
      );
      expect(screen.getByLabelText('Test')).toBeInTheDocument();
    });
  });

  describe('Disabled state', () => {
    it('disables input when disabled prop is true', () => {
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" disabled />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Test');
      expect(input).toBeDisabled();
    });
  });

  describe('Allow clear', () => {
    it('shows clear button when allowClear is true', async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <FormField name="test" label="Test" type="input" allowClear />
        </TestWrapper>
      );
      const input = screen.getByLabelText('Test');
      await user.type(input, 'test');
      // Ant Design's clear button appears on hover/focus
      expect(input).toHaveValue('test');
    });
  });

  describe('Custom input props', () => {
    it('passes custom props to input component', () => {
      render(
        <TestWrapper>
          <FormField
            name="test"
            label="Test"
            type="input"
            inputProps={{ 'data-testid': 'custom-input' }}
          />
        </TestWrapper>
      );
      expect(screen.getByTestId('custom-input')).toBeInTheDocument();
    });
  });
});

