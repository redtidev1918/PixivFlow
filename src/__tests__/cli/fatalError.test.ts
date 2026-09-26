import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { handleFatalError } from '../../cli/fatalError';
import { logger } from '../../logger';
import { AuthenticationError, ConfigError } from '../../utils/errors';

/**
 * A startup failure is the most operator-visible failure there is: the process
 * exits before any command runs. It must print a human reason *and* log the
 * error with its contract fields (`code`, `statusCode`) — `{error.message}`
 * alone is the same defect class as a line rendered as `"error":{}`.
 */
describe('handleFatalError — a startup failure stays readable and greppable', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    logger.setFormat('text');
  });

  function capture() {
    const exit = jest.fn((_code: number) => undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    return { exit, err };
  }

  it('prints the configuration message and logs the code and status', () => {
    logger.setFormat('json');
    const { exit, err } = capture();

    handleFatalError(new ConfigError('target "bot1-submit" has an invalid rankingDate'), exit);

    expect(exit).toHaveBeenCalledWith(1);
    const printed = err.mock.calls.map(call => String(call[0])).join('\n');
    expect(printed).toContain('Configuration Error: target "bot1-submit" has an invalid rankingDate');

    const structured = err.mock.calls
      .map(call => String(call[0]))
      .find(line => line.startsWith('{')) as string;
    const parsed = JSON.parse(structured) as Record<string, any>;
    expect(parsed.stage).toBe('application.startup');
    expect(parsed.error.name).toBe('ConfigError');
    expect(parsed.error.code).toBe('CONFIG_ERROR');
    expect(parsed.error.statusCode).toBe(400);
  });

  it('keeps the authentication guidance and the AUTH_ERROR code', () => {
    logger.setFormat('json');
    const { exit, err } = capture();

    handleFatalError(new AuthenticationError('refresh token rejected'), exit);

    const printed = err.mock.calls.map(call => String(call[0])).join('\n');
    expect(printed).toContain('Authentication Error');
    expect(printed).toContain('pixivflow login');

    const structured = err.mock.calls
      .map(call => String(call[0]))
      .find(line => line.startsWith('{')) as string;
    const parsed = JSON.parse(structured) as Record<string, any>;
    expect(parsed.error.code).toBe('AUTH_ERROR');
    expect(parsed.error.message).toBe('refresh token rejected');
  });

  it('logs an unrecognised failure as an error object and still tells the operator', () => {
    const { exit, err } = capture();

    handleFatalError(new Error('disk exploded'), exit);

    const printed = err.mock.calls.map(call => String(call[0])).join('\n');
    expect(printed).toContain('❌ disk exploded');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('never logs the bare string form of a thrown error', () => {
    logger.setFormat('json');
    const { exit, err } = capture();

    handleFatalError(new Error('boom'), exit);

    const printed = err.mock.calls.map(call => String(call[0])).join('\n');
    expect(printed).toContain('"message":"boom"');
    expect(printed).not.toContain('"error":"');
  });
});
