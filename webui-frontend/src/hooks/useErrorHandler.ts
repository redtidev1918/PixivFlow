import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { normalizeError, ErrorCode } from '../types/errors';
import { translateErrorCode } from '../utils/errorCodeTranslator';

/**
 * Hook for unified error handling
 */
export function useErrorHandler() {
  const { t } = useTranslation();

  const handleError = useCallback(
    (error: unknown, customMessage?: string) => {
      const appError = normalizeError(error);
      let errorMessage = customMessage;

      if (!errorMessage) {
        // Try to translate error code
        if (appError.code !== ErrorCode.UNKNOWN_ERROR) {
          errorMessage = translateErrorCode(appError.code, t, undefined, appError.message);
        } else {
          errorMessage = appError.message || t('common.error.unknown');
        }
      }

      message.error(errorMessage);
      return appError;
    },
    [t]
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

