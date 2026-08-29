import { StandaloneConfig } from '../../config';
import { validateConfig } from '../../config/validation';

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
  delivery: {
    targets: {},
  },
};

describe('delivery outbox retry configuration', () => {
  it('accepts a bounded retry range', () => {
    expect(() => validateConfig({
      ...baseConfig,
      delivery: {
        targets: {},
        outboxRetryBaseMs: 300_000,
        outboxRetryMaxMs: 21_600_000,
      },
    }, 'test')).not.toThrow();
  });

  it('rejects a maximum below the base delay', () => {
    expect(() => validateConfig({
      ...baseConfig,
      delivery: {
        targets: {},
        outboxRetryBaseMs: 60_000,
        outboxRetryMaxMs: 1_000,
      },
    }, 'test')).toThrow(/outboxRetryMaxMs/);
  });
});
