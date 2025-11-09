import { TFunction } from 'i18next';

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
  params?: Record<string, any>,
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
export function extractErrorInfo(error: any): {
  errorCode?: string;
  message?: string;
  params?: Record<string, any>;
  details?: any;
} {
  if (!error) {
    return {};
  }

  // Check if error has response data
  if (error.response?.data) {
    const data = error.response.data;
    return {
      errorCode: data.errorCode || data.error,
      message: data.message,
      params: data.params,
      details: data.details,
    };
  }

  // Fallback to error message
  return {
    message: error.message || String(error),
  };
}

