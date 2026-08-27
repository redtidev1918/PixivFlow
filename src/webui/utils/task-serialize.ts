/**
 * Shared serialization helpers for task status payloads.
 *
 * Used by both the REST layer (download handlers) and the realtime layer
 * (websocket download stream) so both channels emit identical shapes.
 */

interface DateIsh {
  startTime: unknown;
  endTime?: unknown;
  logs?: Array<{ timestamp: unknown }>;
}

/**
 * Convert a TaskStatus-like object into a JSON-safe clone:
 * Date instances become ISO strings.
 */
export function serializeTaskStatus<T extends DateIsh>(task: T | null): T | null {
  if (!task) return null;
  return {
    ...task,
    startTime: task.startTime instanceof Date ? task.startTime.toISOString() : task.startTime,
    endTime: task.endTime instanceof Date ? task.endTime.toISOString() : task.endTime,
    logs: task.logs?.map((log) => ({
      ...log,
      timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : log.timestamp,
    })),
  } as unknown as T | null;
}

export interface DownloadStatusSnapshot<T> {
  hasActiveTask: boolean;
  activeTask: T | null;
  allTasks: T[];
}

/**
 * Build the realtime snapshot payload from in-memory tasks only.
 * Historical hydration stays the responsibility of the REST endpoint so the
 * push channel never touches the database.
 */
export function buildInMemorySnapshot(
  activeTask: unknown,
  allTasks: unknown[],
): DownloadStatusSnapshot<unknown> {
  return {
    hasActiveTask: activeTask !== null && activeTask !== undefined,
    activeTask: serializeTaskStatus(activeTask as never),
    allTasks: (allTasks as DateIsh[]).slice(0, 10).map((t) => serializeTaskStatus(t as never)),
  };
}
