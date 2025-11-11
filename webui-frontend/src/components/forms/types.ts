import React from 'react';

/**
 * Props for FormSection component
 */
export interface FormSectionProps {
  /**
   * Section title
   */
  title: string;
  
  /**
   * Optional description text
   */
  description?: string;
  
  /**
   * Section content
   */
  children: React.ReactNode;
  
  /**
   * Whether the section is collapsible
   */
  collapsible?: boolean;
  
  /**
   * Whether the section is collapsed by default (only applies when collapsible is true)
   */
  defaultCollapsed?: boolean;
  
  /**
   * Whether to wrap content in a Card component
   */
  card?: boolean;
  
  /**
   * Extra content in the header (e.g., action buttons)
   */
  extra?: React.ReactNode;
  
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
 * Props for FormTabs component
 */
export interface FormTabsProps {
  /**
   * Tab items configuration
   */
  items: Array<{
    key: string;
    label: string;
    children: React.ReactNode;
    icon?: React.ReactNode;
    disabled?: boolean;
  }>;
  
  /**
   * Active tab key
   */
  activeKey?: string;
  
  /**
   * Callback when tab changes
   */
  onChange?: (key: string) => void;
  
  /**
   * Tab position
   */
  tabPosition?: 'top' | 'bottom' | 'left' | 'right';
  
  /**
   * Tab type
   */
  type?: 'line' | 'card' | 'editable-card';
  
  /**
   * Custom style
   */
  style?: React.CSSProperties;
  
  /**
   * Custom className
   */
  className?: string;
}

