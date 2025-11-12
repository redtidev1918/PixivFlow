import { AxiosError } from 'axios';
import { ErrorCode, AppError, normalizeError } from '../../types/errors';

/**
 * Custom API Error class for better error handling
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;
  public readonly originalError?: unknown;
  public readonly params?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode?: number,
    details?: unknown,
    originalError?: unknown,
    params?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.originalError = originalError;
    this.params = params;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Check if error is a network error
   */
  isNetworkError(): boolean {
    return (
      this.code === ErrorCode.NETWORK_ERROR ||
      this.statusCode === undefined ||
      this.originalError instanceof Error &&
      (this.originalError.message.includes('Network Error') ||
        this.originalError.message.includes('timeout'))
    );
  }

  /**
   * Check if error is an authentication error
   */
  isAuthError(): boolean {
    return (
      this.code === ErrorCode.AUTH_ERROR ||
      this.statusCode === 401 ||
      this.statusCode === 403
    );
  }

  /**
   * Check if error is a validation error
   */
  isValidationError(): boolean {
    return (
      this.code === ErrorCode.VALIDATION_ERROR ||
      this.statusCode === 400
    );
  }

  /**
   * Check if error is a server error
   */
  isServerError(): boolean {
    return (
      this.code === ErrorCode.SERVER_ERROR ||
      (this.statusCode !== undefined && this.statusCode >= 500)
    );
  }

  /**
   * Convert to AppError format
   */
  toAppError(): AppError {
    return {
      code: this.code as ErrorCode,
      message: this.message,
      statusCode: this.statusCode,
      params: this.params,
      details: this.details,
      originalError: this.originalError,
    };
  }
}

/**
 * Handle API error and convert to ApiError
 */
export function handleApiError(error: unknown): ApiError {
  // If it's already an ApiError, return it
  if (error instanceof ApiError) {
    return error;
  }

  // Handle Axios errors
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError<{ errorCode?: string; message?: string; details?: unknown; params?: unknown }>;
    const response = axiosError.response;
    const request = axiosError.request;

    // Server responded with error status
    if (response) {
      const errorCode = response.data?.errorCode || getErrorCodeFromStatus(response.status);
      const message = response.data?.message || response.statusText || 'An error occurred';
      const details = response.data?.details;
      const params = response.data?.params as Record<string, unknown> | undefined;

      return new ApiError(
        errorCode,
        message,
        response.status,
        details,
        axiosError,
        params
      );
    }

    // Request was made but no response received (network error)
    if (request) {
      const isTimeout = axiosError.code === 'ECONNABORTED' || 
                       axiosError.message?.includes('timeout') ||
                       axiosError.message?.includes('Network Error');

      return new ApiError(
        ErrorCode.NETWORK_ERROR,
        isTimeout ? 'Request timeout' : 'Network error occurred',
        undefined,
        { code: axiosError.code, message: axiosError.message },
        axiosError
      );
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    const appError = normalizeError(error);
    return new ApiError(
      appError.code,
      appError.message,
      undefined,
      appError.details,
      appError.originalError
    );
  }

  // Handle unknown error types
  const appError = normalizeError(error);
  return new ApiError(
    appError.code,
    appError.message,
    appError.statusCode,
    appError.details,
    appError.originalError,
    appError.params
  );
}

/**
 * Get error code from HTTP status code
 */
function getErrorCodeFromStatus(status: number): string {
  if (status >= 400 && status < 500) {
    if (status === 401 || status === 403) {
      return ErrorCode.AUTH_ERROR;
    }
    if (status === 400) {
      return ErrorCode.VALIDATION_ERROR;
    }
    return ErrorCode.VALIDATION_ERROR;
  }
  if (status >= 500) {
    return ErrorCode.SERVER_ERROR;
  }
  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Type guard for Axios errors
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as { isAxiosError?: boolean }).isAxiosError === true
  );
}

