import type { TargetConfig } from '../config';

/**
 * The delivery channels one Download Target fans out to.
 *
 * This is the single source of truth for "which external platforms does this
 * target publish to". It lives in its own dependency-free module so the
 * download planner, the target handlers and DeliveryService can all share it
 * without importing each other.
 *
 * Rules:
 *  - `storageMode !== 'cache'` ⇒ no delivery at all (`[]`).
 *  - `delivery.targets` (array) takes precedence over the legacy single
 *    `delivery.target`; entries are trimmed, empties dropped, duplicates
 *    collapsed, and config order preserved.
 *  - Declaring neither resolves to `[]`, which is exactly the historical
 *    behaviour: delivery is an optional capability.
 */
export function targetDeliveryNames(target: TargetConfig): string[] {
  if (target.storageMode !== 'cache') return [];
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (value?: string): void => {
    const name = value?.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  const configured = target.delivery?.targets;
  if (Array.isArray(configured) && configured.length > 0) {
    for (const value of configured) push(typeof value === 'string' ? value : undefined);
    return names;
  }
  push(target.delivery?.target);
  return names;
}

/**
 * The PRIMARY route declared by a download target, INDEPENDENT of storage mode
 * and of whether delivery is actually active.
 *
 * Operational notifications and the scheduler's refetch/outcome endpoint lookup
 * address exactly one route, and they historically read the raw
 * `delivery.target` even for a non-cache target. This keeps that behaviour while
 * accepting the multi-route array (first entry wins).
 */
export function primaryDeliveryName(target: TargetConfig): string | undefined {
  const configured = target.delivery?.targets;
  if (Array.isArray(configured)) {
    for (const value of configured) {
      const name = typeof value === 'string' ? value.trim() : '';
      if (name) return name;
    }
  }
  return target.delivery?.target?.trim() || undefined;
}
