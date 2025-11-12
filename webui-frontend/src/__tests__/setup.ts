/**
 * Jest setup file
 * This file runs before each test file
 */

import '@testing-library/jest-dom';

// Mock Vite environment variables for tests
if (typeof globalThis !== 'undefined') {
  globalThis.__VITE_ENV__ = {
    VITE_API_BASE_URL: '',
    MODE: 'test',
    DEV: 'false',
    PROD: 'false',
  };
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof IntersectionObserver;

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = jest.fn();

// Mock import.meta.env for Vite
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: {
        VITE_API_BASE_URL: '',
        MODE: 'test',
        DEV: 'false',
        PROD: 'false',
      },
    },
  },
  writable: true,
});

