import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import I18nProvider from './components/I18nProvider';
import ErrorBoundary from './components/ErrorBoundary';
import './i18n/config';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes - cache persists for 10 minutes
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

