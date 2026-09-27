/**
 * The `refetch_request_id` wire contract.
 *
 * The receiving service (TelePost) accepts ONLY a canonical dashed lowercase
 * UUID and answers HTTP 400 `invalid_refetch_provenance` otherwise — a
 * permanent delivery failure. Production incident 2026-09-27: a manual refetch
 * carried the bare 32-hex key `1e22b55cb33e47289f30c62e8ee1e11f` (a v4 UUID with
 * its dashes stripped) and the run ended in
 * `permanent delivery failure: delivery endpoint HTTP 400`.
 *
 * These tests pin the two halves of the cure: any recognizable UUID spelling is
 * canonicalized (the receiver's identity match survives), and a value that is
 * not a UUID becomes empty (an unusable provenance never fails a valid
 * delivery).
 */
import { canonicalRefetchRequestId } from '../../delivery/refetchProvenance';
import { buildTemplateVariables } from '../../delivery/HttpMultipartDelivery';
import { deliveryContextFields } from '../../download/handlers/deliveryContext';
import { logger } from '../../logger';

describe('canonicalRefetchRequestId', () => {
  const canonical = '1e22b55c-b33e-4728-9f30-c62e8ee1e11f';

  it('keeps an already canonical UUID', () => {
    expect(canonicalRefetchRequestId(canonical)).toBe(canonical);
  });

  it('re-dashes the bare 32-hex spelling that broke production', () => {
    expect(canonicalRefetchRequestId('1e22b55cb33e47289f30c62e8ee1e11f')).toBe(canonical);
  });

  it('accepts the other spellings Python accepts', () => {
    expect(canonicalRefetchRequestId('1E22B55C-B33E-4728-9F30-C62E8EE1E11F')).toBe(canonical);
    expect(canonicalRefetchRequestId(`{${canonical}}`)).toBe(canonical);
    expect(canonicalRefetchRequestId(`urn:uuid:${canonical}`)).toBe(canonical);
    expect(canonicalRefetchRequestId(`  1e22b55c-b33e-4728-9f30-c62e8ee1e11f  `)).toBe(canonical);
    expect(canonicalRefetchRequestId('1e22b55cb33e4728-9f30-c62e8ee1e11f')).toBe(canonical);
  });

  it('empties anything that is not a UUID instead of failing the delivery', () => {
    expect(canonicalRefetchRequestId('')).toBe('');
    expect(canonicalRefetchRequestId('   ')).toBe('');
    expect(canonicalRefetchRequestId(undefined)).toBe('');
    expect(canonicalRefetchRequestId(null)).toBe('');
    expect(canonicalRefetchRequestId('api:110:0f9a1b')).toBe('');
    expect(canonicalRefetchRequestId('not-a-uuid')).toBe('');
    // 31 / 33 hex digits, and non-hex of the right length, are all refused.
    expect(canonicalRefetchRequestId('1e22b55cb33e47289f30c62e8ee1e11')).toBe('');
    expect(canonicalRefetchRequestId('1e22b55cb33e47289f30c62e8ee1e11ff')).toBe('');
    expect(canonicalRefetchRequestId('1e22b55cb33e47289f30c62e8ee1e11g')).toBe('');
  });
});

describe('delivery layers carry only a canonical refetch_request_id', () => {
  it('deliveryContextFields canonicalizes the manual request id', () => {
    const fields = deliveryContextFields({
      delivery: {
        slotContext: { slotId: 'bot1-daily@manual-1e22b55cb33e47289f30c62e8ee1e11f', manualRequestId: '1e22b55cb33e47289f30c62e8ee1e11f' },
      },
    } as never);
    expect(fields.refetchRequestId).toBe('1e22b55c-b33e-4728-9f30-c62e8ee1e11f');
  });

  it('deliveryContextFields empties a non-UUID key and says so', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const fields = deliveryContextFields({
        delivery: { slotContext: { slotId: 'bot1-daily@manual-abc', manualRequestId: 'abc' } },
      } as never);
      expect(fields.refetchRequestId).toBe('');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('not a UUID'),
        expect.objectContaining({ slotId: 'bot1-daily@manual-abc' })
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('deliveryContextFields stays empty (and quiet) for a scheduled run', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const fields = deliveryContextFields({ delivery: { executionContext: { slotId: 'bot1-daily@2026-09-28' } } } as never);
      expect(fields.refetchRequestId).toBe('');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('buildTemplateVariables canonicalizes whatever reaches the wire boundary', () => {
    const vars = buildTemplateVariables({
      context: { refetchRequestId: '1e22b55cb33e47289f30c62e8ee1e11f' },
    } as never);
    expect(vars.refetchRequestId).toBe('1e22b55c-b33e-4728-9f30-c62e8ee1e11f');
    expect(buildTemplateVariables({ context: { refetchRequestId: 'abc' } } as never).refetchRequestId).toBe('');
    expect(buildTemplateVariables({ context: {} } as never).refetchRequestId).toBe('');
  });
});
