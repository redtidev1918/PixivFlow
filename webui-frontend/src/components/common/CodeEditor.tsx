import React, { useRef, useState } from 'react';
import { Space, Button, message } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';

export interface CodeEditorProps {
  /**
   * Code content
   */
  value: string;
  
  /**
   * Callback when code changes
   */
  onChange?: (value: string) => void;
  
  /**
   * Language mode (for syntax highlighting)
   */
  language?: 'json' | 'javascript' | 'typescript' | 'yaml' | 'xml' | 'html' | 'css' | 'text';
  
  /**
   * Whether the editor is read-only
   */
  readOnly?: boolean;
  
  /**
   * Placeholder text
   */
  placeholder?: string;
  
  /**
   * Minimum height
   */
  minHeight?: number;
  
  /**
   * Maximum height
   */
  maxHeight?: number;
  
  /**
   * Whether to show line numbers
   */
  showLineNumbers?: boolean;
  
  /**
   * Whether to show copy button
   */
  showCopyButton?: boolean;
  
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
 * Simple code editor component using textarea with basic formatting.
 * For more advanced features, consider using a library like Monaco Editor or CodeMirror.
 */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'text',
  readOnly = false,
  placeholder = 'Enter code...',
  minHeight = 200,
  maxHeight = 600,
  showCopyButton = true,
  style,
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      message.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      message.error('Failed to copy');
    }
  };

  // Format JSON on paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (language === 'json' && !readOnly) {
      const pastedText = e.clipboardData.getData('text');
      try {
        const parsed = JSON.parse(pastedText);
        const formatted = JSON.stringify(parsed, null, 2);
        e.preventDefault();
        if (onChange) {
          onChange(formatted);
        }
      } catch {
        // Not valid JSON, allow normal paste
      }
    }
  };

  const editorStyle: React.CSSProperties = {
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, "source-code-pro", monospace',
    fontSize: '14px',
    lineHeight: '1.6',
    padding: '12px',
    border: '1px solid #d9d9d9',
    borderRadius: '4px',
    backgroundColor: language === 'json' ? '#1f1f1f' : '#fff',
    color: language === 'json' ? '#fff' : '#000',
    minHeight: `${minHeight}px`,
    maxHeight: `${maxHeight}px`,
    overflow: 'auto',
    resize: 'vertical',
    width: '100%',
    ...style,
  };

  return (
    <div className={className}>
      {showCopyButton && (
        <Space style={{ marginBottom: 8, justifyContent: 'flex-end', width: '100%' }}>
          <Button
            size="small"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy}
            disabled={!value}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Space>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        readOnly={readOnly}
        placeholder={placeholder}
        style={editorStyle}
        spellCheck={false}
      />
    </div>
  );
};

export default CodeEditor;

