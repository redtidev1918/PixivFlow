/**
 * Error types and utilities for unified error handling
 */

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  DOWNLOAD_ERROR = 'DOWNLOAD_ERROR',
  FILE_ERROR = 'FILE_ERROR',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  originalError?: unknown;
}

/**
 * Normalize error to AppError format
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof Error) {
    // Check if it's a network error
    if (error.message.includes('Network Error') || error.message.includes('timeout')) {
      return {
        code: ErrorCode.NETWORK_ERROR,
        message: error.message,
        originalError: error,
      };
    }

    return {
      code: ErrorCode.UNKNOWN_ERROR,
      message: error.message,
      originalError: error,
    };
  }

  // Check if it's an axios error
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const axiosError = error as { response?: { data?: { errorCode?: string; message?: string } } };
    const errorCode = axiosError.response?.data?.errorCode;
    const message = axiosError.response?.data?.message || 'An error occurred';

    return {
      code: (errorCode as ErrorCode) || ErrorCode.SERVER_ERROR,
      message,
      originalError: error,
    };
  }

  return {
    code: ErrorCode.UNKNOWN_ERROR,
    message: String(error),
    originalError: error,
  };
}

