import type { TargetConfig } from '../config';

/** Human/API label for a target, including semantic-topic targets. */
export function getTargetLabel(target: TargetConfig, fallback = 'unknown'): string {
  return target.filterTag?.trim()
    || target.tag?.trim()
    || target.topic?.trim()
    || fallback;
}
