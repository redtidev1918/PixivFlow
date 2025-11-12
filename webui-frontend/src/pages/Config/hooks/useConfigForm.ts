import { useEffect } from 'react';
import { Form } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useConfig } from '../../../hooks/useConfig';
import { extractErrorInfo, translateErrorCode } from '../../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../../constants';
import { useErrorHandler } from '../../../hooks/useErrorHandler';

/**
 * Hook for managing configuration form
 */
export function useConfigForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const { config, isLoading, updateAsync, validate, isUpdating, isValidating } = useConfig();
  const { handleError, handleSuccess } = useErrorHandler();

  // Load config into form when it's available
  useEffect(() => {
    if (config) {
      const { _meta, _validation, ...configWithoutMeta } = config as any;
      const formData = {
        ...configWithoutMeta,
        targets: Array.isArray(configWithoutMeta.targets) ? configWithoutMeta.targets : [],
      };
      form.setFieldsValue(formData);
    }
  }, [config, form]);

  const handleSave = async () => {
    try {
      const values = form.getFieldsValue();
      await updateAsync(values);
      handleSuccess(t('config.saveSuccess'));
    } catch (error: any) {
      const { errorCode, message: errorMessage, details } = extractErrorInfo(error);
      let formattedMessage: string | undefined;
      
      if (errorCode === 'CONFIG_INVALID' && details && Array.isArray(details)) {
        const errorMessages = details.map((err: any) => {
          if (typeof err === 'object' && err.code) {
            return translateErrorCode(err.code, t, err.params);
          }
          return String(err);
        });
        formattedMessage = `${translateErrorCode(errorCode, t)}: ${errorMessages.join(', ')}`;
      } else {
        formattedMessage = errorMessage || t('config.saveFailed');
      }
      handleError(error, formattedMessage);
    }
  };

  const handleValidate = () => {
    form.validateFields().then((values) => {
      validate(values);
    });
  };

  const handleTargetChange = async () => {
    // Auto-save targets when changed
    try {
      const values = form.getFieldsValue();
      const currentConfig = config || {};
      const { _meta, ...configWithoutMeta } = currentConfig as any;
      const payload = {
        ...configWithoutMeta,
        ...values,
        targets: values.targets,
      };
      await updateAsync(payload);
    } catch (error) {
      const autoSaveFailedMessage = t('config.autoSaveFailed', { defaultValue: t('config.saveFailed') });
      handleError(error, autoSaveFailedMessage);
    }
  };

  const getConfigPreview = () => {
    return JSON.stringify(form.getFieldsValue(), null, 2);
  };

  return {
    form,
    config,
    isLoading,
    isUpdating,
    isValidating,
    handleSave,
    handleValidate,
    handleTargetChange,
    getConfigPreview,
    refreshConfig: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG }),
  };
}

