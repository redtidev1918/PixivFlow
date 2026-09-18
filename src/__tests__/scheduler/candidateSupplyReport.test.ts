/**
 * Phase 1 Candidate Report: the upstream supply funnel is persisted beside the
 * scan and folded into the terminal outcome, so an empty result stops being a
 * bare "no candidates" line for the operator.
 */
import {
  emptyCandidateSupplyReport,
  mergeCandidateSupplyReports,
  withScanSkips,
  mergeScanSummaries,
  type CandidateScanSummary,
  type CandidateSupplyReport,
} from '../../scheduler/TargetOutcome';

function scan(over: Partial<CandidateScanSummary>): CandidateScanSummary {
  return { bound: 5, attempted: 0, skipped: [], outages: [], ...over };
}

describe('candidate supply report', () => {
  it('merges multi-day lookback funnels (reasons summed by code)', () => {
    const day1: CandidateSupplyReport = {
      fetched: 29,
      selected: 3,
      rejected: 26,
      reasons: [{ code: 'ai_filtered', count: 23 }, { code: 'duplicate', count: 3 }],
    };
    const day2: CandidateSupplyReport = {
      fetched: 19,
      selected: 2,
      rejected: 17,
      reasons: [{ code: 'ai_filtered', count: 15 }, { code: 'duplicate', count: 2 }],
    };
    const merged = mergeCandidateSupplyReports(day1, day2);
    expect(merged.fetched).toBe(48);
    expect(merged.selected).toBe(5);
    expect(merged.rejected).toBe(43);
    expect(merged.reasons).toEqual([
      { code: 'ai_filtered', count: 38 },
      { code: 'duplicate', count: 5 },
    ]);
  });

  it('folds scan-level skips into selected/reasons', () => {
    const supply: CandidateSupplyReport = {
      fetched: 19,
      selected: 2,
      rejected: 17,
      reasons: [{ code: 'metadata_filtered', count: 17 }],
    };
    const s = scan({
      attempted: 2,
      skipped: [
        { code: 'duplicate', workId: '1', reason: 'already delivered' },
        { code: 'filtered', workId: '2', reason: 'language filter mismatch' },
      ],
    });
    const out = withScanSkips(supply, s)!;
    expect(out.selected).toBe(0);
    expect(out.rejected).toBe(19);
    expect(out.reasons).toEqual([
      { code: 'metadata_filtered', count: 17 },
      { code: 'duplicate', count: 1 },
      { code: 'filtered', count: 1 },
    ]);
  });

  it('mergeScanSummaries folds supply across the same target', () => {
    const a = scan({ supply: { fetched: 29, selected: 3, rejected: 26, reasons: [{ code: 'ai_filtered', count: 23 }] } });
    const b = scan({ supply: { fetched: 19, selected: 2, rejected: 17, reasons: [{ code: 'duplicate', count: 2 }] } });
    const out = mergeScanSummaries(a, b);
    expect(out.supply!.fetched).toBe(48);
    expect(out.supply!.selected).toBe(5);
    expect(out.bound).toBe(10);
  });

  it('empty report starts at zero', () => {
    expect(emptyCandidateSupplyReport()).toEqual({ fetched: 0, selected: 0, rejected: 0, reasons: [] });
  });
});
