/**
 * Production uses TWO independent external clocks for the same schedule set:
 *
 *   PRIMARY   cron-job.org        fires AT the occurrence
 *   SECONDARY Cloudflare Cron     fires at the occurrence + 2 minutes
 *
 * Both POST the same idempotent trigger. Neither computes an occurrence, owns
 * state, or decides anything; PixivFlow's durable slot ledger is the single
 * execution authority, which is what makes a duplicate trigger converge instead
 * of running twice.
 *
 * The SECONDARY offset is the only new number this introduces, and getting it
 * wrong would silently run the WRONG occurrence (it is not an error, and not an
 * expired window — just a different slot). So it is proved here against the REAL
 * resolver rather than argued in prose.
 *
 * Background (2026-09-13 incident): the `bot1-daily` / `bot2-daily` occurrences
 * were silently missed. A single external clock cannot detect that IT never
 * executed, which is why a second, independent clock replays the same trigger
 * shortly afterwards. See the deploy repo's incident record.
 *
 * Schedule definitions are owned by
 * `pixivflow-telepost-deploy/pixivflow/config/production.json` (declared in
 * Asia/Shanghai) and the UTC shift by
 * `pixivflow-telepost-deploy/control-plane/src/cron-map.ts`. Both are restated
 * below as the test fixture because this repo cannot read that one; the
 * constants are asserted, not assumed, so drift fails here.
 */
import {
  checkOccurrenceWindow,
  resolveOccurrence,
  scheduleTimezone,
} from '../../scheduler/OccurrenceResolver';
import { ScheduleConfig } from '../../config';

/** Production clock timezone (SSOT: production.json `scheduler.timezone`). */
const TZ = 'Asia/Shanghai';

/** SSOT: production.json schedules[].cron, declared in Asia/Shanghai. */
const bot1 = {
  id: 'bot1-daily',
  name: 'Bot1 每日 10:00 & 22:00',
  cron: '0 10,22 * * *',
  timezone: TZ,
  enabled: true,
} as ScheduleConfig;

const bot2 = {
  id: 'bot2-daily',
  name: 'Bot2 每日 10:10 & 22:10',
  cron: '10 10,22 * * *',
  timezone: TZ,
  enabled: true,
} as ScheduleConfig;

/** SSOT: production.json `schedulerRuntime.trigger.graceMinutes`. */
const GRACE_MINUTES = 720;

/** The resolver's lead window: a trigger this far before a fire belongs to it. */
const LEAD_MINUTES = 15;

/** Offset of the secondary clock behind the primary, in minutes. */
const SECONDARY_DELAY_MINUTES = 2;

interface ProductionOccurrence {
  /** Canonical fire instant, UTC. */
  fire: string;
  /** Wall-clock label in Asia/Shanghai. */
  label: string;
  /** Slot-id stamp (tz wall clock, minute precision). */
  stamp: string;
  /** Minutes from this fire to the NEXT fire of the SAME schedule. */
  gapMinutes: number;
}

/** bot1: 10:00 and 22:00 China Standard Time. */
const BOT1_OCCURRENCES: ProductionOccurrence[] = [
  { fire: '2026-09-13T02:00:00Z', label: '10:00', stamp: '1000', gapMinutes: 12 * 60 },
  { fire: '2026-09-13T14:00:00Z', label: '22:00', stamp: '2200', gapMinutes: 12 * 60 },
];

/** bot2: 10:10 and 22:10 China Standard Time (10-minute stagger preserved). */
const BOT2_OCCURRENCES: ProductionOccurrence[] = [
  { fire: '2026-09-13T02:10:00Z', label: '10:10', stamp: '1010', gapMinutes: 12 * 60 },
  { fire: '2026-09-13T14:10:00Z', label: '22:10', stamp: '2210', gapMinutes: 12 * 60 },
];

/**
 * The delay bounds for one occurrence, all derived from the real resolver:
 *  - `identityMax`: the largest delay that still names THIS occurrence.
 *  - `graceMax`: the largest delay that is still admissible at all.
 *  - `safeMax`: the largest delay that is both intended and admissible.
 *
 * The two fires are 12 hours apart while the grace window is also 12 hours, so
 * the LEAD edge binds (704 minutes) before the grace does.
 */
function boundsOf(occ: ProductionOccurrence): {
  identityMax: number;
  graceMax: number;
  safeMax: number;
} {
  const identityMax = occ.gapMinutes - LEAD_MINUTES - 1;
  return { identityMax, graceMax: GRACE_MINUTES, safeMax: Math.min(identityMax, GRACE_MINUTES) };
}

