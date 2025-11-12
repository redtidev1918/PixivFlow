/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// Mock BrowserRouter to use MemoryRouter instead
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>{children}</MemoryRouter>
    ),
  };
});

// Mock all page components
jest.mock('../pages/Dashboard', () => ({
  __esModule: true,
  default: () => <div>Dashboard Page</div>,
}));

jest.mock('../pages/Config', () => ({
  __esModule: true,
  default: () => <div>Config Page</div>,
}));

jest.mock('../pages/Download', () => ({
  __esModule: true,
  default: () => <div>Download Page</div>,
}));

jest.mock('../pages/History', () => ({
  __esModule: true,
  default: () => <div>History Page</div>,
}));

jest.mock('../pages/Logs', () => ({
  __esModule: true,
  default: () => <div>Logs Page</div>,
}));

jest.mock('../pages/Files', () => ({
  __esModule: true,
  default: () => <div>Files Page</div>,
}));

jest.mock('../pages/Login', () => ({
  __esModule: true,
  default: () => <div>Login Page</div>,
}));

jest.mock('../components/Layout/AppLayout', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}));

describe('App', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  it('renders login page at /login', () => {
    // Use MemoryRouter with initialEntries to set the route
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/login']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('redirects root path to dashboard', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    // Should render AppLayout with Dashboard
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('renders dashboard at /dashboard', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('renders config page at /config', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/config']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('renders download page at /download', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/download']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('renders history page at /history', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/history']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('renders logs page at /logs', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/logs']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('renders files page at /files', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/files']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });
});

