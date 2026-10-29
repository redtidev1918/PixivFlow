import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LoginCommand } from '../../commands/LoginCommand';
import { LoginHeadlessCommand } from '../../commands/LoginHeadlessCommand';
import { RefreshCommand } from '../../commands/RefreshCommand';
import { printAuthTokenResponse, safeAuthError } from '../../terminal-login/output';
import { logger } from '../../logger';
import { CommandContext } from '../../commands/types';
import { LoginInfo } from '../../terminal-login/types';

const mockLogin = jest.fn();
const mockRefresh = jest.fn();
jest.mock('../../terminal-login', () => ({
  TerminalLogin: Object.assign(jest.fn().mockImplementation(() => ({ login: mockLogin })), { refresh: mockRefresh }),
}));
jest.mock('../../utils/login-helper', () => ({ updateConfigWithToken: jest.fn().mockResolvedValue(undefined) }));

describe('authentication output never exposes credentials', () => {
  const access = 'audit-access-canary';
  const refresh = 'audit-refresh-canary';
  const raw = 'audit-raw-response-canary';
  const loginInfo = { access_token: access, refresh_token: refresh, expires_in: 3600,
    user: { id: '1', name: 'Reader', account: 'reader' },
    response: { access_token: access, refresh_token: refresh, diagnostic: raw },
  } as unknown as LoginInfo;
  let directory: string;
  let logPath: string;
  let output: string[];
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'auth-output-test-'));
    logPath = join(directory, 'app.log');
    logger.setLogPath(logPath);
    output = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      jest.spyOn(console, method).mockImplementation((...args) => output.push(args.map(String).join(' ')));
    }
    mockLogin.mockResolvedValue(loginInfo);
    mockRefresh.mockResolvedValue(loginInfo);
  });
  afterEach(() => { jest.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });

  for (const json of [false, true]) {
    for (const Command of [LoginCommand, LoginHeadlessCommand, RefreshCommand]) {
      it(`${Command.name} ${json ? 'JSON' : 'text'} keeps tokens out of stdout, result and file logs`, async () => {
        const context = { configPath: join(directory, 'config.json'), config: {}, logger } as CommandContext;
        const result = await new Command().execute(context, {
          options: { json, u: 'reader', p: 'audit-password-canary' }, positional: [refresh],
        });
        expect(result.success).toBe(true);
        const visible = output.join('\n') + JSON.stringify(result) + (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '');
        for (const secret of [access, refresh, raw, 'audit-password-canary']) expect(visible).not.toContain(secret);
        expect(result.data).toMatchObject({ expires_in: 3600 });
      });
    }
    for (const Command of [LoginCommand, LoginHeadlessCommand, RefreshCommand]) {
      it(`${Command.name} ${json ? 'JSON' : 'text'} sanitizes errors before any logging`, async () => {
        const error = Object.assign(new Error(`provider echoed ${refresh}`), {
          response: { status: 401, data: { access_token: access } }, config: { password: raw },
        });
        mockLogin.mockRejectedValue(error);
        mockRefresh.mockRejectedValue(error);
        const context = { configPath: join(directory, 'config.json'), config: {}, logger } as CommandContext;
        const result = await new Command().execute(context, { options: { json, u: 'reader', p: raw }, positional: [refresh] });
        logger.error('Command execution failed', { error: result.error });
        expect(result.success).toBe(false);
        const visible = output.join('\n') + JSON.stringify(result) + readFileSync(logPath, 'utf8');
        for (const secret of [access, refresh, raw]) expect(visible).not.toContain(secret);
        expect(visible).toContain('401');
      });
    }
    it(`legacy printer ${json ? 'JSON' : 'text'} is safe too`, () => {
      printAuthTokenResponse(loginInfo, json);
      for (const secret of [access, refresh, raw]) expect(output.join('\n')).not.toContain(secret);
      expect(output.join('\n')).toContain('3600');
    });
  }
  it('retains a safe status through nested authentication boundaries', () => {
    expect(safeAuthError(safeAuthError({ response: { status: 429 } })).message).toContain('429');
    expect(safeAuthError({ code: 'ETIMEDOUT' }).message).toContain('ETIMEDOUT');
    expect(safeAuthError({ code: refresh }).message).not.toContain(refresh);
  });
});
