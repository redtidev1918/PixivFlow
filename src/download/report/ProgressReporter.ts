import { logger } from '../../logger';

export interface ProgressEvent {
	total?: number;
	completed: number;
	skipped?: number;
	failed?: number;
	message?: string;
	itemId?: string | number;
	itemType?: 'illustration' | 'novel';
}

export interface ProgressEventsReporter {
	onStart?(total?: number): void;
	onProgress(event: ProgressEvent): void;
	onComplete?(summary: { total?: number; completed: number; skipped: number; failed: number }): void;
}

export class LoggingProgressReporter implements ProgressEventsReporter {
	onStart(total?: number): void {
		if (total !== undefined) {
			logger.info(`Download started, total=${total}`);
		} else {
			logger.info('Download started');
		}
	}

	onProgress(event: ProgressEvent): void {
		const parts: string[] = [];
		if (event.itemType && event.itemId !== undefined) {
			parts.push(`${event.itemType} ${event.itemId}`);
		}
		parts.push(`completed=${event.completed}`);
		if (event.total !== undefined) parts.push(`total=${event.total}`);
		if (event.skipped !== undefined) parts.push(`skipped=${event.skipped}`);
		if (event.failed !== undefined) parts.push(`failed=${event.failed}`);
		if (event.message) parts.push(event.message);
		logger.info(`Progress: ${parts.join(' | ')}`);
	}

	onComplete(summary: { total?: number; completed: number; skipped: number; failed: number }): void {
		const parts: string[] = [
			`completed=${summary.completed}`,
			`skipped=${summary.skipped}`,
			`failed=${summary.failed}`,
		];
		if (summary.total !== undefined) parts.push(`total=${summary.total}`);
		logger.info(`Download completed: ${parts.join(' | ')}`);
	}
}

export type ProgressCallback = (current: number, total: number, message?: string) => void;

/**
 * Lightweight progress reporter decoupled from UI.
 * Provides a stable API for CLI/WebUI to subscribe to progress updates.
 */
export class ProgressReporter {
  private callback?: ProgressCallback;
  private total: number = 0;
  private current: number = 0;
  private lastEmittedCurrent: number | null = null;
  private lastEmittedTotal: number | null = null;
  private lastEmittedMessage: string | undefined;

  setCallback(callback?: ProgressCallback | null): void {
    this.callback = callback ?? undefined;
  }

  start(total: number, message?: string): void {
    this.total = total;
    this.current = 0;
    this.emit(message);
  }

  update(current: number, total?: number, message?: string): void {
    this.current = current;
    if (typeof total === 'number') this.total = total;
    this.emit(message);
  }

  increment(step: number = 1, message?: string): void {
    this.current += step;
    this.emit(message);
  }

  complete(total?: number, message?: string): void {
    if (typeof total === 'number') this.total = total;
    this.current = this.total;
    this.emit(message ?? 'completed');
  }

  private emit(message?: string): void {
    if (!this.callback) {
      return;
    }

    if (
      this.lastEmittedCurrent === this.current &&
      this.lastEmittedTotal === this.total &&
      this.lastEmittedMessage === message
    ) {
      return;
    }

    this.lastEmittedCurrent = this.current;
    this.lastEmittedTotal = this.total;
    this.lastEmittedMessage = message;
    this.callback(this.current, this.total, message);
  }
}


