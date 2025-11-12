import { useCallback } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../services/api';
import { extractErrorInfo } from '../../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../../constants';
import { useConfigFiles } from '../../../hooks/useConfig';

/**
 * Hook for configuration operations (export, import, copy, etc.)
 */
export function useConfigOperations(config: any) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { refetch: refetchConfigFiles } = useConfigFiles();

  const handleExportConfig = useCallback(() => {
    if (!config) {
      message.warning(t('config.configNotLoaded'));
      return;
    }
    
    const { _meta, ...configToExport } = config as any;
    const jsonStr = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(t('config.configExported'));
  }, [config, t]);

  const handleImportConfig = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length === 0) return;

      let successCount = 0;
      let failCount = 0;
      const failedFiles: string[] = [];
      let lastImportedPath: string | null = null;

      for (const file of files) {
        try {
          const fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });

          const config = JSON.parse(fileContent);
          const { _meta, ...configToImport } = config;
          
          try {
            const validationResult = await api.validateConfig(configToImport);
            if (!validationResult.data.data.valid) {
              failedFiles.push(`${file.name}: ${t('config.validationFailed')}`);
              failCount++;
              continue;
            }
          } catch (error) {
            console.warn('Config validation error:', error);
          }
        
          try {
            const baseName = file.name.replace(/\.json$/i, '').replace(/^standalone\.config\./i, '');
            const timestamp = new Date().toISOString().split('T')[0];
            const importName = baseName ? `${baseName}-${timestamp}` : `imported-${timestamp}`;
            const result = await api.importConfigFile(configToImport, importName);
            lastImportedPath = result.data.data.path;
            successCount++;
          } catch (error: any) {
            const { message: errorMessage } = extractErrorInfo(error);
            failedFiles.push(`${file.name}: ${errorMessage || error?.message || t('config.unknownError')}`);
            failCount++;
          }
        } catch (error) {
          failedFiles.push(`${file.name}: ${t('config.configFormatError')}`);
          failCount++;
        }
      }

      if (lastImportedPath) {
        try {
          await api.switchConfigFile(lastImportedPath);
        } catch (error) {
          console.warn('Failed to switch to imported config:', error);
        }
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CONFIG_FILES });
      refetchConfigFiles();

      if (successCount > 0 && failCount === 0) {
        message.success(
          files.length === 1 
            ? t('config.configImportedAndSaved')
            : t('config.configBatchImportedSuccess', { count: successCount })
        );
      } else if (successCount > 0 && failCount > 0) {
        message.warning(
          t('config.configBatchImportedPartial', { 
            success: successCount, 
            total: files.length,
            failed: failCount 
          })
        );
      } else {
        message.error(
          files.length === 1
            ? `${t('config.configImportFailed')}: ${failedFiles[0] || t('config.unknownError')}`
            : t('config.configBatchImportedFailed', { count: failCount })
        );
      }
    };
    input.click();
  }, [t, queryClient, refetchConfigFiles]);

  const handleCopyConfig = useCallback((configJson: string) => {
    navigator.clipboard.writeText(configJson);
    message.success(t('config.configCopied'));
  }, [t]);

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
  };
}

