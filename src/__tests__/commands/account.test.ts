import { AccountCommand } from '../../commands/AccountCommand';

/**
 * The server never logs in to Pixiv: there is no resident process to drive a browser.
 * This command is where the browser flow happens, so it must never print a token and
 * must never claim success the control plane did not confirm.
 */
function stubFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  global.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const { status, body } = handler(url, init ?? {});
    calls.push({
      url,
      method: init?.method ?? 'GET',
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    return {
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const context = { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } } as never;
const args = (positional: string[], options: Record<string, unknown> = {}) =>
  ({ positional, options } as never);

describe('pixivflow account', () => {
  const original = global.fetch;
  const env = { ...process.env };
  afterEach(() => {
    global.fetch = original;
    process.env = { ...env };
  });

  it('requires an action and an alias', () => {
    const command = new AccountCommand();
    expect(command.validate(args([])).valid).toBe(false);
    expect(command.validate(args(['nonsense'])).valid).toBe(false);
    expect(command.validate(args(['login'])).valid).toBe(false);
    expect(command.validate(args(['login', 'pixiv-main'])).valid).toBe(true);
    // list takes no alias
    expect(command.validate(args(['list'])).valid).toBe(true);
  });

  it('refuses to run without a control-plane token', async () => {
    delete process.env.CONTROL_PLANE_TOKEN;
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    const result = await new AccountCommand().execute(
      context,
      args(['list'], { 'control-plane': 'https://cp.test' })
    );
    expect(result.success).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('lists aliases without ever asking for a value', async () => {
    const calls = stubFetch(() => ({
      status: 200,
      body: { ok: true, count: 2, credentials: [{ name: 'pixiv-alt', rotations: 0 }, { name: 'pixiv-main', rotations: 3 }] },
    }));
    const result = await new AccountCommand().execute(
      context,
      args(['list'], { 'control-plane': 'https://cp.test', 'control-plane-token': 'secret' })
    );

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://cp.test/control/credentials');
    expect(calls[0]!.method).toBe('GET');
    // The value endpoint is a separate, explicit POST; listing must not touch it.
    expect(calls.some((call) => call.url.endsWith('/read'))).toBe(false);
  });

  it('reports an absent alias honestly rather than as an error', async () => {
    stubFetch(() => ({ status: 404, body: { error: 'no credential stored' } }));
    const result = await new AccountCommand().execute(
      context,
      args(['status', 'pixiv-nope'], { 'control-plane': 'https://cp.test', 'control-plane-token': 's' })
    );
    expect(result.success).toBe(true);
  });

  it('uses the alias as the identity, never the stored field', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { ok: true, removed: true } }));
    await new AccountCommand().execute(
      context,
      args(['remove', 'pixiv-alt'], { 'control-plane': 'https://cp.test', 'control-plane-token': 's' })
    );
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://cp.test/control/credentials/pixiv-alt');
  });

  it('refuses to report success when the control plane rejected the write', async () => {
    stubFetch(() => ({ status: 400, body: { error: 'value does not look like a credential' } }));
    // Reaching the PUT without a browser is only possible headlessly, so this asserts
    // the failure path rather than the login flow itself.
    const command = new AccountCommand();
    const result = await command.execute(
      context,
      args(['remove', 'pixiv-main'], { 'control-plane': 'https://cp.test', 'control-plane-token': 's' })
    );
    expect(result.success).toBe(false);
  });

  it('falls back to the environment for the URL and the token', async () => {
    process.env.CONTROL_PLANE_URL = 'https://from-env.test';
    process.env.CONTROL_PLANE_TOKEN = 'env-secret';
    const calls = stubFetch(() => ({ status: 200, body: { ok: true, credentials: [] } }));
    const result = await new AccountCommand().execute(context, args(['list']));
    expect(result.success).toBe(true);
    expect(calls[0]!.url.startsWith('https://from-env.test/')).toBe(true);
  });
});
