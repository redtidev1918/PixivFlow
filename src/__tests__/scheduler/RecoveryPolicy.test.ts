/**
 * Execution/acquisition policy preset tests (§recovery-policy, §tests).
 *
 * The contract: `relaxed` widens ONLY soft acquisition criteria, never hard
 * business constraints, and the override is occurrence-scoped — the source
 * config object is never mutated, so future schedules are unaffected.
 */
import {
  ACQUISITION_POLICIES,
  RELAXED_LOOKBACK_DAYS_CAP,
  RELAXED_SCAN_LIMIT_CAP,
  applyAcquisitionPolicy,
} from '../../scheduler/RecoveryPolicy';
import { TargetConfig } from '../../config';

const baseTarget: TargetConfig = {
  id: 'bot1-illust-botefuku',
  type: 'illustration',
  mode: 'topic',
  limit: 1,
  storageMode: 'cache',
  delivery: { target: 'bot1-submit' },
  topic: 'ボテ腹',
  date: 'YESTERDAY',
  topicDiscovery: { includeR18: true },
  excludeAI: true,
  aiMetadataCheck: true,
  maxPageCount: 30,
  candidateScanLimit: 10,
  languageCandidateLimit: 20,
  languageFilter: 'chinese',
  strictLanguageFilter: true,
  noMatchPolicy: { lookbackDays: 3, notify: false },
} as TargetConfig;

describe('applyAcquisitionPolicy', () => {
  it('normal is the identity policy (base config passes through untouched)', () => {
    expect(applyAcquisitionPolicy(baseTarget, 'normal')).toBe(baseTarget);
    expect(ACQUISITION_POLICIES.normal).toEqual({
      scanLimitMultiplier: 1,
      lookbackDaysMultiplier: 1,
      languageCandidateLimitMultiplier: 1,
    });
  });

  it('relaxed widens search range and candidate counts', () => {
    const relaxed = applyAcquisitionPolicy(baseTarget, 'relaxed');
    expect(relaxed.candidateScanLimit).toBe(30);
    expect(relaxed.languageCandidateLimit).toBe(40);
    expect(relaxed.noMatchPolicy?.lookbackDays).toBe(7);
    expect(relaxed.noMatchPolicy?.notify).toBe(false);
  });

  it('never mutates the global config (occurrence-scoped override)', () => {
    const snapshot = JSON.parse(JSON.stringify(baseTarget));
    applyAcquisitionPolicy(baseTarget, 'relaxed');
    expect(baseTarget).toEqual(snapshot);
    expect(baseTarget.candidateScanLimit).toBe(10);
    expect(baseTarget.noMatchPolicy?.lookbackDays).toBe(3);
  });

  it('caps widened values instead of scanning without bound', () => {
    const relaxed = applyAcquisitionPolicy(
      { ...baseTarget, candidateScanLimit: 80, noMatchPolicy: { lookbackDays: 5 } },
      'relaxed'
    );
    expect(relaxed.candidateScanLimit).toBe(RELAXED_SCAN_LIMIT_CAP);
    expect(relaxed.noMatchPolicy?.lookbackDays).toBe(RELAXED_LOOKBACK_DAYS_CAP);
  });

  it('leaves every HARD constraint untouched', () => {
    const relaxed = applyAcquisitionPolicy(baseTarget, 'relaxed');
    // Security / content rules, work-type boundary, delivery wiring, data
    // integrity and explicit bans are never relaxed by an ordinary policy.
    expect(relaxed.excludeAI).toBe(true);
    expect(relaxed.aiMetadataCheck).toBe(true);
    expect(relaxed.strictLanguageFilter).toBe(true);
    expect(relaxed.maxPageCount).toBe(30);
    expect(relaxed.topic).toBe('ボテ腹');
    expect(relaxed.type).toBe('illustration');
    expect(relaxed.limit).toBe(1);
    expect(relaxed.storageMode).toBe('cache');
    expect(relaxed.delivery).toEqual({ target: 'bot1-submit' });
    expect(relaxed.date).toBe('YESTERDAY');
    expect(relaxed.topicDiscovery).toEqual({ includeR18: true });
  });

  it('does not invent a scan bound where the config declared none', () => {
    const target = { ...baseTarget, candidateScanLimit: undefined, languageCandidateLimit: undefined };
    const relaxed = applyAcquisitionPolicy(target, 'relaxed');
    expect(relaxed.candidateScanLimit).toBeUndefined();
    expect(relaxed.languageCandidateLimit).toBeUndefined();
    // lookbackDays had a value, so it still widens.
    expect(relaxed.noMatchPolicy?.lookbackDays).toBe(7);
  });
});
