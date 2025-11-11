import React from 'react';
import { Modal, ModalProps, Image, Typography, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export interface PreviewModalProps extends Omit<ModalProps, 'children'> {
  /**
   * Preview title
   */
  title?: string;
  
  /**
   * Preview content type
   */
  type?: 'image' | 'text' | 'json' | 'custom';
  
  /**
   * Preview content/data
   */
  content?: string | React.ReactNode;
  
  /**
   * Image URL (for image type)
   */
  imageUrl?: string;
  
  /**
   * Whether content is loading
   */
  loading?: boolean;
  
  /**
   * Custom render function
   */
  renderContent?: () => React.ReactNode;
  
  /**
   * Width of the modal
   */
  width?: number | string;
  
  /**
   * Whether to show footer
   */
  showFooter?: boolean;
}

/**
 * Preview modal component that provides consistent preview dialogs
 * for images, text, JSON, and custom content.
 */
export const PreviewModal: React.FC<PreviewModalProps> = ({
  title = 'Preview',
  type = 'custom',
  content,
  imageUrl,
  loading = false,
  renderContent,
  width = 800,
  showFooter = false,
  open,
  ...modalProps
}) => {
  const renderPreviewContent = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
        </div>
      );
    }

    if (renderContent) {
      return renderContent();
    }

    switch (type) {
      case 'image':
        return (
          <div style={{ textAlign: 'center' }}>
            <Image
              src={imageUrl || (typeof content === 'string' ? content : undefined)}
              alt={title}
              style={{ maxWidth: '100%' }}
              preview={false}
            />
          </div>
        );

      case 'text':
        return (
          <div
            style={{
              maxHeight: '60vh',
              overflow: 'auto',
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {typeof content === 'string' ? content : content}
          </div>
        );

      case 'json':
        return (
          <div
            style={{
              maxHeight: '60vh',
              overflow: 'auto',
              padding: '16px',
              backgroundColor: '#1f1f1f',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#fff',
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {typeof content === 'string'
                ? JSON.stringify(JSON.parse(content), null, 2)
                : JSON.stringify(content, null, 2)}
            </pre>
          </div>
        );

      case 'custom':
      default:
        return <div>{content}</div>;
    }
  };

  return (
    <Modal
      title={title}
      open={open}
      width={width}
      footer={showFooter ? modalProps.footer : null}
      {...modalProps}
    >
      {renderPreviewContent()}
    </Modal>
  );
};

export default PreviewModal;

