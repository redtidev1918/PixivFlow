/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeEditor } from '../../../components/common/CodeEditor';

// Mock message API before imports
jest.mock('antd', () => {
  const antd = jest.requireActual('antd');
  return {
    ...antd,
    message: {
      success: jest.fn(),
      error: jest.fn(),
    },
  };
});

// Mock clipboard API
const mockWriteText = jest.fn(() => Promise.resolve());
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
});

describe('CodeEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with value', () => {
    render(<CodeEditor value="const x = 1;" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('const x = 1;');
  });

  it('calls onChange when value changes', () => {
    const onChange = jest.fn();
    render(<CodeEditor value="" onChange={onChange} />);
    const textarea = screen.getByRole('textbox');
    
    fireEvent.change(textarea, { target: { value: 'new code' } });
    expect(onChange).toHaveBeenCalledWith('new code');
  });

  it('renders with placeholder', () => {
    render(<CodeEditor value="" placeholder="Enter code..." />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Enter code...');
  });

  it('is read-only when readOnly is true', () => {
    render(<CodeEditor value="code" readOnly />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
  });

  it('shows copy button by default', () => {
    render(<CodeEditor value="code" />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('hides copy button when showCopyButton is false', () => {
    render(<CodeEditor value="code" showCopyButton={false} />);
    expect(screen.queryByText('Copy')).not.toBeInTheDocument();
  });

  it('copies to clipboard when copy button is clicked', async () => {
    const antd = require('antd');
    render(<CodeEditor value="code to copy" />);
    
    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);
    
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('code to copy');
      expect(antd.message.success).toHaveBeenCalledWith('Copied to clipboard');
    });
  });

  it('shows "Copied" after copying', async () => {
    render(<CodeEditor value="code" />);
    
    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);
    
    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeInTheDocument();
    });
  });

  it('disables copy button when value is empty', () => {
    render(<CodeEditor value="" />);
    const copyButton = screen.getByText('Copy').closest('button');
    expect(copyButton).toBeDisabled();
  });

  it('formats JSON on paste when language is json', async () => {
    const onChange = jest.fn();
    render(<CodeEditor value="" language="json" onChange={onChange} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Create a paste event using fireEvent with clipboardData mock
    const clipboardData = {
      getData: (type: string) => {
        if (type === 'text') {
          return '{"key":"value"}';
        }
        return '';
      },
    };
    
    fireEvent.paste(textarea, {
      clipboardData,
    });
    
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('{\n  "key": "value"\n}');
    });
  });

  it('does not format invalid JSON on paste', () => {
    const onChange = jest.fn();
    render(<CodeEditor value="" language="json" onChange={onChange} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Create a paste event using fireEvent with clipboardData mock
    const clipboardData = {
      getData: (type: string) => {
        if (type === 'text') {
          return 'invalid json';
        }
        return '';
      },
    };
    
    // Should not call onChange for invalid JSON
    fireEvent.paste(textarea, {
      clipboardData,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not format JSON on paste when language is not json', () => {
    const onChange = jest.fn();
    render(<CodeEditor value="" language="javascript" onChange={onChange} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Create a paste event using fireEvent with clipboardData mock
    const clipboardData = {
      getData: (type: string) => {
        if (type === 'text') {
          return '{"key":"value"}';
        }
        return '';
      },
    };
    
    // Should not format when language is not json
    fireEvent.paste(textarea, {
      clipboardData,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not format JSON on paste when readOnly is true', () => {
    const onChange = jest.fn();
    render(<CodeEditor value="" language="json" readOnly onChange={onChange} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    // Create a paste event using fireEvent with clipboardData mock
    const clipboardData = {
      getData: (type: string) => {
        if (type === 'text') {
          return '{"key":"value"}';
        }
        return '';
      },
    };
    
    fireEvent.paste(textarea, {
      clipboardData,
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

