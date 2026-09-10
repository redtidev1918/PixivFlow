import { redactError, redactHeaders, redactUrl } from '../../utils/redact';

describe('redaction', () => {
  it('strips userinfo and query (including token=) from URLs', () => {
    const out = redactUrl('https://user:hunter2@example.test/path?token=abcdef&q=1');
    expect(out).toBe('https://redacted@example.test/path?…');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('abcdef');

    expect(redactUrl('https://example.test/ok')).toBe('https://example.test/ok');
    expect(redactUrl('not a url')).toBe('not a url');
  });

  it('masks credential headers case-insensitively and leaves others', () => {
    const out = redactHeaders({
      Authorization: 'Bearer secrettoken',
      'X-Telegram-Bot-Api-Secret-Token': 'xyz',
      Cookie: 'sid=1',
      'X-Custom-Auth': 'abc',
      'Content-Type': 'application/json',
    });
    expect(out).toEqual({
      Authorization: '***',
      'X-Telegram-Bot-Api-Secret-Token': '***',
      Cookie: '***',
      'X-Custom-Auth': '***',
      'Content-Type': 'application/json',
    });
    expect(JSON.stringify(out)).not.toContain('secrettoken');
  });

  it('masks Bearer tokens and token= assignments in error messages', () => {
    const msg = redactError(new Error('deliver failed: Authorization: Bearer abc.def-ghi token=zzz value=keep'));
    expect(msg).toContain('Bearer ***');
    expect(msg).toContain('token=***');
    expect(msg).toContain('value=keep');
    expect(msg).not.toContain('abc.def-ghi');
    expect(msg).not.toContain('zzz');
  });
});