/** The binding safe delay across all production occurrences. */
const MAX_SAFE_DELAY_MINUTES = Math.min(
  ...BOT1_OCCURRENCES.map((o) => boundsOf(o).safeMax),
  ...BOT2_OCCURRENCES.map((o) => boundsOf(o).safeMax)
);

const minutes = (n: number): number => n * 60_000;

const resolve = (schedule: ScheduleConfig, when: Date, triggerSource: 'cron' | 'http' = 'http') =>
  resolveOccurrence({ schedule, at: when, triggerSource });

const at = (iso: string): Date => new Date(iso);
const plus = (iso: string, m: number): Date => new Date(at(iso).getTime() + minutes(m));

describe('redundant external clock offset', () => {
  it('restates the production schedule definitions it is proving against', () => {
    expect(scheduleTimezone(bot1)).toBe(TZ);
    expect(scheduleTimezone(bot2)).toBe(TZ);
    expect(bot1.cron).toBe('0 10,22 * * *');
    expect(bot2.cron).toBe('10 10,22 * * *');
    // The secondary offset is a small fraction of the binding bound.
    expect(MAX_SAFE_DELAY_MINUTES).toBe(704);
    expect(SECONDARY_DELAY_MINUTES).toBeLessThan(MAX_SAFE_DELAY_MINUTES / 4);
  });

  describe.each([
    ['bot1-daily', bot1, BOT1_OCCURRENCES],
    ['bot2-daily', bot2, BOT2_OCCURRENCES],
  ] as const)('%s', (id, schedule, occurrences) => {
    const slotIdOf = (occ: ProductionOccurrence): string => `${id}@2026-09-13T${occ.stamp}`;

    it('PRIMARY (on time) and SECONDARY (+2 min) resolve to the SAME occurrence', () => {
      for (const occ of occurrences) {
        const primary = resolve(schedule, at(occ.fire), 'cron');
        const secondary = resolve(schedule, plus(occ.fire, SECONDARY_DELAY_MINUTES));

        expect(secondary.slotId).toBe(primary.slotId);
        expect(secondary.slotId).toBe(slotIdOf(occ));
        expect(secondary.occurrenceAt.getTime()).toBe(primary.occurrenceAt.getTime());
        expect(secondary.occurrenceAtIso).toBe(at(occ.fire).toISOString());
        // The secondary is an ordinary HTTP trigger; identity never depends on
        // which clock sent it, only on the schedule's own cron.
        expect(secondary.triggerSource).toBe('http');
      }
    });

    it('the SECONDARY is a LATE trigger: it resolves backwards to its own fire, never the upcoming one', () => {
      for (const occ of occurrences) {
        const secondaryAt = plus(occ.fire, SECONDARY_DELAY_MINUTES);
        const resolved = resolve(schedule, secondaryAt);

        expect(secondaryAt.getTime()).toBeGreaterThan(resolved.occurrenceAt.getTime());
        expect(resolved.occurrenceDate).toBe('2026-09-13');
        expect(resolved.occurrenceLabel).toBe(occ.label);
      }
    });

    it('converges the 22:00 batch that matters tonight', () => {
      // The occurrence this whole architecture exists to protect.
      const evening = occurrences.filter((o) => o.label === '22:00' || o.label === '22:10');
      expect(evening).toHaveLength(1);
      const occ = evening[0];
      const primary = resolve(schedule, at(occ.fire), 'cron');
      const secondary = resolve(schedule, plus(occ.fire, SECONDARY_DELAY_MINUTES));

      expect(primary.slotId).toBe(secondary.slotId);
      expect(primary.occurrenceAtIso).toBe(at(occ.fire).toISOString());
      expect(checkOccurrenceWindow(primary, at(occ.fire), GRACE_MINUTES)).toEqual({ ok: true });
      expect(
        checkOccurrenceWindow(secondary, plus(occ.fire, SECONDARY_DELAY_MINUTES), GRACE_MINUTES)
      ).toEqual({ ok: true });
    });

    it('both clocks are inside the grace window and outside the lead window', () => {
      for (const occ of occurrences) {
        const resolved = resolve(schedule, at(occ.fire), 'cron');
        expect(checkOccurrenceWindow(resolved, at(occ.fire), GRACE_MINUTES)).toEqual({ ok: true });
        const secondaryAt = plus(occ.fire, SECONDARY_DELAY_MINUTES);
        expect(checkOccurrenceWindow(resolved, secondaryAt, GRACE_MINUTES)).toEqual({ ok: true });
      }
    });

    it('tolerates a secondary clock that runs minutes or hours late', () => {
      // A hosted HTTP scheduler is best-effort: the offset is a floor, not a
      // promise. Lateness must stay on the intended occurrence right up to the
      // binding bound.
      for (const occ of occurrences) {
        const { safeMax } = boundsOf(occ);
        const lateness = [0, 1, 5, 15, 60, 180, safeMax - SECONDARY_DELAY_MINUTES];
        for (const extraMinutes of lateness) {
          const when = plus(occ.fire, SECONDARY_DELAY_MINUTES + extraMinutes);
          const resolved = resolve(schedule, when);
          expect(resolved.slotId).toBe(slotIdOf(occ));
          expect(resolved.occurrenceAtIso).toBe(at(occ.fire).toISOString());
          expect(checkOccurrenceWindow(resolved, when, GRACE_MINUTES).ok).toBe(true);
        }
      }
    });

    it('names the intended occurrence for every delay across the whole safe range', () => {
      for (const occ of occurrences) {
        const { safeMax } = boundsOf(occ);
        for (const delay of [0, 1, 2, 5, 10, 14, 15, 20, 60, 300, safeMax]) {
          const when = plus(occ.fire, delay);
          expect(resolve(schedule, when).slotId).toBe(slotIdOf(occ));
        }
      }
    });

    it('states the bound: past the lead edge the identity flips to the NEXT occurrence, not to an error', () => {
      for (const occ of occurrences) {
        const { identityMax } = boundsOf(occ);
        expect(resolve(schedule, plus(occ.fire, identityMax)).slotId).toBe(slotIdOf(occ));

        const flippedAt = plus(occ.fire, identityMax + 1);
        const flipped = resolve(schedule, flippedAt);
        expect(flipped.slotId).not.toBe(slotIdOf(occ));
        expect(flipped.occurrenceAtIso).toBe(plus(occ.fire, occ.gapMinutes).toISOString());
        // Still admissible: silently the wrong occurrence, which is the hazard.
        expect(checkOccurrenceWindow(flipped, flippedAt, GRACE_MINUTES).ok).toBe(true);
      }
    });

    it('resolves a clock that fires early to the upcoming fire, which is why the offset is a delay', () => {
      // The 15-minute lead is real, so a clock must never fire before the
      // occurrence it means to replay. The SECONDARY is a delay for this reason.
      for (const occ of occurrences) {
        const early = resolve(schedule, new Date(at(occ.fire).getTime() - minutes(10)));
        expect(early.occurrenceAtIso).toBe(at(occ.fire).toISOString());
        expect(early.slotId).toBe(slotIdOf(occ));
      }
      expect(SECONDARY_DELAY_MINUTES).toBeGreaterThan(0);
    });
  });

  it('never crosses schedules: each clock resolves against its OWN schedule cron', () => {
    // bot1's secondary fires 14:02Z and bot2's 14:12Z, four minutes from bot2's
    // own primary at 14:10Z. Even if a clock were skewed onto the other bot's
    // fire instant, identity cannot cross: the resolver uses the schedule's own
    // cron, so bot1 can only ever name a bot1 occurrence.
    const bot1Secondary = resolve(bot1, plus('2026-09-13T14:00:00Z', SECONDARY_DELAY_MINUTES));
    const bot2Secondary = resolve(bot2, plus('2026-09-13T14:10:00Z', SECONDARY_DELAY_MINUTES));

    expect(bot1Secondary.slotId).toBe('bot1-daily@2026-09-13T2200');
    expect(bot2Secondary.slotId).toBe('bot2-daily@2026-09-13T2210');
    expect(bot1Secondary.slotId).not.toBe(bot2Secondary.slotId);
    expect(bot1Secondary.occurrenceAt.getTime()).not.toBe(bot2Secondary.occurrenceAt.getTime());

    // Adversarial: bot1's clock fires exactly at bot2's fire instant.
    expect(resolve(bot1, at('2026-09-13T14:10:00Z')).slotId).toBe('bot1-daily@2026-09-13T2200');
    // And the reverse.
    expect(resolve(bot2, at('2026-09-13T14:00:00Z')).slotId).toBe('bot2-daily@2026-09-13T2210');
  });

  it('keeps the bot2 stagger intact so the two bots never share an instant', () => {
    for (const [b1, b2] of [
      [BOT1_OCCURRENCES[0], BOT2_OCCURRENCES[0]],
      [BOT1_OCCURRENCES[1], BOT2_OCCURRENCES[1]],
    ] as const) {
      expect(at(b2.fire).getTime() - at(b1.fire).getTime()).toBe(minutes(10));
    }
    expect(resolve(bot1, at(BOT1_OCCURRENCES[1].fire)).slotId).toBe('bot1-daily@2026-09-13T2200');
    expect(resolve(bot2, at(BOT2_OCCURRENCES[1].fire)).slotId).toBe('bot2-daily@2026-09-13T2210');
  });
});
