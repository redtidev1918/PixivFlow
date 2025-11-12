import { TFunction } from 'i18next';
import { ApiError, handleApiError } from '../services/api';

/**
 * Translate error code to localized message
 * @param errorCode - The error code from backend
 * @param t - Translation function from i18next
 * @param params - Optional parameters for interpolation
 * @param fallbackMessage - Optional fallback message if translation not found
 * @returns Localized error message
 */
export function translateErrorCode(
  errorCode: string | undefined,
  t: TFunction,
  params?: Record<string, unknown>,
  fallbackMessage?: string
): string {
  if (!errorCode) {
    return fallbackMessage || t('common.error');
  }

  // Try to translate the error code
  const translationKey = `errorCodes.${errorCode}`;
  const translated = t(translationKey, { ...params, defaultValue: errorCode });

  // If translation returns the key itself, it means translation not found
  if (translated === translationKey) {
    return fallbackMessage || errorCode;
  }

  return translated;
}

/**
 * Extract error code and message from API error response
 * @param error - Error object from axios
 * @returns Object with errorCode, message, params, and details
 */
export interface ExtractedErrorInfo {
  errorCode?: string;
  message?: string;
  params?: Record<string, unknown>;
  details?: unknown;
  statusCode?: number;
}

export function extractErrorInfo(error: unknown): ExtractedErrorInfo {
  if (!error) {
    return {};
  }

  const apiError: ApiError = error instanceof ApiError ? error : handleApiError(error);
  const { code, message, params, details, statusCode } = apiError;

  return {
    errorCode: code,
    message,
    params,
    details,
    statusCode,
  };
}

