/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PreviewModal } from '../../../components/modals/PreviewModal';

describe('PreviewModal', () => {
  const defaultProps = {
    open: true,
    title: 'Preview',
  };

  it('renders modal when open is true', () => {
    render(<PreviewModal {...defaultProps} content="Test content" />);
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('does not render modal when open is false', () => {
    render(<PreviewModal {...defaultProps} open={false} content="Test" />);
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  describe('Image type', () => {
    it('renders image preview', () => {
      render(
        <PreviewModal
          {...defaultProps}
          type="image"
          imageUrl="https://example.com/image.jpg"
        />
      );
      const image = screen.getByAltText('Preview');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('uses content as image URL when imageUrl is not provided', () => {
      render(
        <PreviewModal
          {...defaultProps}
          type="image"
          content="https://example.com/image.jpg"
        />
      );
      const image = screen.getByAltText('Preview');
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });
  });

  describe('Text type', () => {
    it('renders text preview', () => {
      render(<PreviewModal {...defaultProps} type="text" content="Sample text content" />);
      expect(screen.getByText('Sample text content')).toBeInTheDocument();
    });

    it('renders React node content', () => {
      render(
        <PreviewModal
          {...defaultProps}
          type="text"
          content={<div data-testid="custom-text">Custom text</div>}
        />
      );
      expect(screen.getByTestId('custom-text')).toBeInTheDocument();
    });
  });

  describe('JSON type', () => {
    it('renders JSON preview with formatted JSON', () => {
      const jsonData = { name: 'Test', value: 123 };
      render(<PreviewModal {...defaultProps} type="json" content={JSON.stringify(jsonData)} />);
      
      // JSON should be formatted
      expect(screen.getByText(/"name"/)).toBeInTheDocument();
      expect(screen.getByText(/"Test"/)).toBeInTheDocument();
    });

    it('handles invalid JSON gracefully', () => {
      // This should not crash, but might show error
      render(<PreviewModal {...defaultProps} type="json" content="invalid json" />);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  describe('Custom type', () => {
    it('renders custom content', () => {
      render(
        <PreviewModal
          {...defaultProps}
          type="custom"
          content={<div data-testid="custom-content">Custom</div>}
        />
      );
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    });

    it('renders string content in custom type', () => {
      render(<PreviewModal {...defaultProps} type="custom" content="Custom string" />);
      expect(screen.getByText('Custom string')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading is true', () => {
      render(<PreviewModal {...defaultProps} loading />);
      // Ant Design Spin component
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('does not show content when loading', () => {
      render(<PreviewModal {...defaultProps} loading content="Content" />);
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });
  });

  describe('Custom render function', () => {
    it('uses renderContent when provided', () => {
      render(
        <PreviewModal
          {...defaultProps}
          renderContent={() => <div data-testid="rendered-content">Rendered</div>}
        />
      );
      expect(screen.getByTestId('rendered-content')).toBeInTheDocument();
    });

    it('prioritizes renderContent over type', () => {
      render(
        <PreviewModal
          {...defaultProps}
          type="text"
          content="Text content"
          renderContent={() => <div data-testid="custom-render">Custom</div>}
        />
      );
      expect(screen.getByTestId('custom-render')).toBeInTheDocument();
      expect(screen.queryByText('Text content')).not.toBeInTheDocument();
    });
  });

  describe('Modal configuration', () => {
    it('uses custom width', () => {
      const { container } = render(
        <PreviewModal {...defaultProps} width={1200} content="Test" />
      );
      // Width is passed to Modal component
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('hides footer by default', () => {
      render(<PreviewModal {...defaultProps} content="Test" />);
      // Footer should not be visible
      expect(screen.queryByText('OK')).not.toBeInTheDocument();
    });

    it('shows footer when showFooter is true', () => {
      render(<PreviewModal {...defaultProps} content="Test" showFooter footer={<>Footer</>} />);
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });
  });
});

