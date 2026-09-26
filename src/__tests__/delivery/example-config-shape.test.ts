/**
 * The shipped multi-gateway example must stay loadable.
 *
 * An example config that no longer validates is worse than no example: the
 * operator copies it, gets a ConfigError and assumes delivery is broken. This
 * pins the whole chain — loader validation, the unified validator, and the
 * shared route resolver — against the real file on disk.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../config';
import { configValidator } from '../../utils/config-validator-unified';
import { configuredGateways } from '../../delivery/gatewayRoutes';
import { targetDeliveryNames } from '../../delivery/targetRoutes';

const EXAMPLE = 'config/examples/standalone.config.multi-delivery.json';
const FULL_EXAMPLE = 'config/examples/standalone.config.example.json';

describe('multi-delivery example config', () => {
  let dir: string;
  let path: string;
  let fullPath: string;

  /** The examples ship a placeholder refresh token; inject a syntactically
   * valid one so these tests check the DELIVERY shape, not the login state. */
  function withToken(source: string, target: string): void {
    const parsed = JSON.parse(readFileSync(source, 'utf8'));
    parsed.pixiv.refreshToken = '0'.repeat(43);
    writeFileSync(target, JSON.stringify(parsed));
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'example-config-'));
    path = join(dir, 'config.json');
    fullPath = join(dir, 'full.json');
    withToken(EXAMPLE, path);
    withToken(FULL_EXAMPLE, fullPath);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps the delivery block of the full example valid', () => {
    // The shipped full example is a catalogue of options with deliberate
    // placeholders (`limit: null`, `scheduler.maxExecutions: 0`) that the
    // loader rejects on purpose, so validate the PARSED document instead: what
    // matters here is that its `delivery` block satisfies the real validator.
    const raw = JSON.parse(readFileSync(FULL_EXAMPLE, 'utf8'));
    expect(Object.keys(raw.delivery.targets)).toEqual(['telepost-bot1', 'qq-main']);
    const errors = configValidator
      .validate(raw as never)
      .errors.filter((e) => (e.field ?? '').startsWith('delivery.'));
    expect(errors).toEqual([]);
  });

  it('loads and passes the unified validator', () => {
    const config = loadConfig(path);
    expect(configValidator.validate(config).errors).toEqual([]);
  });

  it('resolves every route, marking the unreferenced one disabled', () => {
    const config = loadConfig(path);
    const routes = configuredGateways(config);
    expect(routes.map((r) => r.name)).toEqual(['feishu-main', 'qq-main', 'retired-route', 'telepost-bot1']);
    expect(routes.find((r) => r.name === 'retired-route')!.enabled).toBe(false);
    expect(routes.find((r) => r.name === 'qq-main')!.enabled).toBe(true);
    expect(routes.find((r) => r.name === 'feishu-main')!.type).toBe('webhook');
  });

  it('fans one download target out to the declared routes in order', () => {
    const config = loadConfig(path);
    const fanout = config.targets.find((t) => t.id === 'daily-illust-fanout')!;
    expect(targetDeliveryNames(fanout)).toEqual(['telepost-bot1', 'qq-main', 'feishu-main']);
    const single = config.targets.find((t) => t.id === 'daily-novel-single')!;
    expect(targetDeliveryNames(single)).toEqual(['telepost-bot1']);
  });
});
