import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from '../../../components/Layout/AppLayout';

// Mock the hooks
jest.mock('../../../components/Layout/hooks', () => ({
  useLayoutAuth: () => ({
    isAuthenticated: true,
    isLoggingOut: false,
    isRefreshingToken: false,
    handleLogin: jest.fn(),
    handleLogout: jest.fn(),
    handleRefreshToken: jest.fn(),
  }),
}));

describe('AppLayout', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{component}</BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('should render layout structure', () => {
    renderWithProviders(<AppLayout />);
    
    // Check if layout elements are present
    const layout = screen.getByRole('main') || document.querySelector('.ant-layout');
    expect(layout).toBeTruthy();
  });

  it('should render sidebar', () => {
    renderWithProviders(<AppLayout />);
    
    // Sidebar should be present
    const sidebar = document.querySelector('.ant-layout-sider');
    expect(sidebar).toBeTruthy();
  });

  it('should render content area', () => {
    renderWithProviders(<AppLayout />);
    
    // Content area should be present
    const content = document.querySelector('.ant-layout-content');
    expect(content).toBeTruthy();
  });
});

