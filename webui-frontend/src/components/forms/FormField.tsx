import React from 'react';
import { Form, Input, InputNumber, Select, Switch, DatePicker, Tooltip, FormItemProps } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { RangePicker } = DatePicker;

export interface FormFieldProps extends Omit<FormItemProps, 'children'> {
  /**
   * Field type determines which input component to render
   */
  type?: 'input' | 'textarea' | 'number' | 'select' | 'switch' | 'date' | 'dateRange' | 'password';
  
  /**
   * Options for select type
   */
  options?: Array<{ label: string; value: any; disabled?: boolean }>;
  
  /**
   * Option groups for select type
   */
  optionGroups?: Array<{ label: string; options: Array<{ label: string; value: any; disabled?: boolean }> }>;
  
  /**
   * Placeholder text
   */
  placeholder?: string;
  
  /**
   * Tooltip text shown next to label
   */
  tooltip?: string;
  
  /**
   * Minimum value for number type
   */
  min?: number;
  
  /**
   * Maximum value for number type
   */
  max?: number;
  
  /**
   * Step value for number type
   */
  step?: number;
  
  /**
   * Number of rows for textarea type
   */
  rows?: number;
  
  /**
   * Show character count for input/textarea
   */
  showCount?: boolean;
  
  /**
   * Max length for input/textarea
   */
  maxLength?: number;
  
  /**
   * Allow clear
   */
  allowClear?: boolean;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Additional props passed to the underlying input component
   */
  inputProps?: Record<string, any>;
}

/**
 * Universal form field component that renders different input types
 * based on the `type` prop. Supports all common form field types
 * with consistent styling and behavior.
 */
export const FormField: React.FC<FormFieldProps> = ({
  type = 'input',
  options,
  optionGroups,
  placeholder,
  tooltip,
  min,
  max,
  step,
  rows = 4,
  showCount,
  maxLength,
  allowClear = true,
  disabled,
  inputProps,
  label,
  required,
  ...formItemProps
}) => {
  const renderInput = () => {
    switch (type) {
      case 'input':
        return (
          <Input
            placeholder={placeholder}
            allowClear={allowClear}
            disabled={disabled}
            showCount={showCount}
            maxLength={maxLength}
            {...inputProps}
          />
        );
      
      case 'password':
        return (
          <Input.Password
            placeholder={placeholder}
            allowClear={allowClear}
            disabled={disabled}
            {...inputProps}
          />
        );
      
      case 'textarea':
        return (
          <TextArea
            placeholder={placeholder}
            allowClear={allowClear}
            disabled={disabled}
            rows={rows}
            showCount={showCount}
            maxLength={maxLength}
            {...inputProps}
          />
        );
      
      case 'number':
        return (
          <InputNumber
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            style={{ width: '100%' }}
            {...inputProps}
          />
        );
      
      case 'select':
        return (
          <Select
            placeholder={placeholder}
            allowClear={allowClear}
            disabled={disabled}
            {...inputProps}
          >
            {optionGroups ? (
              optionGroups.map((group, index) => (
                <Select.OptGroup key={index} label={group.label}>
                  {group.options.map((option) => (
                    <Select.Option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </Select.Option>
                  ))}
                </Select.OptGroup>
              ))
            ) : (
              options?.map((option) => (
                <Select.Option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </Select.Option>
              ))
            )}
          </Select>
        );
      
      case 'switch':
        return (
          <Switch
            disabled={disabled}
            {...inputProps}
          />
        );
      
      case 'date':
        return (
          <DatePicker
            placeholder={placeholder}
            allowClear={allowClear}
            disabled={disabled}
            style={{ width: '100%' }}
            {...inputProps}
          />
        );
      
      case 'dateRange':
        return (
          <RangePicker
            allowClear={allowClear}
            disabled={disabled}
            style={{ width: '100%' }}
            {...inputProps}
          />
        );
      
      default:
        return (
          <Input
            placeholder={placeholder}
            allowClear={allowClear}
            disabled={disabled}
            {...inputProps}
          />
        );
    }
  };

  const renderLabel = () => {
    if (!label) return undefined;
    
    if (tooltip) {
      return (
        <span>
          {label}
          {required && <span style={{ color: 'red', marginLeft: 4 }}>*</span>}
          <Tooltip title={tooltip}>
            <QuestionCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
          </Tooltip>
        </span>
      );
    }
    
    return label;
  };

  return (
    <Form.Item
      label={renderLabel()}
      required={required}
      {...formItemProps}
    >
      {renderInput()}
    </Form.Item>
  );
};

export default FormField;

