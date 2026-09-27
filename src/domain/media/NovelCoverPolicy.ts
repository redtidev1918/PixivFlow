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
 * it is `probe_failed` — the bytes were never seen, so no content type exists.
 * It is a policy decision like `unknown` (`download.novelCover.probeFailed`),
 * and the production-safe default is `skip`: the majority of novel covers ARE
 * Pixiv's generated designs, so a probe failure that keeps the cover re-ships
 * exactly the payloads the 640x900 classifier exists to suppress. `keep` stays
 * available for an operator who prefers availability over certainty (a
 * transient fetch error must never cost a real cover). Either way the loud
 * `coverType=probe_failed` log line stays, so the decision is observable
 * instead of silent.
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
  /**
   * What to do when the cover probe itself failed (network / auth / rate
   * limit), so the bytes were never fetched and no content type exists.
   *
   * 'skip' (default): safe mode — most novel covers ARE Pixiv's generated
   * designs, so keeping an unseen probe failure re-ships exactly the covers
   * the 640x900 classifier exists to suppress. The cost is one illustration
   * when a real author cover happens to be transiently unreachable.
   * 'keep': prefer availability over certainty — a failed probe never costs a
   * cover, at the price of re-shipping generated designs whenever the CDN or
   * the account is unreachable.
   */
  probeFailed: 'skip' | 'keep';
}

/**
 * Production-safe default: an unclassifiable cover is never shipped, and a
 * probe that never produced bytes is not treated as evidence that the cover is
 * real content.
 */
export const DEFAULT_NOVEL_COVER_POLICY: NovelCoverPolicy = {
  unknownCover: 'skip',
  probeFailed: 'skip',
};

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

/**
 * Everything `coverDeliveryDecision` can be asked about: the three results
 * `classifyNovelCover` returns, plus the probe that never produced bytes.
 */
export type NovelCoverOutcome = NovelCoverType | 'probe_failed';

/** The delivery decision for one cover outcome under a policy. */
export function coverDeliveryDecision(
  policy: NovelCoverPolicy,
  outcome: NovelCoverOutcome
): 'deliver' | 'skip' {
  if (outcome === 'pixiv_generated') return 'skip';
  if (outcome === 'unknown') return policy.unknownCover === 'keep' ? 'deliver' : 'skip';
  if (outcome === 'probe_failed') return policy.probeFailed === 'keep' ? 'deliver' : 'skip';
  return 'deliver';
}
