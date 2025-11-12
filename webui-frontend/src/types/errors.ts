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
  statusCode?: number;
  params?: Record<string, unknown>;
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
        statusCode: undefined,
        originalError: error,
      };
    }

    return {
      code: ErrorCode.UNKNOWN_ERROR,
      message: error.message,
      statusCode: undefined,
      originalError: error,
    };
  }

  // Check if it's an axios error
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const axiosError = error as {
      response?: {
        status?: number;
        data?: { errorCode?: string; message?: string; details?: unknown; params?: Record<string, unknown> };
      };
    };
    const errorCode = axiosError.response?.data?.errorCode;
    const message = axiosError.response?.data?.message || 'An error occurred';

    return {
      code: (errorCode as ErrorCode) || ErrorCode.SERVER_ERROR,
      message,
      statusCode: axiosError.response?.status,
      details: axiosError.response?.data?.details,
      params: axiosError.response?.data?.params,
      originalError: error,
    };
  }

  return {
    code: ErrorCode.UNKNOWN_ERROR,
    message: String(error),
    statusCode: undefined,
    originalError: error,
  };
}

