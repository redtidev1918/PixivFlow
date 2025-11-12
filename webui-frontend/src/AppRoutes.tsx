import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from './components/Layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { LoadingSpinner } from './components/common/LoadingSpinner';

// Lazy load page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Config = lazy(() => import('./pages/Config'));
const Download = lazy(() => import('./pages/Download'));
const History = lazy(() => import('./pages/History'));
const Logs = lazy(() => import('./pages/Logs'));
const Files = lazy(() => import('./pages/Files'));
const Login = lazy(() => import('./pages/Login'));

/**
 * AppRoutes component - contains all route definitions
 * This is separated from App to allow testing with different Router providers
 */
export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="config"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Config />
              </Suspense>
            }
          />
          <Route
            path="download"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Download />
              </Suspense>
            }
          />
          <Route
            path="history"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <History />
              </Suspense>
            }
          />
          <Route
            path="logs"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Logs />
              </Suspense>
            }
          />
          <Route
            path="files"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Files />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}

