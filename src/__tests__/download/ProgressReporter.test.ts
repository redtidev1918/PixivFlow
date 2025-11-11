import { ProgressReporter, LoggingProgressReporter, type ProgressEvent } from '../../download/report/ProgressReporter';

describe('ProgressReporter', () => {
  describe('setCallback', () => {
    it('should set callback when provided', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.update(1, 10);

      expect(callback).toHaveBeenCalled();
    });

    it('should clear callback when set to null', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.setCallback(null);
      reporter.update(1, 10);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should clear callback when set to undefined', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.setCallback(undefined);
      reporter.update(1, 10);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should initialize total and current, then emit', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.start(100, 'Starting download');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(0, 100, 'Starting download');
    });

    it('should reset current to 0 when starting', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(50, 100);
      reporter.start(200, 'Restart');

      expect(callback).toHaveBeenCalledWith(0, 200, 'Restart');
    });

    it('should not emit when callback is not set', () => {
      const reporter = new ProgressReporter();
      reporter.start(100, 'Starting');

      // No callback set, so no error should occur
      expect(true).toBe(true);
    });
  });

  describe('update', () => {
    it('invokes callback on update', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();

      reporter.setCallback(callback);
      reporter.update(1, 10, 'starting');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(1, 10, 'starting');
    });

    it('should update total when provided', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(5, 10);
      reporter.update(7, 20);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(2, 7, 20, undefined);
    });

    it('should not update total when not provided', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.start(100);
      reporter.update(50);
      reporter.update(75);

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(2, 50, 100, undefined);
      expect(callback).toHaveBeenNthCalledWith(3, 75, 100, undefined);
    });

    it('deduplicates identical progress updates', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(2, 10, 'in-progress');
      reporter.update(2, 10, 'in-progress');
      reporter.update(3, 10, 'in-progress');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, 2, 10, 'in-progress');
      expect(callback).toHaveBeenNthCalledWith(2, 3, 10, 'in-progress');
    });

    it('should deduplicate when only current changes', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(5, 10, 'message');
      reporter.update(5, 10, 'message'); // Same values
      reporter.update(6, 10, 'message'); // Different current

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate when only total changes', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(5, 10, 'message');
      reporter.update(5, 11, 'message'); // Different total

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate when only message changes', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(5, 10, 'message1');
      reporter.update(5, 10, 'message2'); // Different message

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should not emit when callback is not set', () => {
      const reporter = new ProgressReporter();
      reporter.update(1, 10);

      // No callback set, so no error should occur
      expect(true).toBe(true);
    });
  });

  describe('increment', () => {
    it('should increment current by 1 by default', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.start(100);

      reporter.increment();

      expect(callback).toHaveBeenCalledTimes(2); // Once for start, once for increment
      expect(callback).toHaveBeenNthCalledWith(2, 1, 100, undefined);
    });

    it('should increment current by specified step', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.start(100);

      reporter.increment(5);

      expect(callback).toHaveBeenCalledWith(5, 100, undefined);
    });

    it('should emit message when provided', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.start(100);

      reporter.increment(3, 'Processing item');

      expect(callback).toHaveBeenCalledWith(3, 100, 'Processing item');
    });

    it('should accumulate increments', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.start(100);

      reporter.increment(2);
      reporter.increment(3);
      reporter.increment(5);

      expect(callback).toHaveBeenNthCalledWith(2, 2, 100, undefined);
      expect(callback).toHaveBeenNthCalledWith(3, 5, 100, undefined);
      expect(callback).toHaveBeenNthCalledWith(4, 10, 100, undefined);
    });

    it('should not emit when callback is not set', () => {
      const reporter = new ProgressReporter();
      reporter.increment();

      // No callback set, so no error should occur
      expect(true).toBe(true);
    });
  });

  describe('complete', () => {
    it('handles complete with default message', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.complete(5);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(5, 5, 'completed');
    });

    it('should set current to total when completing', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.start(100);

      reporter.complete();

      expect(callback).toHaveBeenCalledWith(100, 100, 'completed');
    });

    it('should update total when provided', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);
      reporter.start(50);

      reporter.complete(100, 'Finished');

      expect(callback).toHaveBeenCalledWith(100, 100, 'Finished');
    });

    it('should use custom message when provided', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.complete(10, 'All done!');

      expect(callback).toHaveBeenCalledWith(10, 10, 'All done!');
    });

    it('should not emit when callback is not set', () => {
      const reporter = new ProgressReporter();
      reporter.complete(10);

      // No callback set, so no error should occur
      expect(true).toBe(true);
    });
  });

  describe('can clear the callback', () => {
    it('should stop calling callback after clearing', () => {
      const reporter = new ProgressReporter();
      const callback = jest.fn();
      reporter.setCallback(callback);

      reporter.update(1, 1, 'initial');
      reporter.setCallback(null);
      reporter.update(2, 2, 'should not fire');

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});

describe('LoggingProgressReporter', () => {
  let loggerSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerSpy = jest.spyOn(require('../../logger').logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  describe('onStart', () => {
    it('should log when total is provided', () => {
      const reporter = new LoggingProgressReporter();
      reporter.onStart?.(100);

      expect(loggerSpy).toHaveBeenCalledWith('Download started, total=100');
    });

    it('should log when total is not provided', () => {
      const reporter = new LoggingProgressReporter();
      reporter.onStart?.();

      expect(loggerSpy).toHaveBeenCalledWith('Download started');
    });
  });

  describe('onProgress', () => {
    it('should log progress with all fields', () => {
      const reporter = new LoggingProgressReporter();
      const event: ProgressEvent = {
        completed: 5,
        total: 10,
        skipped: 2,
        failed: 1,
        message: 'Processing',
        itemId: 123,
        itemType: 'illustration',
      };
      reporter.onProgress(event);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('illustration 123')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('completed=5')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('total=10')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('skipped=2')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed=1')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing')
      );
    });

    it('should log progress with minimal fields', () => {
      const reporter = new LoggingProgressReporter();
      const event: ProgressEvent = {
        completed: 3,
      };
      reporter.onProgress(event);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('completed=3')
      );
    });

    it('should log progress with novel type', () => {
      const reporter = new LoggingProgressReporter();
      const event: ProgressEvent = {
        completed: 1,
        itemId: 456,
        itemType: 'novel',
      };
      reporter.onProgress(event);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('novel 456')
      );
    });
  });

  describe('onComplete', () => {
    it('should log completion with all fields', () => {
      const reporter = new LoggingProgressReporter();
      reporter.onComplete?.({
        total: 10,
        completed: 8,
        skipped: 1,
        failed: 1,
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('completed=8')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('skipped=1')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed=1')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('total=10')
      );
    });

    it('should log completion without total', () => {
      const reporter = new LoggingProgressReporter();
      reporter.onComplete?.({
        completed: 5,
        skipped: 0,
        failed: 0,
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('completed=5')
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.not.stringContaining('total=')
      );
    });
  });
});






