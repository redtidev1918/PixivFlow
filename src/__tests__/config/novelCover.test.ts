/**
 * download.novelCover validation (§novel-cover).
 *
 * The key is a policy switch, so a typo cannot be silently ignored: an
 * unknown value would otherwise fall through to the production-safe default
 * while the operator believes the opposite policy is in force.
 */
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
  delivery: { targets: {} },
};

function withNovelCover(novelCover: { unknown?: string; probeFailed?: string }): StandaloneConfig {
  return { ...baseConfig, download: { novelCover } } as StandaloneConfig;
}

describe('download.novelCover validation', () => {
  it('accepts both documented values for unknown and probeFailed', () => {
    expect(() => validateConfig(withNovelCover({ unknown: 'skip', probeFailed: 'skip' }), 'test')).not.toThrow();
    expect(() => validateConfig(withNovelCover({ unknown: 'keep', probeFailed: 'keep' }), 'test')).not.toThrow();
  });

  it('accepts an absent novelCover block (policy defaults apply)', () => {
    expect(() => validateConfig({ ...baseConfig, download: {} }, 'test')).not.toThrow();
  });

  it('rejects an invalid probeFailed value', () => {
    expect(() => validateConfig(withNovelCover({ probeFailed: 'yes' }), 'test')).toThrow(
      'download.novelCover.probeFailed: Must be "skip" or "keep" (got yes)'
    );
  });

  it('rejects an invalid unknown value', () => {
    expect(() => validateConfig(withNovelCover({ unknown: 'maybe' }), 'test')).toThrow(
      'download.novelCover.unknown: Must be "skip" or "keep" (got maybe)'
    );
  });
});
