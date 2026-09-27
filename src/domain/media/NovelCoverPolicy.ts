/**
 * Novel cover content policy (§media-asset-pipeline / §novel-cover).
 *
 * Pixiv exposes a novel cover as a single URL and gives NO field that says what
 * the image actually IS. Two very different things arrive through that one
 * field:
 *
 *   custom          the author's own uploaded artwork — real content, must ship
 *   pixiv_generated Pixiv's built-in design cover, rendered per novel on a fixed
 *                   640x900 canvas with the title typeset on it — zero content
 *                   value, must never ship as Telegram media
 *
 * The URL cannot separate them (both live under `novel-cover-master/img/...`
 * behind a unique hash, and the old `novel-cover-master-default` placeholder no
 * longer occurs), so the classification is made from the fetched bytes' header.
 * A third outcome exists on purpose:
 *
 *   unknown         the payload could not be classified (unrecognized header,
 *                   format Pixiv does not normally serve)
 *
 * `unknown` is a POLICY decision, not an accident: sending it can leak a design
 * cover into a public channel (the exact bug this pipeline fixes), while
 * dropping it costs one illustration on the card. The production-safe default is
 * therefore to skip it and log `coverType=unknown` loudly, so a future Pixiv
 * cover-format change surfaces as a visible log line instead of silently
 * shipping generated covers again.
 *
 * A FAILED probe (network / auth / rate limit) is deliberately NOT `unknown`:
 * it is `probe_failed` and always keeps the cover, because a transient fetch
 * error must never cost a real one.
 */
import { readImageDimensions } from '../../utils/imageDimensions';

/** What a fetched novel cover actually is. */
export type NovelCoverType = 'custom' | 'pixiv_generated' | 'unknown';

/**
 * The canvas Pixiv renders its built-in novel cover designs on. Every design
 * observed in production (floral, seasonal sweets, treasure map, genre label,
 * city night) is delivered at exactly this size, while author covers keep their
 * own dimensions (512x512, 768x768, 800x1200, 822x1200, 826x1169, 1024x1024 …).
 */
export const PIXIV_GENERATED_COVER_WIDTH = 640;
export const PIXIV_GENERATED_COVER_HEIGHT = 900;

export interface NovelCoverPolicy {
  /**
   * What to do with a cover whose content type could not be classified.
   * 'skip' (default): safe mode — never ship an unclassifiable cover.
   * 'keep': prefer availability over certainty.
   */
  unknownCover: 'skip' | 'keep';
}

/** Production-safe default: an unclassifiable cover is never shipped. */
export const DEFAULT_NOVEL_COVER_POLICY: NovelCoverPolicy = { unknownCover: 'skip' };

/**
 * Classify fetched cover bytes. Returns `unknown` when the image header cannot
 * be read (no decoder in this project, so only the header is inspected).
 */
export function classifyNovelCover(
  cover: ArrayBuffer | Uint8Array | null | undefined
): NovelCoverType {
  const dimensions = readImageDimensions(cover);
  if (!dimensions) return 'unknown';
  if (
    dimensions.width === PIXIV_GENERATED_COVER_WIDTH &&
    dimensions.height === PIXIV_GENERATED_COVER_HEIGHT
  ) {
    return 'pixiv_generated';
  }
  return 'custom';
}

/** The delivery decision for one classified cover under a policy. */
export function coverDeliveryDecision(
  policy: NovelCoverPolicy,
  type: NovelCoverType
): 'deliver' | 'skip' {
  if (type === 'pixiv_generated') return 'skip';
  if (type === 'unknown') return policy.unknownCover === 'keep' ? 'deliver' : 'skip';
  return 'deliver';
}
