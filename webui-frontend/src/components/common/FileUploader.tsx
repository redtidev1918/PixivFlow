import React, { useState } from 'react';
import { Upload, Button, UploadProps, message, Typography, List, UploadFile } from 'antd';
import type { RcFile } from 'antd/es/upload';
import { UploadOutlined, DeleteOutlined, FileOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface FileUploaderProps {
  /**
   * Accepted file types (e.g., '.json', '.txt')
   */
  accept?: string;
  
  /**
   * Maximum number of files
   */
  maxCount?: number;
  
  /**
   * Maximum file size in bytes
   */
  maxSize?: number;
  
  /**
   * Whether to allow multiple files
   */
  multiple?: boolean;
  
  /**
   * Callback when files are selected
   */
  onChange?: (files: File[]) => void;
  
  /**
   * Callback when files are removed
   */
  onRemove?: (file: File) => void;
  
  /**
   * Current file list
   */
  fileList?: File[];
  
  /**
   * Upload button text
   */
  buttonText?: string;
  
  /**
   * Whether to show file list
   */
  showFileList?: boolean;
  
  /**
   * Custom upload handler
   */
  customRequest?: UploadProps['customRequest'];
  
  /**
   * Whether the uploader is disabled
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
 * File uploader component that provides consistent file upload UI.
 * Supports single and multiple file uploads with validation.
 */
export const FileUploader: React.FC<FileUploaderProps> = ({
  accept,
  maxCount = 1,
  maxSize,
  multiple = false,
  onChange,
  onRemove,
  fileList: controlledFileList,
  buttonText = 'Select File',
  showFileList = true,
  customRequest,
  disabled = false,
  style,
  className,
}) => {
  const [internalFileList, setInternalFileList] = useState<File[]>([]);
  
  const fileList = controlledFileList ?? internalFileList;

  const handleChange = (info: any) => {
    const files = info.fileList
      .filter((file: any) => file.status === 'done' || file.originFileObj)
      .map((file: any) => file.originFileObj || file);
    
    if (controlledFileList === undefined) {
      setInternalFileList(files);
    }
    
    if (onChange) {
      onChange(files);
    }
  };

  const handleRemove = (file: File) => {
    const newFileList = fileList.filter((f) => f !== file);
    
    if (controlledFileList === undefined) {
      setInternalFileList(newFileList);
    }
    
    if (onChange) {
      onChange(newFileList);
    }
    
    if (onRemove) {
      onRemove(file);
    }
  };

  const beforeUpload = (file: File) => {
    // Check file size
    if (maxSize && file.size > maxSize) {
      message.error(`File size exceeds ${(maxSize / 1024 / 1024).toFixed(2)}MB`);
      return Upload.LIST_IGNORE;
    }
    
    // Check file count
    if (fileList.length >= maxCount) {
      message.error(`Maximum ${maxCount} file(s) allowed`);
      return Upload.LIST_IGNORE;
    }
    
    return true;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div style={style} className={className}>
      <Upload
        accept={accept}
        multiple={multiple}
        fileList={fileList.map((file, index): UploadFile => ({
          uid: `${index}`,
          name: file.name,
          status: 'done' as const,
          originFileObj: file as RcFile,
        }))}
        onChange={handleChange}
        beforeUpload={beforeUpload}
        customRequest={customRequest || (() => {})}
        disabled={disabled}
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />} disabled={disabled}>
          {buttonText}
        </Button>
      </Upload>
      
      {showFileList && fileList.length > 0 && (
        <List
          size="small"
          style={{ marginTop: 16 }}
          dataSource={fileList}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button
                  key="delete"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(file)}
                  disabled={disabled}
                />,
              ]}
            >
              <List.Item.Meta
                avatar={<FileOutlined />}
                title={<Text>{file.name}</Text>}
                description={<Text type="secondary">{formatFileSize(file.size)}</Text>}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};

export default FileUploader;

