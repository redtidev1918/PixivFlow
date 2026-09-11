/**
 * Shared launcher for the login adapters.
 *
 * Uses puppeteer-core (NO install-time browser download) plus the system
 * browser resolver exported by pixiv-token-getter — single implementation of
 * discovery lives there:
 *
 *   explicit PUPPETEER_EXECUTABLE_PATH -> platform-known locations -> PATH
 *
 * When no browser exists the error tells the user exactly how to fix it
 * instead of leaking a raw ENOENT from puppeteer.
 */

import type { Browser } from 'puppeteer-core';
import { findBrowserExecutable, browserNotFoundMessage } from 'pixiv-token-getter';

/** Lazily resolved puppeteer-core module (never a hard CLI-boot dependency). */
function loadPuppeteerCore(): typeof import('puppeteer-core') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('puppeteer-core');
  } catch (error: any) {
    throw new Error(
      'puppeteer-core is missing from this installation. ' +
        'Reinstall pixivflow (npm install -g pixivflow). ' +
        `Original error: ${error?.message ?? error}`
    );
  }
}

/**
 * Launch the system browser with PixivFlow's standard hardening flags.
 *
 * @param overrides any puppeteer-core launch options to merge (headless, args,
 *   userDataDir, proxy is handled by callers through `args`)
 */
export async function launchSystemBrowser(overrides: Record<string, unknown> = {}): Promise<Browser> {
  // An explicit path always wins; `undefined` must NOT clobber discovery, so the
  // key is pulled out before the spread instead of relying on merge order.
  const { executablePath: explicitPath, ...rest } = overrides;
  const executablePath =
    (typeof explicitPath === 'string' && explicitPath) || findBrowserExecutable();

  if (!executablePath) {
    throw new Error(browserNotFoundMessage());
  }

  const core = loadPuppeteerCore();
  return core.launch({ ...rest, executablePath } as any);
}
