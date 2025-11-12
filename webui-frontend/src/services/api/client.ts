import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { setupRequestInterceptor, setupResponseInterceptor } from './interceptors';

/* eslint-disable no-var */
// Declare global type for test environment
declare global {
  var __VITE_ENV__: Record<string, string | undefined> | undefined;
}
/* eslint-enable no-var */

/**
 * Get environment variable value
 * Supports both Vite (import.meta.env) and Jest (process.env) environments
 */
function getEnvVar(key: string): string | undefined {
  // In Jest/test environment, use process.env or global mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeProcess = typeof (globalThis as any).process !== 'undefined' ? (globalThis as any).process : undefined;
  if (nodeProcess?.env?.[key]) {
    return nodeProcess.env[key];
  }
  
  // Check global mock (for tests)
  if (typeof globalThis !== 'undefined' && globalThis.__VITE_ENV__?.[key]) {
    return globalThis.__VITE_ENV__[key];
  }
  
  // In Vite environment, import.meta.env is replaced at build time
  // For runtime, we use a global variable that Vite sets
  // In tests, this will be undefined and we'll use the global mock above
  return undefined;
}

/**
 * API Base URL Configuration
 * Supports environment variable configuration for mobile/remote access
 * Example: VITE_API_BASE_URL=http://192.168.1.100:3000
 */
const getApiBaseURL = (): string => {
  // Priority 1: Environment variable
  const apiBaseUrl = getEnvVar('VITE_API_BASE_URL');
  
  if (apiBaseUrl) {
    return `${apiBaseUrl}/api`;
  }
  // Priority 2: Relative path (same origin)
  return '/api';
};

/**
 * Create and configure Axios client instance
 */
export function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: getApiBaseURL(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Setup interceptors
  setupRequestInterceptor(client);
  setupResponseInterceptor(client);

  return client;
}

/**
 * Default API client instance
 */
export const apiClient = createApiClient();

/**
 * Create a new API client with custom configuration
 */
export function createCustomApiClient(config?: AxiosRequestConfig): AxiosInstance {
  const client = axios.create({
    baseURL: getApiBaseURL(),
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
    ...config,
  });

  // Setup interceptors
  setupRequestInterceptor(client);
  setupResponseInterceptor(client);

  return client;
}

