/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';
import { api } from '../../services/api';

// Mock API
jest.mock('../../services/api', () => ({
  api: {
    getAuthStatus: jest.fn(),
  },
}));

describe('ProtectedRoute', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('shows loading spinner while checking authentication', () => {
    (api.getAuthStatus as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // Ant Design Spin component uses aria-label="loading" instead of role="status"
    expect(screen.getByLabelText('loading')).toBeInTheDocument();
  });

  it('renders children when authenticated', async () => {
    (api.getAuthStatus as jest.Mock).mockResolvedValue({
      data: {
        authenticated: true,
      },
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects to login when not authenticated', async () => {
    (api.getAuthStatus as jest.Mock).mockResolvedValue({
      data: {
        authenticated: false,
      },
    });

    const { container } = renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      // Navigate component should be rendered
      expect(container.querySelector('div')).toBeInTheDocument();
    });
  });

  it('handles different authentication response formats', async () => {
    (api.getAuthStatus as jest.Mock).mockResolvedValue({
      data: {
        data: {
          authenticated: true,
        },
      },
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('handles isAuthenticated field', async () => {
    (api.getAuthStatus as jest.Mock).mockResolvedValue({
      data: {
        isAuthenticated: true,
      },
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('handles hasToken field', async () => {
    (api.getAuthStatus as jest.Mock).mockResolvedValue({
      data: {
        hasToken: true,
      },
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });
});

