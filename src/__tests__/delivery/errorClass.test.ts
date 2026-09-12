import { classifyError } from '../../delivery/errorClass';

describe('classifyError', () => {
  it('maps HTTP statuses', () => {
    expect(classifyError(new Error('boom'), 429)).toEqual({ errorClass: 'rate_limited', retryable: true });
    expect(classifyError(new Error('boom'), 503)).toEqual({ errorClass: 'remote_5xx', retryable: true });
    expect(classifyError(new Error('boom'), 500)).toEqual({ errorClass: 'remote_5xx', retryable: true });
    expect(classifyError(new Error('boom'), 400)).toEqual({ errorClass: 'remote_4xx', retryable: false });
    expect(classifyError(new Error('boom'), 422)).toEqual({ errorClass: 'remote_4xx', retryable: false });
    expect(classifyError(new Error('boom'), 409)).toEqual({ errorClass: 'duplicate', retryable: false });
  });

  it('maps timeout / abort / network errors to retryable network_timeout', () => {
    expect(classifyError(new Error('request timeout')).retryable).toBe(true);
    expect(classifyError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toEqual({
      errorClass: 'network_timeout', retryable: true,
    });
    expect(classifyError(new Error('ECONNREFUSED connect failed'))).toEqual({
      errorClass: 'network_timeout', retryable: true,
    });
    expect(classifyError(new Error('fetch failed'))).toEqual({
      errorClass: 'network_timeout', retryable: true,
    });
  });

  it('maps rate-limit / duplicate / invalid / telegram messages without a status', () => {
    expect(classifyError(new Error('HTTP 429 rate limited by endpoint'))).toEqual({
      errorClass: 'rate_limited', retryable: true,
    });
    expect(classifyError(new Error('permanent delivery failure: idempotent replay detected'))).toEqual({
      errorClass: 'duplicate', retryable: false,
    });
    expect(classifyError(new Error('400 bad payload: invalid field'))).toEqual({
      errorClass: 'invalid_payload', retryable: false,
    });
    expect(classifyError(new Error('telegram send failed: chat not found'))).toEqual({
      errorClass: 'telegram_send_failed', retryable: false,
    });
  });

  it('treats a local configuration error as terminal', () => {
    // Production: a notification addressed at a submission target can never be
    // delivered, so retrying only parked the row in retry_wait for hours.
    expect(classifyError(new Error('Delivery target does not configure notificationUrl: bot1-submit'))).toEqual({
      errorClass: 'configuration_error', retryable: false,
    });
    expect(
      classifyError(Object.assign(new Error('missing url'), { name: 'ConfigError' }))
    ).toEqual({ errorClass: 'configuration_error', retryable: false });
  });

  it('defaults unknown errors to retryable internal_error', () => {
    expect(classifyError(new Error('something else'))).toEqual({
      errorClass: 'internal_error', retryable: true,
    });
  });
});
