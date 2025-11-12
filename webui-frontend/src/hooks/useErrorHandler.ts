import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { ApiError, handleApiError } from '../services/api';
import { translateErrorCode } from '../utils/errorCodeTranslator';

/**
 * Hook for unified error handling
 */
export function useErrorHandler() {
  const { t } = useTranslation();

  const resolveErrorMessage = useCallback(
    (apiError: ApiError, customMessage?: string) => {
      if (customMessage) {
        return customMessage;
      }

      const translatedMessage = translateErrorCode(
        apiError.code,
        t,
        apiError.params,
        apiError.message
      );

      if (translatedMessage) {
        return translatedMessage;
      }

      return apiError.message || t('common.error.unknown');
    },
    [t]
  );

  const handleError = useCallback(
    (error: unknown, customMessage?: string) => {
      const apiError = error instanceof ApiError ? error : handleApiError(error);
      const errorMessage = resolveErrorMessage(apiError, customMessage);

      message.error(errorMessage);

      if (process.env.NODE_ENV !== 'production') {
        console.error('[PixivFlow] API Error:', apiError);
      }

      return apiError;
    },
    [resolveErrorMessage]
  );

  const handleSuccess = useCallback((msg: string) => {
    message.success(msg);
  }, []);

  const handleWarning = useCallback((msg: string) => {
    message.warning(msg);
  }, []);

  const handleInfo = useCallback((msg: string) => {
    message.info(msg);
  }, []);

  return {
    handleError,
    handleSuccess,
    handleWarning,
    handleInfo,
  };
}

