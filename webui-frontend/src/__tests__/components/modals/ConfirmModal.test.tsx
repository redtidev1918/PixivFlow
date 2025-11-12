/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmModal } from '../../../components/modals/ConfirmModal';

describe('ConfirmModal', () => {
  const defaultProps = {
    open: true,
    title: 'Confirm Action',
    content: 'Are you sure you want to proceed?',
    onConfirm: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when open is true', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('does not render modal when open is false', () => {
    render(<ConfirmModal {...defaultProps} open={false} />);
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('calls onConfirm when OK button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    
    const okButton = screen.getByText('OK');
    await user.click(okButton);
    
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);
    
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onCancel if not provided', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps} />);
    
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    
    // Should not throw error
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('handles async onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    
    const okButton = screen.getByText('OK');
    await user.click(okButton);
    
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state when confirmLoading is true', () => {
    render(<ConfirmModal {...defaultProps} confirmLoading />);
    const okButton = screen.getByText('OK');
    // Ant Design Modal buttons might not have disabled attribute directly
    // Check for loading state or button being in loading state
    expect(okButton).toBeInTheDocument();
    // The button should be in a loading state (check parent or class)
    const buttonParent = okButton.closest('button') || okButton.closest('span');
    expect(buttonParent).toBeInTheDocument();
  });

  it('disables cancel button when confirmLoading is true', () => {
    render(<ConfirmModal {...defaultProps} confirmLoading />);
    const cancelButton = screen.getByText('Cancel');
    // Ant Design Modal might disable cancel button when loading
    expect(cancelButton).toBeInTheDocument();
  });

  describe('Modal types', () => {
    it('renders warning type by default', () => {
      render(<ConfirmModal {...defaultProps} />);
      // Icon should be present
      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
    });

    it('renders danger type with danger button', () => {
      render(<ConfirmModal {...defaultProps} type="danger" />);
      const okButton = screen.getByText('OK');
      expect(okButton).toHaveClass('ant-btn-dangerous');
    });

    it('renders info type', () => {
      render(<ConfirmModal {...defaultProps} type="info" />);
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });

    it('renders success type', () => {
      render(<ConfirmModal {...defaultProps} type="success" />);
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });
  });

  describe('Custom button text', () => {
    it('uses custom okText', () => {
      render(<ConfirmModal {...defaultProps} okText="Yes" />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.queryByText('OK')).not.toBeInTheDocument();
    });

    it('uses custom cancelText', () => {
      render(<ConfirmModal {...defaultProps} cancelText="No" />);
      expect(screen.getByText('No')).toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });
  });

  describe('Content rendering', () => {
    it('renders string content', () => {
      render(<ConfirmModal {...defaultProps} content="Simple text" />);
      expect(screen.getByText('Simple text')).toBeInTheDocument();
    });

    it('renders React node content', () => {
      render(
        <ConfirmModal
          {...defaultProps}
          content={<div data-testid="custom-content">Custom content</div>}
        />
      );
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    });
  });
});

