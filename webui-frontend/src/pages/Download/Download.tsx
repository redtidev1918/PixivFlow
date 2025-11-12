import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { QUERY_KEYS } from '../../constants';
import { api } from '../../services/api';
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
import {
  useDownloadOperations,
  useDownloadStatistics,
} from './hooks';

const { Title, Paragraph } = Typography;

export default function Download() {
  const { t } = useTranslation();

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

  // Download operations
  const {
    showStartModal,
    setShowStartModal,
    handleStart,
    handleStop,
    handleRunAll,
    handleResume,
    handleDelete,
    handleDeleteAll,
  } = useDownloadOperations(
    startDownloadAsync as any,
    stopDownloadAsync as any,
    resumeDownloadAsync as any,
    deleteIncompleteTaskAsync as any,
    deleteAllIncompleteTasksAsync as any
  );

  // Statistics
  const { taskStats, calculateDuration } = useDownloadStatistics(allTasks);

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
        onStopClick={() => activeTask?.taskId && handleStop(activeTask.taskId)}
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
          onStop={() => activeTask.taskId && handleStop(activeTask.taskId)}
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

