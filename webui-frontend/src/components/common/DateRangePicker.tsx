import React from 'react';
import { DatePicker } from 'antd';
import type { RangePickerProps as AntRangePickerProps } from 'antd/es/date-picker';
import { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

export interface DateRangePickerProps extends Omit<AntRangePickerProps, 'onChange' | 'value' | 'placeholder' | 'mode'> {
  /**
   * Selected date range
   */
  value?: [Dayjs | null, Dayjs | null] | null;
  
  /**
   * Callback when date range changes
   */
  onChange?: (dates: [Dayjs | null, Dayjs | null] | null) => void;
  
  /**
   * Placeholder text
   */
  placeholder?: [string, string];
  
  /**
   * Whether to allow clear
   */
  allowClear?: boolean;
  
  /**
   * Format string
   */
  format?: string;
  
  /**
   * Whether the picker is disabled
   */
  disabled?: boolean;
  
  /**
   * Custom style
   */
  style?: React.CSSProperties;
  
  /**
   * Custom className
   */
  className?: string;
}

/**
 * Date range picker component that provides consistent date range selection UI.
 * Wraps Ant Design RangePicker with common defaults and formatting.
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  placeholder = ['Start date', 'End date'],
  allowClear = true,
  format = 'YYYY-MM-DD',
  disabled = false,
  style,
  className,
  ...datePickerProps
}) => {
  return (
    <RangePicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      allowClear={allowClear}
      format={format}
      disabled={disabled}
      style={{ width: '100%', ...style }}
      className={className}
      {...(datePickerProps as any)}
    />
  );
};

export default DateRangePicker;

