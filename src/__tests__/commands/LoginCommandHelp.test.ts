/**
 * Login help contract.
 *
 * The interactive login path prefers the browser-based adapters, so the help
 * text must not claim Python gppt is the method. Python remains a documented
 * fallback, and the token-leak warning stays in place.
 */
import { LoginCommand } from '../../commands/LoginCommand';
import { HelpCommand } from '../../commands/HelpCommand';
import { CommandContext, CommandArgs } from '../../commands/types';
import { StandaloneConfig } from '../../config';
import { logger } from '../../logger';

describe('login command help', () => {
  const login = new LoginCommand();

  it('describes the browser-based interactive login instead of Python gppt', () => {
    expect(login.description).toMatch(/browser/i);
    expect(login.description).not.toMatch(/gppt/i);
  });

  it('documents the adapter order and keeps Python as a fallback only', () => {
    const usage = login.getUsage();

    expect(usage).toMatch(/pixiv-token-getter/);
    expect(usage).toMatch(/Puppeteer/);
    expect(usage).toMatch(/fallback only/i);
    // Order matters: the browser adapters precede the Python fallback.
    expect(usage.indexOf('pixiv-token-getter')).toBeLessThan(usage.indexOf('Python gppt'));
    expect(usage.indexOf('Puppeteer')).toBeLessThan(usage.indexOf('Python gppt'));
    expect(usage).toMatch(/Chrome\/Chromium/);
  });

  it('keeps the credential-leak warning', () => {
    const usage = login.getUsage();
    expect(usage).toMatch(/plain text/i);
    expect(usage).toMatch(/Never share/i);
  });

  it('documents the configuration priority', () => {
    const usage = login.getUsage();
    expect(usage).toMatch(/PIXIV_DOWNLOADER_CONFIG/);
    expect(usage).toMatch(/--config/);
  });

  it('advertises the headless mode as credential based', () => {
    const usage = login.getUsage();
    expect(usage).toMatch(/-u, --username/);
    expect(usage).toMatch(/-p, --password/);
    expect(usage).toMatch(/Headless mode/i);
  });

  it('documents the browser-first login in the general help too', () => {
    const command = new HelpCommand();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const context: CommandContext = {
      config: {} as StandaloneConfig,
      logger,
      configPath: '/test/config.json',
    };
    const args: CommandArgs = { options: {}, positional: [] };

    command.execute(context, args);

    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    consoleLogSpy.mockRestore();

    expect(output).not.toMatch(/Login requires Python/);
    expect(output).toMatch(/Chrome\/Chromium/);
    expect(output).toMatch(/PIXIV_DOWNLOADER_CONFIG/);
  });
});
