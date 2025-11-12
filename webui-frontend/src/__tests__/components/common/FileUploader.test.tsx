/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploader } from '../../../components/common/FileUploader';

// Mock message API
jest.mock('antd', () => {
  const antd = jest.requireActual('antd');
  return {
    ...antd,
    message: {
      error: jest.fn(),
    },
  };
});

describe('FileUploader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createFile = (name: string, size: number, type: string = 'text/plain'): File => {
    const file = new File(['content'], name, { type });
    Object.defineProperty(file, 'size', {
      value: size,
      writable: false,
    });
    return file;
  };

  it('renders upload button', () => {
    render(<FileUploader onChange={() => {}} />);
    expect(screen.getByText('Select File')).toBeInTheDocument();
  });

  it('renders with custom button text', () => {
    render(<FileUploader onChange={() => {}} buttonText="Upload File" />);
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('calls onChange when file is selected', async () => {
    const onChange = jest.fn();
    render(<FileUploader onChange={onChange} />);
    
    const file = createFile('test.txt', 1000);
    const uploadButton = screen.getByRole('button', { name: /select file/i });
    const input = uploadButton.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    
    if (input) {
      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      });
      
      fireEvent.change(input);
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    }
  });

  it('shows file list when showFileList is true', () => {
    const file = createFile('test.txt', 1000);
    render(<FileUploader fileList={[file]} showFileList />);
    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });

  it('hides file list when showFileList is false', () => {
    const file = createFile('test.txt', 1000);
    render(<FileUploader fileList={[file]} showFileList={false} />);
    expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
  });

  it('calls onRemove when file is removed', () => {
    const file = createFile('test.txt', 1000);
    const onRemove = jest.fn();
    render(<FileUploader fileList={[file]} onRemove={onRemove} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);
    
    expect(onRemove).toHaveBeenCalledWith(file);
  });

  it('validates file size when maxSize is set', async () => {
    const { message } = require('antd');
    const onChange = jest.fn();
    render(<FileUploader onChange={onChange} maxSize={1024} />);
    
    const largeFile = createFile('large.txt', 2048);
    const uploadButton = screen.getByRole('button', { name: /select file/i });
    const input = uploadButton.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    
    if (input) {
      Object.defineProperty(input, 'files', {
        value: [largeFile],
        writable: false,
      });
      
      fireEvent.change(input);
      
      await waitFor(() => {
        expect(message.error).toHaveBeenCalled();
      });
    }
  });

  it('validates file count when maxCount is set', async () => {
    const { message } = require('antd');
    const onChange = jest.fn();
    const file1 = createFile('file1.txt', 100);
    render(<FileUploader onChange={onChange} maxCount={1} fileList={[file1]} />);
    
    const file2 = createFile('file2.txt', 100);
    const uploadButton = screen.getByRole('button', { name: /select file/i });
    const input = uploadButton.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    
    if (input) {
      Object.defineProperty(input, 'files', {
        value: [file2],
        writable: false,
      });
      
      fireEvent.change(input);
      
      await waitFor(() => {
        expect(message.error).toHaveBeenCalled();
      });
    }
  });

  it('is disabled when disabled prop is true', () => {
    render(<FileUploader onChange={() => {}} disabled />);
    const button = screen.getByRole('button', { name: /select file/i });
    expect(button).toBeDisabled();
  });

  it('formats file size correctly', () => {
    const file1 = createFile('file1.txt', 100);
    const file2 = createFile('file2.txt', 1024);
    const file3 = createFile('file3.txt', 1024 * 1024);
    
    render(<FileUploader fileList={[file1, file2, file3]} />);
    
    expect(screen.getByText('100 Bytes')).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
    expect(screen.getByText('1 MB')).toBeInTheDocument();
  });
});

