/**
 * Read-only delivery-plane projections must not require Pixiv credentials.
 *
 * Reported from the desktop app: the Gateway/Delivery panel showed
 * "读取投递数据失败" (500 + a bare `GATEWAY_LIST_FAILED`) while the operator had
 * not logged in yet. Root cause: both handlers called `loadConfig(getConfigPath())`
 * with validation ON, and `loadConfig` throws a `ConfigError` wrapping a
 * `ConfigValidationError` ("No valid refresh token found") before the handler
 * ever reaches the ledger. The panel was therefore unusable in exactly the
 * state it exists to explain: "is anything configured to be delivered, and did
 * it happen?".
 *
 * These two projections read configuration ROUTES and the durable ledger, both
 * of which are Pixiv-independent. Pinned here:
 *  - they ask for the configuration with validation disabled (`skipValidation`),
 *    so a missing/expired Pixiv token cannot 500 them;
 *  - if the configuration genuinely cannot be read, the answer carries a
 *    localisable `errorCode` and NOT the terminal-only "run pixivflow login"
 *    block.
 */
import { ConfigValidationError } from '../../config/validation';
import { ConfigError } from '../../utils/errors';

const capture = { skipValidation: [] as (boolean | undefined)[], calls: 0 };

jest.mock('../../config', () => ({
  getConfigPath: () => '/tmp/not-logged-in/standalone.config.json',
  loadConfig: (_path?: string, skipValidation?: boolean) => {
    capture.calls += 1;
    capture.skipValidation.push(skipValidation);
    if (skipValidation) {
      return {
        storage: { databasePath: '/tmp/not-logged-in/does-not-matter.db' },
        targets: [],
        delivery: { targets: {} },
      };
    }
    throw new ConfigError(
      'Configuration validation failed in /tmp/not-logged-in/standalone.config.json:\n' +
        '  - pixiv.refreshToken: No valid refresh token found. Please login to authenticate.\n\n' +
        '💡 You need to login first. Run one of the following commands:\n' +
        '   • Interactive login:  pixivflow login',
      new ConfigValidationError('Configuration validation failed', [
        'pixiv.refreshToken: No valid refresh token found. Please login to authenticate.',
        '💡 You need to login first. Run one of the following commands:',
      ])
    );
  },
}));

import { listGateways } from '../../webui/routes/handlers/gateway-handlers';
import { listDeliveries } from '../../webui/routes/handlers/delivery-handlers';
import { buildConfigAwareErrorBody } from '../../webui/utils/config-error';
import { ErrorCode } from '../../webui/utils/error-codes';

function responder() {
  const state: { status: number; payload: any } = { status: 200, payload: null };
  const res: any = {
    json: (v: any) => { state.payload = v; return res; },
    status: (c: number) => { state.status = c; return res; },
  };
  return { state, res };
}

describe('read-only delivery-plane projections without credentials', () => {
  beforeEach(() => {
    capture.skipValidation = [];
    capture.calls = 0;
  });

  it('lists gateways without a valid Pixiv refresh token', async () => {
    const { state, res } = responder();
    await listGateways({} as any, res as any);

    expect(capture.skipValidation).toEqual([true]);
    expect(state.status).toBe(200);
    expect(state.payload.data.gateways).toEqual([]);
    expect(state.payload.data.pairingSupported).toBe(false);
  });

  it('lists the ledger without a valid Pixiv refresh token', async () => {
    const { state, res } = responder();
    await listDeliveries({ query: {} } as any, res as any);

    expect(capture.skipValidation).toEqual([true]);
    expect(state.status).toBe(200);
    expect(state.payload.data.readOnly).toBe(true);
    expect(state.payload.data.deliveries).toEqual([]);
  });

  it('still answers with a localisable code — and no CLI guidance — if config is unreadable', () => {
    // The message block a shell user needs must never reach a browser body.
    const error = new ConfigError(
      'Configuration validation failed in /tmp/x.json:\n' +
        '  - pixiv.refreshToken: No valid refresh token found.\n\n' +
        '💡 You need to login first.',
      new ConfigValidationError('Configuration validation failed', [
        'pixiv.refreshToken: No valid refresh token found.',
        '💡 You need to login first.',
      ])
    );

    const body = buildConfigAwareErrorBody(error, ErrorCode.GATEWAY_LIST_FAILED);
    expect(body.errorCode).toBe(ErrorCode.CONFIG_VALIDATION_PIXIV_REFRESH_TOKEN_REQUIRED);
    expect(body.message).toContain('refreshToken');
    expect(JSON.stringify(body)).not.toContain('💡');
    expect(JSON.stringify(body)).not.toContain('pixivflow login');
  });
});
