import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export interface Task {
  status: string;
  startTime?: Date | string;
  endTime?: Date | string;
  [key: string]: any;
}

/**
 * Hook for calculating download statistics and duration
 */
export function useDownloadStatistics(tasks: Task[] | undefined) {
  const { t } = useTranslation();

  // Calculate task statistics
  const taskStats = useMemo(() => {
    const taskList = tasks || [];
    const completed = taskList.filter((task) => task.status === 'completed').length;
    const failed = taskList.filter((task) => task.status === 'failed').length;
    const stopped = taskList.filter((task) => task.status === 'stopped').length;
    return {
      total: taskList.length,
      completed,
      failed,
      stopped,
    };
  }, [tasks]);

  // Calculate task duration helper
  const calculateDuration = useCallback(
    (startTime: Date | string, endTime?: Date | string) => {
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
    },
    [t]
  );

  return {
    taskStats,
    calculateDuration,
  };
}

