/**
 * Liveness-budget configuration (§liveness).
 *
 * The sweep's two budgets are OPS policy, not structure: a bad value must warn
 * and fall back to the safe default (the sweep clamps it), never stop the daemon
 * from starting. The opposite choice — making it fatal — would turn a typo in a
 * timeout into an outage for an otherwise healthy deployment.
 */
import { StandaloneConfig } from '../../config';
import { validateConfig } from '../../config/validation';
import { logger } from '../../logger';

const baseConfig: StandaloneConfig = {
  pixiv: {
    clientId: 'client',
    clientSecret: 'secret',
    deviceToken: 'device',
    refreshToken: 'valid-refresh-token',
    userAgent: 'PixivFlow test',
  },
  storage: {
    databasePath: './data/test.db',
    downloadDirectory: './downloads',
  },
  targets: [],
  delivery: { targets: {} },
};

function warningsOf(run: () => void): string[] {
  const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  try {
    run();
    return warn.mock.calls.flatMap(([, meta]) => {
      const warnings = (meta as { warnings?: unknown } | undefined)?.warnings;
      return Array.isArray(warnings) ? (warnings as string[]) : [];
    });
  } finally {
    warn.mockRestore();
  }
}

describe('schedulerRuntime liveness budgets', () => {
  it('accepts explicit budgets without warning', () => {
    const warnings = warningsOf(() =>
      validateConfig(
        {
          ...baseConfig,
          schedulerRuntime: { queuedTimeoutMs: 45 * 60 * 1000, stallTimeoutMs: 20 * 60 * 1000 },
        },
        'test'
      )
    );
    expect(warnings.filter((w) => w.includes('queuedTimeoutMs') || w.includes('stallTimeoutMs'))).toEqual([]);
  });

  it('warns (but does not throw) on a budget below the one-minute floor', () => {
    let thrown: unknown;
    const warnings = warningsOf(() => {
      try {
        validateConfig({ ...baseConfig, schedulerRuntime: { queuedTimeoutMs: 5 } }, 'test');
      } catch (error) {
        thrown = error;
      }
    });
    expect(thrown).toBeUndefined();
    expect(warnings.some((w) => w.includes('queuedTimeoutMs'))).toBe(true);
  });

  it('warns (but does not throw) on a non-integer budget', () => {
    let thrown: unknown;
    const warnings = warningsOf(() => {
      try {
        validateConfig(
          { ...baseConfig, schedulerRuntime: { stallTimeoutMs: 90_000.5 } },
          'test'
        );
      } catch (error) {
        thrown = error;
      }
    });
    expect(thrown).toBeUndefined();
    expect(warnings.some((w) => w.includes('stallTimeoutMs'))).toBe(true);
  });
});
