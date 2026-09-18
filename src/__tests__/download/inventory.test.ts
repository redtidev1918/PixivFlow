import { inventoryPolicy, attachInventoryReport, recordInventoryCandidates, inventoryTopic } from '../../download/inventory';
import type { TargetConfig } from '../../config';
import type { IDatabase } from '../../interfaces/IDatabase';

describe('candidate inventory helpers', () => {
  it('defaults to disabled and does not touch storage', () => {
    const target = { mode: 'topic', topic: 'ボテ腹' } as TargetConfig;
    expect(inventoryPolicy(target).enabled).toBe(false);
    expect(attachInventoryReport({} as IDatabase, target, 'ボテ腹', { fetched: 1, selected: 0, rejected: 1, reasons: [] })).toEqual({ fetched: 1, selected: 0, rejected: 1, reasons: [] });
    expect(() => recordInventoryCandidates({} as IDatabase, target, 'ボテ腹', '2026-09-01', [], 'illustration')).not.toThrow();
  });

  it('reads policy from topicProfile.inventory', () => {
    const target = { topic: 'ボテ腹', topicProfile: { inventory: { enabled: true, maxAgeDays: 14, reserveSize: 30, fallback: false } } } as TargetConfig;
    const policy = inventoryPolicy(target);
    expect(policy.enabled).toBe(true);
    expect(policy.maxAgeDays).toBe(14);
    expect(policy.reserveSize).toBe(30);
    expect(policy.fallback).toBe(false);
    expect(inventoryTopic(target)).toBe('ボテ腹');
  });
});
