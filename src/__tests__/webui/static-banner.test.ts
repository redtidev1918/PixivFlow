import { injectAuthBanner } from '../../webui/server/server-static';

const INDEX =
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>';

describe('injectAuthBanner', () => {
  it('injects a dismissible security notice when an unauthenticated server is network-reachable', () => {
    const out = injectAuthBanner(INDEX, false, true);
    expect(out).toContain('pixivflow-auth-banner');
    expect(out).toContain('WEBUI_USERNAME / WEBUI_PASSWORD');
    expect(out).toContain('WEBUI_ALLOW_PUBLIC_NO_AUTH=true');
  });

  it('leaves the page untouched when basic auth is enabled', () => {
    expect(injectAuthBanner(INDEX, true, true)).toBe(INDEX);
    expect(injectAuthBanner(INDEX, true)).toBe(INDEX);
  });

  it('leaves a loopback-only server untouched: no credentials are needed locally', () => {
    expect(injectAuthBanner(INDEX, false)).toBe(INDEX);
    expect(injectAuthBanner(INDEX, false, false)).toBe(INDEX);
  });

  it('never shifts layout: the notice is an overlay, not a document-flow element', () => {
    const out = injectAuthBanner(INDEX, false, true);
    expect(out).toContain('position:fixed');
    expect(out).not.toContain('position:sticky');
    // It must not sit in the flow before the app root that owns 100vh.
    expect(out.indexOf('pixivflow-auth-banner')).toBeGreaterThan(out.indexOf('<div id="root">'));
  });

  it('does not double-inject an existing banner', () => {
    const once = injectAuthBanner(INDEX, false, true);
    const twice = injectAuthBanner(once, false, true);
    expect(twice.match(/pixivflow-auth-banner/g)).toHaveLength(1);
  });
});
