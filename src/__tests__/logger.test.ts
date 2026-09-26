import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { logger } from '../logger';
import { ConfigError, DownloadError, NetworkError } from '../utils/errors';

/**
 * A structured log line used to say `"error":{}` because `JSON.stringify`
 * skips an `Error`'s non-enumerable `message`/`stack`. That is the shape the
 * deploy repo recorded as a Failure Contract violation: `pixivflow reconcile`
 * failed and the log could not say why.
 */
describe('logger serialisation of errors', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    logger.setFormat('text');
  });

  it('expands an Error into name/message/stack in a JSON line', () => {
    logger.setFormat('json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Command execution failed', {
      command: 'reconcile',
      stage: 'command.execute',
      error: new Error('Usage: reconcile --target <name>'),
    });

    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line) as Record<string, any>;
    expect(parsed.command).toBe('reconcile');
    expect(parsed.stage).toBe('command.execute');
    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('Usage: reconcile --target <name>');
    expect(typeof parsed.error.stack).toBe('string');
  });

  it('keeps a nested cause reachable', () => {
    logger.setFormat('json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('deploy failed', {
      error: new Error('outer', { cause: new Error('inner: connection refused') }),
    });

    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, any>;
    expect(parsed.error.cause.message).toBe('inner: connection refused');
  });

  it('keeps the reason in the human-readable format too', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Command execution failed', { error: new Error('Usage: reconcile --target <name>') });

    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain('Command execution failed');
    expect(line).toContain('Usage: reconcile --target <name>');
    expect(line).not.toContain('"error":{}');
  });

  /**
   * `PixivFlowError` subclasses carry the machine-readable contract in their own
   * enumerable fields. The deploy repo's Failure Contract (§25) tells an operator
   * to read `code`/`stage`/`reason`/`retryable`, so a line that kept only
   * `name`/`message`/`stack` was still hiding the failing stage's identity.
   */
  it('keeps the code a structured failure must be greppable for', () => {
    logger.setFormat('json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Command execution failed', { error: new ConfigError('invalid rankingDate') });

    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, any>;
    expect(parsed.error.name).toBe('ConfigError');
    expect(parsed.error.code).toBe('CONFIG_ERROR');
    expect(parsed.error.statusCode).toBe(400);
    expect(parsed.error.message).toBe('invalid rankingDate');
  });

  it('keeps the subclass fields that decide a retry (rate limit, url, wait)', () => {
    logger.setFormat('json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('download failed', {
      error: new NetworkError('429 Too Many Requests', 'https://www.pixiv.net/ajax/illust/1', undefined, {
        isRateLimit: true,
        waitTime: 30_000,
      }),
    });

    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, any>;
    expect(parsed.error.code).toBe('NETWORK_ERROR');
    expect(parsed.error.url).toBe('https://www.pixiv.net/ajax/illust/1');
    expect(parsed.error.isRateLimit).toBe(true);
    expect(parsed.error.waitTime).toBe(30_000);
  });

  it('keeps the item an item-scoped failure names', () => {
    logger.setFormat('json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Download failed', { error: new DownloadError('no pages', 12345, 'illustration') });

    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, any>;
    expect(parsed.error.itemId).toBe(12345);
    expect(parsed.error.itemType).toBe('illustration');
  });

  it('keeps the code in the human-readable format too', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Command execution failed', { error: new ConfigError('invalid rankingDate') });

    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain('CONFIG_ERROR');
    expect(line).toContain('invalid rankingDate');
  });
});
