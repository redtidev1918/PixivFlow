import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { logger } from '../logger';

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
});
