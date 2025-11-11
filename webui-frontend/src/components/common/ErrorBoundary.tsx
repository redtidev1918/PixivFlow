import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Card, Typography } from 'antd';
import { ReloadOutlined, BugOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

export interface ErrorBoundaryProps {
  /**
   * Children to render
   */
  children: ReactNode;
  
  /**
   * Custom fallback UI
   */
  fallback?: (error: Error, errorInfo: ErrorInfo) => ReactNode;
  
  /**
   * Callback when error occurs
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  
  /**
   * Whether to show error details
   */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component that catches JavaScript errors anywhere in the child
 * component tree and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback && this.state.error && this.state.errorInfo) {
        return this.props.fallback(this.state.error, this.state.errorInfo);
      }

      // Default fallback UI
      return (
        <Card
          style={{
            margin: '24px',
            maxWidth: '800px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <Alert
            message={
              <Title level={4} style={{ margin: 0 }}>
                <BugOutlined style={{ marginRight: 8 }} />
                Something went wrong
              </Title>
            }
            description={
              <div>
                <Paragraph>
                  <Text strong>Error:</Text> {this.state.error?.message || 'Unknown error'}
                </Paragraph>
                {this.props.showDetails && this.state.errorInfo && (
                  <details style={{ marginTop: 16 }}>
                    <summary style={{ cursor: 'pointer', marginBottom: 8 }}>
                      <Text type="secondary">Error Details</Text>
                    </summary>
                    <pre
                      style={{
                        backgroundColor: '#f5f5f5',
                        padding: '12px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        fontSize: '12px',
                        maxHeight: '300px',
                      }}
                    >
                      {this.state.error?.stack}
                      {'\n\n'}
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReset}
                  style={{ marginTop: 16 }}
                >
                  Try Again
                </Button>
              </div>
            }
            type="error"
            showIcon
          />
        </Card>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

