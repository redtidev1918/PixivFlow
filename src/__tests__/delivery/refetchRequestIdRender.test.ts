/**
 * Regression: the `refetch_request_id` delivery variable must render into the
 * multipart field, and stay EMPTY for scheduled runs — never the literal
 * `{{refetchRequestId}}` placeholder.
 *
 * Production incident 2026-09-14: `buildTemplateVariables` did not expose the
 * key, so every submission (scheduled AND manual) carried the literal template
 * text in `refetch_request_id`. The receiving service (TelePost) could not
 * correlate any review with its refetch attempt: replacements never linked,
 * attempts stayed admitted and the progress watchdog timed them out.
 */
import { buildTemplateVariables, renderDeliveryTemplate } from '../../delivery/HttpMultipartDelivery';
import { HttpMultipartDelivery } from '../../delivery/HttpMultipartDelivery';

describe('refetchRequestId delivery template variable', () => {
  it('exposes the manual request UUID from the payload context', () => {
    const vars = buildTemplateVariables({
      context: { refetchRequestId: '6eb50329-20f2-4ea7-b95b-e4676b50d9f1' },
    } as never);
    expect(vars.refetchRequestId).toBe('6eb50329-20f2-4ea7-b95b-e4676b50d9f1');
    expect(vars).not.toContain('{{refetchRequestId}}');
  });

  it('renders an EMPTY string for scheduled runs (no manual context)', () => {
    const vars = buildTemplateVariables({ context: {} } as never);
    expect(vars.refetchRequestId).toBe('');
  });

  it('renders into the multipart fields instead of leaving the placeholder', () => {
    // resolveFields() runs exactly this pipeline on the payload context:
    //   variables = buildTemplateVariables(request) → renderDeliveryTemplate()
    // The 2026-09-14 regression shipped the literal placeholder because the
    // variables map lacked the key; this pins the composition.
    const manual = buildTemplateVariables({
      context: { refetchRequestId: '16720a61-59d8-4725-a7e0-662c62ca98ac' },
    } as never);
    expect(renderDeliveryTemplate('{{refetchRequestId}}', manual))
      .toBe('16720a61-59d8-4725-a7e0-662c62ca98ac');

    const scheduled = buildTemplateVariables({ context: {} } as never);
    expect(renderDeliveryTemplate('{{refetchRequestId}}', scheduled)).toBe('');
  });

  it('refuses unresolved refetch provenance before the HTTP request', () => {
    const fields = { refetch_request_id: '{{unknownRequestId}}' };
    const provider = new HttpMultipartDelivery({
      type: 'httpMultipart',
      url: 'https://telepost.example/submit',
      fields,
    });
    expect(() => (provider as any).resolveFields(fields, {
      context: { refetchRequestId: '16720a61-59d8-4725-a7e0-662c62ca98ac' },
    })).toThrow('Unresolved refetch_request_id template');
  });
});
