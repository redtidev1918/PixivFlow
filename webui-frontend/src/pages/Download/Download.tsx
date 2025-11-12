import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { message } from 'antd';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { translateErrorCode, extractErrorInfo } from '../../utils/errorCodeTranslator';
import { QUERY_KEYS } from '../../constants';
import {
  useDownload,
  useDownloadStatus,
  useDownloadLogs,
  useIncompleteTasks,
} from '../../hooks/useDownload';
import { useConfig } from '../../hooks/useConfig';
import {
  TaskStatistics,
  TaskActions,
  ActiveTaskCard,
  IncompleteTasksTable,
  TaskHistoryTable,
  StartDownloadModal,
} from './components';

const { Title, Paragraph } = Typography;

export default function Download() {
  const { t } = useTranslation();
  const [showStartModal, setShowStartModal] = useState(false);

  // Use hooks for download operations
  const {
    startAsync: startDownloadAsync,
    isStarting,
    stopAsync: stopDownloadAsync,
    isStopping,
  } = useDownload();

  const {
    isLoading: statusLoading,
    hasActiveTask,
    activeTask,
    allTasks,
  } = useDownloadStatus(undefined, 2000);

  const activeTaskId = activeTask?.taskId;
  const { logs: taskLogs } = useDownloadLogs(activeTaskId, undefined, 2000);

  const {
    tasks: incompleteTasks,
    refetch: refetchIncompleteTasks,
    resumeAsync: resumeDownloadAsync,
    deleteAsync: deleteIncompleteTaskAsync,
    deleteAllAsync: deleteAllIncompleteTasksAsync,
    isResuming,
    isDeleting,
    isDeletingAll,
  } = useIncompleteTasks();

  // Get config to show available targets and paths
  const { config: configData, refetch: refetchConfig } = useConfig();

  // Get configuration files list
  const { data: configFilesData } = useQuery({
    queryKey: QUERY_KEYS.CONFIG_FILES,
    queryFn: () => api.listConfigFiles(),
  });

  // Calculate task duration helper
  const calculateDuration = (startTime: Date, endTime?: Date) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000); // seconds

    if (duration < 60) {
      return `${duration} ${t('download.seconds')}`;
    } else if (duration < 3600) {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      return `${minutes} ${t('download.minutes')} ${seconds} ${t('download.seconds')}`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours} ${t('download.hours')} ${minutes} ${t('download.minutes')}`;
    }
  };

  // Task statistics
  const taskStats = useMemo(() => {
    const tasks = allTasks || [];
    const completed = tasks.filter((t: any) => t.status === 'completed').length;
    const failed = tasks.filter((t: any) => t.status === 'failed').length;
    const stopped = tasks.filter((t: any) => t.status === 'stopped').length;
    return { total: tasks.length, completed, failed, stopped };
  }, [allTasks]);

  // Handlers
  const handleStart = async (values: { targetId?: string; configPaths?: string[] }) => {
    try {
      await startDownloadAsync({
        targetId: values.targetId,
        configPaths: values.configPaths,
      });
      message.success(t('download.taskStarted'));
      setShowStartModal(false);
    } catch (error: any) {
      const { errorCode, message: errorMessage } = extractErrorInfo(error);
      message.error(
        translateErrorCode(errorCode, t, undefined, errorMessage || t('download.startFailed'))
      );
    }
  };

  const handleStop = async () => {
    if (activeTask?.taskId) {
      try {
        await stopDownloadAsync(activeTask.taskId);
        message.success(t('download.taskStopped'));
      } catch (error: any) {
        const { errorCode, message: errorMessage } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, undefined, errorMessage || t('download.stopFailed'))
        );
      }
    }
  };

  const handleRunAll = () => {
    // Use mutation directly for runAll
    api
      .runAllDownloads()
      .then(() => {
        message.success(t('download.allTargetsStarted'));
      })
      .catch((error: any) => {
        const { errorCode, message: errorMessage } = extractErrorInfo(error);
        message.error(
          translateErrorCode(errorCode, t, undefined, errorMessage || t('download.startFailed'))
        );
      });
  };

  const handleResume = async (tag: string, type: 'illustration' | 'novel') => {
    try {
      await resumeDownloadAsync({ tag, type });
      message.success(
        t('download.taskResumedWithTag', {
          tag,
          type: type === 'illustration' ? t('download.typeIllustration') : t('download.typeNovel'),
        })
      );
    } catch (error: any) {
      const { errorCode, message: errorMessage, params } = extractErrorInfo(error);
      message.error(
        translateErrorCode(errorCode, t, params, errorMessage || t('download.resumeFailed'))
      );
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteIncompleteTaskAsync(id);
      message.success(t('download.incompleteTaskDeleted'));
    } catch (error: any) {
      const { errorCode, message: errorMessage, params } = extractErrorInfo(error);
      message.error(
        translateErrorCode(errorCode, t, params, errorMessage || t('download.deleteFailed'))
      );
    }
  };

  const handleDeleteAll = async () => {
    try {
      const response = await deleteAllIncompleteTasksAsync();
      const deletedCount = response?.deletedCount || 0;
      if (deletedCount === 0) {
        message.info(t('download.noIncompleteTasks'));
      } else {
        message.success(t('download.allIncompleteTasksDeleted', { count: deletedCount }));
      }
    } catch (error: any) {
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
  };

  return (
    <div>
      <Title level={2}>{t('download.title')}</Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {t('download.description')}
      </Paragraph>

      <TaskStatistics
        total={taskStats.total}
        completed={taskStats.completed}
        failed={taskStats.failed}
        stopped={taskStats.stopped}
      />

      <TaskActions
        hasActiveTask={hasActiveTask}
        onStartClick={() => setShowStartModal(true)}
        onRunAllClick={handleRunAll}
        onStopClick={handleStop}
        isStarting={isStarting}
        isRunningAll={false}
        isStopping={isStopping}
        storage={configData?.storage}
        onRefreshConfig={refetchConfig}
      />

      {activeTask && (
        <ActiveTaskCard
          task={activeTask}
          logs={taskLogs}
          onStop={handleStop}
          isStopping={isStopping}
        />
      )}

      {incompleteTasks && incompleteTasks.length > 0 && (
        <IncompleteTasksTable
          tasks={incompleteTasks}
          hasActiveTask={hasActiveTask}
          onRefresh={refetchIncompleteTasks}
          onResume={handleResume}
          onDelete={handleDelete}
          onDeleteAll={handleDeleteAll}
          isResuming={isResuming}
          isDeleting={isDeleting}
          isDeletingAll={isDeletingAll}
        />
      )}

      <TaskHistoryTable
        tasks={allTasks || []}
        isLoading={statusLoading}
        calculateDuration={calculateDuration}
      />

      <StartDownloadModal
        open={showStartModal}
        onCancel={() => setShowStartModal(false)}
        onFinish={handleStart}
        isSubmitting={isStarting}
        configFiles={configFilesData?.data?.data || []}
        targets={configData?.targets || []}
      />
    </div>
  );
}

