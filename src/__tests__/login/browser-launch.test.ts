/**
 * browser-launch: pins the executablePath precedence of the shared
 * puppeteer-core launcher (explicit override > system discovery) and the
 * actionable failure modes that replaced puppeteer's install-time download.
 */

const mockLaunch = jest.fn();
const mockFindBrowserExecutable = jest.fn();
const mockBrowserNotFoundMessage = jest.fn(() => 'No compatible Chrome/Chromium installation was found.');

jest.mock('puppeteer-core', () => ({
  launch: (...args: unknown[]) => mockLaunch(...args),
}));

jest.mock('pixiv-token-getter', () => ({
  findBrowserExecutable: () => mockFindBrowserExecutable(),
  browserNotFoundMessage: () => mockBrowserNotFoundMessage(),
}));

import { launchSystemBrowser } from '../../puppeteer-login-adapter/browser-launch';

describe('launchSystemBrowser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBrowserNotFoundMessage.mockReturnValue('No compatible Chrome/Chromium installation was found.');
    mockFindBrowserExecutable.mockReturnValue('/usr/bin/google-chrome');
    mockLaunch.mockResolvedValue({ connected: true });
  });

  it('launches the discovered system browser and keeps caller options', async () => {
    const browser = await launchSystemBrowser({ headless: 'new' });

    expect(browser).toEqual({ connected: true });
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/usr/bin/google-chrome', headless: 'new' })
    );
  });

  it('lets an explicit executablePath win over discovery', async () => {
    await launchSystemBrowser({ executablePath: '/opt/custom/chrome' });

    expect(mockFindBrowserExecutable).not.toHaveBeenCalled();
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/opt/custom/chrome' })
    );
  });

  it('does not let an undefined executablePath clobber discovery', async () => {
    await launchSystemBrowser({ executablePath: undefined, headless: false });

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/usr/bin/google-chrome', headless: false })
    );
  });

  it('fails with resolver guidance instead of a raw ENOENT when no browser exists', async () => {
    mockFindBrowserExecutable.mockReturnValue(null);

    await expect(launchSystemBrowser()).rejects.toThrow(
      'No compatible Chrome/Chromium installation was found.'
    );
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('explains how to repair an installation without puppeteer-core', async () => {
    jest.resetModules();
    jest.doMock('puppeteer-core', () => {
      throw new Error("Cannot find module 'puppeteer-core'");
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const isolated = require('../../puppeteer-login-adapter/browser-launch');
    await expect(isolated.launchSystemBrowser()).rejects.toThrow(/puppeteer-core is missing/);
  });
});
