import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/Layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import Download from './pages/Download';
import History from './pages/History';
import Logs from './pages/Logs';
import Files from './pages/Files';
import Login from './pages/Login';

/**
 * AppRoutes component - contains all route definitions
 * This is separated from App to allow testing with different Router providers
 */
export function AppRoutes() {
  return (
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
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="config" element={<Config />} />
        <Route path="download" element={<Download />} />
        <Route path="history" element={<History />} />
        <Route path="logs" element={<Logs />} />
        <Route path="files" element={<Files />} />
      </Route>
    </Routes>
  );
}

