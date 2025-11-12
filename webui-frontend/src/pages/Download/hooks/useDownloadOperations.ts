import { useState, useCallback } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { ConfigData } from '../../../services/api';
import { api } from '../../../services/api';
import { translateErrorCode, extractErrorInfo } from '../../../utils/errorCodeTranslator';

/**
 * Hook for managing download operations
 * Handles start, stop, run all, resume, delete operations
 */
export function useDownloadOperations(
  startDownloadAsync: (params: {
    targetId?: string;
    config?: Partial<ConfigData>;
    configPaths?: string[];
  }) => Promise<{ taskId: string }>,
  stopDownloadAsync: (taskId: string) => Promise<void>,
  resumeDownloadAsync: (params: { tag: string; type: 'illustration' | 'novel' }) => Promise<{ taskId: string }>,
  deleteIncompleteTaskAsync: (id: number) => Promise<void>,
  deleteAllIncompleteTasksAsync: () => Promise<{ deletedCount: number }>
) {
  const { t } = useTranslation();
  const [showStartModal, setShowStartModal] = useState(false);

  const handleStart = useCallback(
    async (values: { targetId?: string; configPaths?: string[] }) => {
      try {
        await startDownloadAsync({
          targetId: values.targetId,
          configPaths: values.configPaths,
        });
        message.success(t('download.taskStarted'));
        setShowStartModal(false);
      } catch (error) {
        const { errorCode, message: errorMessage } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, undefined, errorMessage || t('download.startFailed'))
        );
      }
    },
    [startDownloadAsync, t]
  );

  const handleStop = useCallback(
    async (taskId: string) => {
      try {
        await stopDownloadAsync(taskId);
        message.success(t('download.taskStopped'));
      } catch (error) {
        const { errorCode, message: errorMessage } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, undefined, errorMessage || t('download.stopFailed'))
        );
      }
    },
    [stopDownloadAsync, t]
  );

  const handleRunAll = useCallback(() => {
    api
      .runAllDownloads()
      .then(() => {
        message.success(t('download.allTargetsStarted'));
      })
      .catch((error) => {
        const { errorCode, message: errorMessage } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, undefined, errorMessage || t('download.startFailed'))
        );
      });
  }, [t]);

  const handleResume = useCallback(
    async (tag: string, type: 'illustration' | 'novel') => {
      try {
        await resumeDownloadAsync({ tag, type });
        message.success(
          t('download.taskResumedWithTag', {
            tag,
            type: type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel'),
          })
        );
      } catch (error) {
        const { errorCode, message: errorMessage, params } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, params, errorMessage || t('download.resumeFailed'))
        );
      }
    },
    [resumeDownloadAsync, t]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteIncompleteTaskAsync(id);
        message.success(t('download.incompleteTaskDeleted'));
      } catch (error) {
        const { errorCode, message: errorMessage, params } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, params, errorMessage || t('download.deleteFailed'))
        );
      }
    },
    [deleteIncompleteTaskAsync, t]
  );

  const handleDeleteAll = useCallback(async () => {
    try {
      const response = await deleteAllIncompleteTasksAsync();
      const deletedCount = response?.deletedCount || 0;
      if (deletedCount === 0) {
        message.info(t('download.noIncompleteTasks'));
      } else {
        message.success(t('download.allIncompleteTasksDeleted', { count: deletedCount }));
      }
    } catch (error) {
      const { errorCode, message: errorMessage, params } = extractErrorInfo(error);
      if (errorCode) {
        message.error(
          translateErrorCode(errorCode, t, params, errorMessage || t('download.deleteAllFailed'))
        );
      } else {
        message.error(errorMessage || t('download.deleteAllFailed'));
      }
      console.error('Delete all incomplete tasks error:', error);
    }
  }, [deleteAllIncompleteTasksAsync, t]);

  return {
    showStartModal,
    setShowStartModal,
    handleStart,
    handleStop,
    handleRunAll,
    handleResume,
    handleDelete,
    handleDeleteAll,
  };
}

