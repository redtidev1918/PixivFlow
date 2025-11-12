import { useEffect } from 'react';
import { Form } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useConfig } from '../../../hooks/useConfig';
import { translateErrorCode } from '../../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../../constants';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { ApiError, handleApiError } from '../../../services/api';
import type { ConfigData } from '../../../services/api';

/**
 * Hook for managing configuration form
 */
export function useConfigForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ConfigFormValues>();
  const { config, isLoading, updateAsync, validate, isUpdating, isValidating } = useConfig();
  const { handleError, handleSuccess } = useErrorHandler();

  // Load config into form when it's available
  useEffect(() => {
    if (config) {
      const formData = sanitizeConfigForForm(config);
      form.setFieldsValue(formData);
    }
  }, [config, form]);

  const handleSave = async () => {
    try {
      const values = form.getFieldsValue();
      await updateAsync(values as Partial<ConfigData>);
      handleSuccess(t('config.saveSuccess'));
    } catch (error) {
      const apiError = handleApiError(error);
      const formattedMessage = formatConfigSaveError(apiError, t);
      handleError(apiError, formattedMessage);
    }
  };

  const handleValidate = () => {
    form.validateFields().then((values: ConfigFormValues) => {
      validate(values as Partial<ConfigData>);
    });
  };

  const handleTargetChange = async () => {
    // Auto-save targets when changed
    try {
      const values = form.getFieldsValue();
      const payload: Partial<ConfigData> = {
        ...stripConfigMetadata(config),
        ...values,
        targets: values.targets as ConfigData['targets'],
      };
      await updateAsync(payload);
    } catch (error) {
      const apiError = handleApiError(error);
      const autoSaveFailedMessage =
        translateErrorCode(apiError.code, t, apiError.params, t('config.saveFailed')) ??
        t('config.saveFailed');
      handleError(apiError, autoSaveFailedMessage);
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

type ConfigTarget = NonNullable<ConfigData['targets']>[number];

type ConfigFormTarget = {
  type?: ConfigTarget['type'];
  tag?: ConfigTarget['tag'];
  limit?: ConfigTarget['limit'];
  searchTarget?: ConfigTarget['searchTarget'];
  sort?: ConfigTarget['sort'];
  mode?: ConfigTarget['mode'];
  rankingMode?: ConfigTarget['rankingMode'];
  rankingDate?: ConfigTarget['rankingDate'];
  filterTag?: ConfigTarget['filterTag'];
  minBookmarks?: ConfigTarget['minBookmarks'];
  startDate?: ConfigTarget['startDate'];
  endDate?: ConfigTarget['endDate'];
  seriesId?: ConfigTarget['seriesId'];
  novelId?: ConfigTarget['novelId'];
} & Record<string, any>;

type ConfigFormValues = Omit<ConfigData, '_meta' | '_validation' | 'targets'> & {
  targets?: ConfigFormTarget[];
};

const sanitizeConfigForForm = (config: ConfigData): ConfigFormValues => {
  const { _meta, _validation, ...configWithoutMeta } = config;

  return {
    ...configWithoutMeta,
    targets: Array.isArray(configWithoutMeta.targets) ? configWithoutMeta.targets : [],
  };
};

const stripConfigMetadata = (
  data: ConfigData | undefined
): Partial<ConfigData> => {
  if (!data) {
    return {};
  }

  const { _meta, _validation, ...rest } = data;
  return rest;
};

const formatConfigSaveError = (
  error: ApiError,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (error.code === 'CONFIG_INVALID' && Array.isArray(error.details)) {
    const errorMessages = error.details.map((detail) => {
      if (typeof detail === 'object' && detail && 'code' in detail) {
        const { code, params } = detail as { code?: string; params?: Record<string, unknown> };
        return translateErrorCode(code, t, params);
      }
      return String(detail);
    });

    return `${translateErrorCode(error.code, t)}: ${errorMessages.join(', ')}`;
  }

  return (
    translateErrorCode(error.code, t, error.params, error.message) ||
    error.message ||
    t('config.saveFailed')
  );
};

