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
import { logger } from '../../logger';

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

/**
 * Capability declarations are platform limits as data. Both validators must
 * reject a malformed override identically, otherwise one of them would accept a
 * config that silently disables a platform bound.
 */
describe('delivery target capability validation', () => {
  it('accepts a well-formed capability declaration in both validators', () => {
    const target = {
      ...validTelegramTarget,
      capabilities: { text: true, maxCaptionLength: 512, albumMin: 2, albumMax: 4 },
    } as DeliveryTargetConfig;
    expect(loaderErrors(target)).toEqual([]);
    expect(unifiedErrors(target)).toEqual([]);
  });

  it('rejects a non-boolean capability flag', () => {
    const target = {
      ...validTelegramTarget,
      capabilities: { image: 'yes' },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('capabilities.image');
    expect(loaderErrors(target).join()).toContain('Must be a boolean');
    expect(unifiedErrors(target).join()).toContain('capabilities.image');
  });

  it('rejects a negative limit and a non-integer limit', () => {
    const negative = {
      ...validTelegramTarget,
      capabilities: { maxUploadBytes: -5 },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(negative).join()).toContain('capabilities.maxUploadBytes');
    expect(unifiedErrors(negative).join()).toContain('capabilities.maxUploadBytes');

    const fractional = {
      ...validTelegramTarget,
      capabilities: { maxAttachmentsPerMessage: 2.5 },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(fractional).join()).toContain('capabilities.maxAttachmentsPerMessage');
    expect(unifiedErrors(fractional).join()).toContain('capabilities.maxAttachmentsPerMessage');
  });

  it('rejects albumMin greater than albumMax in both validators', () => {
    const target = {
      ...validTelegramTarget,
      capabilities: { albumMin: 9, albumMax: 2 },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('capabilities.albumMin');
    expect(unifiedErrors(target).join()).toContain('capabilities.albumMin');
  });

  it('rejects a non-object capability declaration', () => {
    const target = {
      ...validTelegramTarget,
      capabilities: ['image'],
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('capabilities');
    expect(unifiedErrors(target).join()).toContain('capabilities');
  });

  it('accepts and rejects the lifecycle declarations in both validators', () => {
    const accepted = {
      ...validTelegramTarget,
      capabilities: { truncatePolicy: 'split', idempotencyMechanism: 'platform_key', minSendIntervalMs: 500 },
    } as DeliveryTargetConfig;
    expect(loaderErrors(accepted)).toEqual([]);
    expect(unifiedErrors(accepted)).toEqual([]);

    const badPolicy = {
      ...validTelegramTarget,
      capabilities: { truncatePolicy: 'clip' },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(badPolicy).join()).toContain('capabilities.truncatePolicy');
    expect(unifiedErrors(badPolicy).join()).toContain('capabilities.truncatePolicy');

    const badMechanism = {
      ...validTelegramTarget,
      capabilities: { idempotencyMechanism: 'telepathy' },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(badMechanism).join()).toContain('capabilities.idempotencyMechanism');
    expect(unifiedErrors(badMechanism).join()).toContain('capabilities.idempotencyMechanism');

    const badInterval = {
      ...validTelegramTarget,
      capabilities: { minSendIntervalMs: -1 },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(badInterval).join()).toContain('capabilities.minSendIntervalMs');
    expect(unifiedErrors(badInterval).join()).toContain('capabilities.minSendIntervalMs');
  });
});

/**
 * The generic gateway `webhook` type is validated by the same two independent
 * validators. Its only required contract is the endpoint URL, so both must
 * reject a missing or non-http(s) one and neither may call the type unsupported.
 */
describe('webhook delivery target validation', () => {
  const validWebhookTarget: DeliveryTargetConfig = {
    type: 'webhook',
    url: 'https://gateway.test/hook',
    token: '${GATEWAY_TOKEN}',
    signingSecret: '${GATEWAY_SIGNING_SECRET}',
    mediaTransport: 'reference',
  };

  it('accepts a complete target in both validators', () => {
    expect(loaderErrors(validWebhookTarget)).toEqual([]);
    expect(unifiedErrors(validWebhookTarget)).toEqual([]);
  });

  it('does not report the webhook type as unsupported', () => {
    expect(loaderErrors(validWebhookTarget).join()).not.toContain('Unsupported delivery type');
    expect(unifiedErrors(validWebhookTarget).join()).not.toContain('Unsupported type');
  });

  it('accepts a URL that is only known at load time', () => {
    const templated = { ...validWebhookTarget, url: '${GATEWAY_URL}' } as DeliveryTargetConfig;
    expect(loaderErrors(templated)).toEqual([]);
    expect(unifiedErrors(templated)).toEqual([]);
  });

  it('rejects a missing url in both validators', () => {
    const target = { ...validWebhookTarget, url: '  ' } as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('delivery.targets.bot1-review.url');
    expect(unifiedErrors(target).join()).toContain('delivery.targets.bot1-review.url');
  });

  it('rejects a non-http(s) url in both validators', () => {
    const target = { ...validWebhookTarget, url: 'ftp://gateway.test/hook' } as DeliveryTargetConfig;
    expect(loaderErrors(target).join()).toContain('delivery.targets.bot1-review.url');
    expect(unifiedErrors(target).join()).toContain('delivery.targets.bot1-review.url');
  });

  it('rejects malformed inline and timeout limits in both validators', () => {
    const badInline = { ...validWebhookTarget, maxInlineBytes: -1 } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(badInline).join()).toContain('maxInlineBytes');
    expect(unifiedErrors(badInline).join()).toContain('maxInlineBytes');

    const badTimeout = { ...validWebhookTarget, timeoutMs: 0 } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(badTimeout).join()).toContain('timeoutMs');
    expect(unifiedErrors(badTimeout).join()).toContain('timeoutMs');
  });

  it('reports a capability key that is not a capability, in both validators', () => {
    // `supportsAlbum` is the misspelling this exists for: it used to be accepted
    // and ignored, so the config looked like it enabled albums while the real
    // `album` bound stayed at its default.
    const misspelled = {
      ...validTelegramTarget,
      capabilities: { supportsAlbum: true },
    } as unknown as DeliveryTargetConfig;

    // 1. The loader's validator: a warning, never an error (a wrong key cannot
    //    weaken a bound), surfaced through the log.
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      expect(loaderErrors(misspelled)).toEqual([]);
      const logged = warn.mock.calls
        .flatMap(([, meta]) => (meta as { warnings?: string[] } | undefined)?.warnings ?? [])
        .join('\n');
      expect(logged).toContain('delivery.targets.bot1-review.capabilities.supportsAlbum');
      expect(logged).toContain('Did you mean "album"?');
    } finally {
      warn.mockRestore();
    }

    // 2. The unified validator: the same warning, in its own structured shape.
    const warnings = configValidator
      .validate(buildConfig(misspelled))
      .warnings.filter((warning) => (warning.field ?? '').includes('delivery.targets.'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('CONFIG_VALIDATION_DELIVERY_CAPABILITY_UNKNOWN');
    expect(warnings[0].field).toBe('delivery.targets.bot1-review.capabilities.supportsAlbum');
    expect(warnings[0].message).toContain('Did you mean "album"?');

    // A correctly spelled declaration warns in neither validator.
    const correct = {
      ...validTelegramTarget,
      capabilities: { album: true, albumMin: 2, albumMax: 9 },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(correct)).toEqual([]);
    expect(
      configValidator
        .validate(buildConfig(correct))
        .warnings.filter((warning) => (warning.field ?? '').includes('capabilities'))
    ).toEqual([]);
  });

  it('still validates capability declarations on a webhook target', () => {
    const badPolicy = {
      ...validWebhookTarget,
      capabilities: { truncatePolicy: 'clip' },
    } as unknown as DeliveryTargetConfig;
    expect(loaderErrors(badPolicy).join()).toContain('capabilities.truncatePolicy');
    expect(unifiedErrors(badPolicy).join()).toContain('capabilities.truncatePolicy');
  });
});
