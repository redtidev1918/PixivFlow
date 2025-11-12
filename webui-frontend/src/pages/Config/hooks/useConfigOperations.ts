import { useCallback, useMemo } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { ConfigData } from '../../../services/api';
import { configService } from '../../../services/configService';
import { extractErrorInfo } from '../../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../../constants';
import { useConfigFiles } from '../../../hooks/useConfig';
import { useErrorHandler } from '../../../hooks/useErrorHandler';
import { useLoadingState } from '../../../hooks/useLoadingState';


const IMPORT_LOADING_KEY = 'config-import';

/**
 * Hook for configuration operations (export, import, copy, etc.)
 */
export function useConfigOperations(config: ConfigData | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { refetch: refetchConfigFiles } = useConfigFiles();
  const { handleWarning, handleSuccess, handleError } = useErrorHandler();
  const { loading: isImporting, startLoading, stopLoading } = useLoadingState();

  const configExportPayload = useMemo(() => {
    if (!config) {
      return null;
    }

    const { _meta, _validation, ...configWithoutMeta } = config;
    return configWithoutMeta;
  }, [config]);

  const handleExportConfig = useCallback(() => {
    if (!configExportPayload) {
      handleWarning(t('config.configNotLoaded'));
      return;
    }

    const jsonStr = JSON.stringify(configExportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `config-${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    handleSuccess(t('config.configExported'));
  }, [configExportPayload, handleSuccess, handleWarning, t]);

  const parseConfigFile = useCallback(async (file: File): Promise<Partial<ConfigData>> => {
    const fileContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve((event.target?.result as string) ?? '');
      reader.onerror = () =>
        reject(new Error(t('config.configReadFailed', { defaultValue: 'Failed to read config file' })));
      reader.readAsText(file);
    });

    const parsed = JSON.parse(fileContent) as Partial<ConfigData>;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(t('config.configFormatError'));
    }

    const { _meta, _validation, ...normalized } = parsed as ConfigData;
    return normalized;
  }, [t]);

  const handleImportConfig = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;

    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const files = Array.from(target.files ?? []);
      if (files.length === 0) {
        return;
      }

      startLoading(undefined, IMPORT_LOADING_KEY);

      let successCount = 0;
      let failCount = 0;
      const failedFiles: string[] = [];
      let lastImportedPath: string | null = null;

      try {
        for (const file of files) {
          let configToImport: Partial<ConfigData>;

          try {
            configToImport = await parseConfigFile(file);
          } catch (error) {
            failCount++;
            failedFiles.push(`${file.name}: ${error instanceof Error ? error.message : t('config.configFormatError')}`);
            continue;
          }

          try {
            const validationResult = await configService.validateConfig(configToImport);
            if (!validationResult.valid) {
              const errorDetails = Array.isArray(validationResult.errors) && validationResult.errors.length > 0
                ? validationResult.errors.join(', ')
                : t('config.validationFailed');
              failCount++;
              failedFiles.push(`${file.name}: ${errorDetails}`);
              continue;
            }
          } catch (error) {
            console.warn('[Config Import] Validation error:', error);
          }

          try {
            const baseName = file.name.replace(/\.json$/i, '').replace(/^standalone\.config\./i, '');
            const timestamp = new Date().toISOString().split('T')[0];
            const importName = baseName ? `${baseName}-${timestamp}` : `imported-${timestamp}`;
            const result = await configService.importConfigFile(configToImport, importName);
            lastImportedPath = result.path;
            successCount++;
          } catch (error) {
            const { message: errorMessage } = extractErrorInfo(error);
            failCount++;
            failedFiles.push(
              `${file.name}: ${errorMessage || (error instanceof Error ? error.message : t('config.unknownError'))}`
            );
          }
        }

        if (lastImportedPath) {
          try {
            await configService.switchConfigFile(lastImportedPath);
          } catch (error) {
            handleError(error);
          }
        }

        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG });
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG_FILES });
        refetchConfigFiles();

        if (successCount > 0 && failCount === 0) {
          handleSuccess(
            files.length === 1
              ? t('config.configImportedAndSaved')
              : t('config.configBatchImportedSuccess', { count: successCount })
          );
        } else if (successCount > 0 && failCount > 0) {
          message.warning(
            t('config.configBatchImportedPartial', {
              success: successCount,
              total: files.length,
              failed: failCount,
            })
          );
          console.warn('[Config Import] Failed files:\n', failedFiles.join('\n'));
        } else {
          const errorMessage =
            files.length === 1
              ? `${t('config.configImportFailed')}: ${failedFiles[0] || t('config.unknownError')}`
              : t('config.configBatchImportedFailed', { count: failCount });
          message.error(errorMessage);
        }
      } finally {
        stopLoading();
      }
    };

    input.click();
  }, [
    handleError,
    handleSuccess,
    parseConfigFile,
    queryClient,
    refetchConfigFiles,
    startLoading,
    stopLoading,
    t,
  ]);

  const handleCopyConfig = useCallback(
    async (configJson: string) => {
      try {
        await navigator.clipboard.writeText(configJson);
        handleSuccess(t('config.configCopied'));
      } catch (error) {
        handleError(error, t('config.clipboardCopyFailed', { defaultValue: 'Failed to copy config to clipboard' }));
      }
    },
    [handleError, handleSuccess, t]
  );

  const handleConfigFileSwitch = useCallback(() => {
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, []);

  const handleConfigApplied = useCallback(() => {
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, []);

  return {
    handleExportConfig,
    handleImportConfig,
    handleCopyConfig,
    handleConfigFileSwitch,
    handleConfigApplied,
    isImporting,
  };
}

