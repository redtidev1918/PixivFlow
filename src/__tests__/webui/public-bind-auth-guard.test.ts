import { WebUIServer } from '../../webui/server/server';

describe('WebUI public bind auth guard', () => {
  const saved: Record<string, string | undefined> = {};
  const envKeys = [
    'WEBUI_USERNAME',
    'WEBUI_PASSWORD',
    'WEBUI_ALLOW_PUBLIC_NO_AUTH',
  ];
  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k];
  });
  afterAll(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  beforeEach(() => {
    for (const k of envKeys) delete process.env[k];
  });

  it('refuses a non-loopback bind when auth is disabled', () => {
    expect(() => new WebUIServer({ host: '0.0.0.0' })).toThrow(/WEBUI_USERNAME/);
  });

  it('allows a loopback bind without auth', () => {
    expect(() => new WebUIServer({ host: '127.0.0.1' })).not.toThrow();
  });

  it('allows a non-loopback bind when basic auth is configured', () => {
    process.env.WEBUI_USERNAME = 'admin';
    process.env.WEBUI_PASSWORD = 's3cret';
    expect(() => new WebUIServer({ host: '0.0.0.0' })).not.toThrow();
  });

  it('allows a non-loopback bind only with explicit opt-in', () => {
    process.env.WEBUI_ALLOW_PUBLIC_NO_AUTH = 'true';
    expect(() => new WebUIServer({ host: '0.0.0.0' })).not.toThrow();
  });
});
