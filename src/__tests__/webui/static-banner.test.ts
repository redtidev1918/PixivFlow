import { injectAuthBanner } from '../../webui/server/server-static';

const INDEX =
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>';

describe('injectAuthBanner', () => {
  it('injects a dismissible security notice when basic auth is disabled', () => {
    const out = injectAuthBanner(INDEX, false);
    expect(out).toContain('pixivflow-auth-banner');
    expect(out).toContain('WEBUI_USERNAME / WEBUI_PASSWORD');
    expect(out).toContain('首次本地使用无需设置');
  });

  it('leaves the page untouched when basic auth is enabled', () => {
    expect(injectAuthBanner(INDEX, true)).toBe(INDEX);
  });

  it('does not double-inject an existing banner', () => {
    const once = injectAuthBanner(INDEX, false);
    const twice = injectAuthBanner(once, false);
    expect(twice.match(/pixivflow-auth-banner/g)).toHaveLength(1);
  });
});
