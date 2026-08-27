import { Server as SocketServer } from 'socket.io';
import { logger } from '../../logger';
import { downloadTaskManager } from '../services/DownloadTaskManager';
import { buildInMemorySnapshot, DownloadStatusSnapshot } from '../utils/task-serialize';

/** Socket.IO event used for download task pushes. */
export const DOWNLOAD_EVENT = 'download';

interface SnapshotPayload {
  kind: 'snapshot';
  status: DownloadStatusSnapshot<unknown>;
  timestamp: string;
}

/**
 * Realtime download task stream.
 *
 * Subscribes once to the task manager's coalesced change notifications and
 * broadcasts a full snapshot (active task + recent in-memory tasks) to every
 * connected client whenever something meaningful happens:
 *
 * - task starts / progress updates / logs append
 * - completion, failure or user stop
 *
 * A slow safety-net interval also re-pushes while clients are connected, so a
 * missed diff can never wedge the UI; hydration of finished history remains
 * the job of GET /api/download/status.
 */
export function setupDownloadStatus(io: SocketServer): void {
  const LOG_TAIL = 40;

  const buildPayload = (): SnapshotPayload => {
    const active = downloadTaskManager.getActiveTask();
    // Cap inline logs so frequent per-file progress cannot balloon frames;
    // full history stays available via GET /api/download/logs.
    let activeCapped = active;
    if (active && Array.isArray(active.logs) && active.logs.length > LOG_TAIL) {
      activeCapped = { ...active, logs: active.logs.slice(-LOG_TAIL) };
    }
    return {
      kind: 'snapshot',
      status: buildInMemorySnapshot(activeCapped, downloadTaskManager.getAllTasks()),
      timestamp: new Date().toISOString(),
    };
  };

  const pushSnapshot = (): void => {
    try {
      io.emit(DOWNLOAD_EVENT, buildPayload());
    } catch (error) {
      logger.error('Failed to broadcast download snapshot', { error });
    }
  };

  // Push on connect so fresh clients render current state instantly.
  io.on('connection', (socket) => {
    socket.emit(DOWNLOAD_EVENT, buildPayload());
  });

  // React to task changes with small debounce handled inside the manager.
  downloadTaskManager.subscribe(pushSnapshot);

  // Safety net: one push per 5s while at least one client is listening.
  setInterval(() => {
    if (io.engine.clientsCount > 0) {
      pushSnapshot();
    }
  }, 5000).unref();
}
