import { DEFAULT_MATERIALIZATION_POLICY, shouldMaterialize } from '../../domain/media/MaterializationPolicy';

describe('MaterializationPolicy', () => {
  it('defaults to eager (production behavior unchanged)', () => {
    expect(DEFAULT_MATERIALIZATION_POLICY.mode).toBe('eager');
    expect(shouldMaterialize(DEFAULT_MATERIALIZATION_POLICY)).toBe(true);
  });

  it('defers materialization in on-demand mode', () => {
    expect(shouldMaterialize({ mode: 'on-demand' })).toBe(false);
  });
});
