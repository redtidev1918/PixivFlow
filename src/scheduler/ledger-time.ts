/**
 * Conversions for the durable ledger's mixed timestamp shapes.
 *
 * `schedule_slots.created_at` / `started_at` / `completed_at` and
 * `schedule_slot_items.created_at` / `updated_at` / `completed_at` come from
 * SQLite `CURRENT_TIMESTAMP`: UTC "YYYY-MM-DD HH:MM:SS" with NO zone marker.
 * `Date.parse` reads that shape as LOCAL time, so the zone is added explicitly
 * instead of being trusted to the engine.
 *
 * `schedule_slots.heartbeat_at` / `lease_until` and the outbox/lease columns are
 * epoch milliseconds written by this process. Both directions live here so a
 * projection and a comparison query can never disagree about which shape a
 * column is in.
 */

/** SQLite UTC datetime ("YYYY-MM-DD HH:MM:SS") -> epoch ms. */
export function sqliteUtcMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Epoch ms -> the exact string shape SQLite's `CURRENT_TIMESTAMP` writes, so a
 * cutoff can be compared against string columns in SQL instead of loading the
 * whole ledger to filter in JS.
 */
export function sqliteUtcTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace('T', ' ');
}
