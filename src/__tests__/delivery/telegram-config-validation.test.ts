/**
 * A `telegram` delivery target is validated by two independent validators:
 * `validateConfig` (the loader's) and `ConfigValidator` (src/utils/config-validator-unified).
 * They duplicate the httpMultipart rules by design, which is exactly how a new
 * required field ends up enforced in one and silently accepted in the other.
 * These tests pin both to the same shared rules.
 */
import { StandaloneConfig, DeliveryTargetConfig } from '../../config/types';
import { validateConfig } from '../../config/validation';
import { configValidator } from '../../utils/config-validator-unified';

const validTelegramTarget: DeliveryTargetConfig = {
  type: 'telegram',
  botId: 'bot1',
  botToken: '${TELEGRAM_BOT1_TOKEN}',
  chatId: '-1001234567890',
  publishChatId: '@xgdShare',
  controlPlaneUrl: '${CONTROL_PLANE_URL}/control',
  controlPlaneToken: '${CONTROL_PLANE_CALLBACK_SECRET}',
  caption: '{{title}}',
};

function buildConfig(target: DeliveryTargetConfig): Partial<StandaloneConfig> {
  return {
    pixiv: {
      clientId: 'id',
      clientSecret: 'secret',
      deviceToken: 'device',
      refreshToken: 'refresh',
      userAgent: 'PixivAndroidApp/5.0.234',
    },
    delivery: { targets: { 'bot1-review': target } },
  };
}

/** Delivery-target errors only: the fixture is deliberately incomplete elsewhere. */
function loaderErrors(target: DeliveryTargetConfig): string[] {
  try {
    validateConfig(buildConfig(target), 'test');
    return [];
  } catch (error) {
    // validateConfig throws a ConfigError whose message carries the raw error list.
    const message = error instanceof Error ? error.message : String(error);
    return message
      .split('\n')
      .filter((line) => line.includes('delivery.targets.'))
      .map((line) => line.trim().replace(/^-\s*/, ''));
  }
}

function unifiedErrors(target: DeliveryTargetConfig): string[] {
  return configValidator
    .validate(buildConfig(target))
    .errors.filter((error) => (error.field ?? '').includes('delivery.targets.'))
    .map((error) => `${error.field ?? ''} ${error.message ?? ''}`);
}

describe('telegram delivery target validation', () => {
  it('accepts a complete target in both validators', () => {
    expect(loaderErrors(validTelegramTarget)).toEqual([]);
    expect(unifiedErrors(validTelegramTarget)).toEqual([]);
  });

  it('does not report a supported type as unsupported', () => {
    expect(loaderErrors(validTelegramTarget).join()).not.toContain('Unsupported delivery type');
    expect(unifiedErrors(validTelegramTarget).join()).not.toContain('Unsupported type');
  });

  it.each([
    ['botId', { botId: '' }],
    ['botToken', { botToken: '' }],
    ['chatId', { chatId: '  ' }],
    ['publishChatId', { publishChatId: '' }],
    ['controlPlaneToken', { controlPlaneToken: '' }],
    ['controlPlaneUrl', { controlPlaneUrl: '' }],
  ])('rejects a missing %s in both validators', (field, patch) => {
    const target = { ...validTelegramTarget, ...patch } as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain(`delivery.targets.bot1-review.${field}`);
    expect(unifiedErrors(target).join()).toContain(`delivery.targets.bot1-review.${field}`);
  });

  it('rejects a literal botToken that is not a Bot API token', () => {
    const target = { ...validTelegramTarget, botToken: 'not-a-token' } as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('botToken');
    expect(unifiedErrors(target).join()).toContain('botToken');
  });

  it('accepts a literal Bot API token', () => {
    const target = {
      ...validTelegramTarget,
      botToken: '1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    } as DeliveryTargetConfig;
    expect(loaderErrors(target)).toEqual([]);
    expect(unifiedErrors(target)).toEqual([]);
  });

  it('rejects a non-http controlPlaneUrl', () => {
    const target = { ...validTelegramTarget, controlPlaneUrl: 'ftp://x/control' } as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('controlPlaneUrl');
    expect(unifiedErrors(target).join()).toContain('controlPlaneUrl');
  });

  it('rejects a non-integer publishThreadId', () => {
    const target = { ...validTelegramTarget, publishThreadId: 1.5 } as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('publishThreadId');
    expect(unifiedErrors(target).join()).toContain('publishThreadId');
  });

  it('still rejects an unknown delivery type', () => {
    const target = { type: 'carrier-pigeon' } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('Unsupported delivery type');
    expect(unifiedErrors(target).join()).toContain('Unsupported type');
  });
});
