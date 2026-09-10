/**
 * @deprecated Import from `../pixiv-client/PixivFlowPixivClient` (product) or
 * from `@redtidev/pixiv-client` (the independent kit). This module is a
 * thin backward-compatibility shim for code that still imports the old path.
 *
 * The reusable Pixiv protocol/client code now lives in the
 * `packages/pixiv-client` workspace package (@redtidev/pixiv-client). The
 * class below is the PixivFlow-specific compatibility adapter (TargetConfig
 * queries, product defaults) composed on top of it.
 */
export { PixivFlowPixivClient as PixivClient } from '../pixiv-client/PixivFlowPixivClient';
export { createPixivFlowClient } from '../pixiv-client/createPixivFlowClient';
export type { PixivFlowPixivClientOptions } from '../pixiv-client/PixivFlowPixivClient';

// Re-exported Pixiv domain types for legacy importers (`from './PixivClient'`).
export type {
  PixivUser,
  PixivIllust,
  PixivNovel,
  PixivIllustPage,
  PixivNovelTextResponse,
  PixivTag,
  UgoiraMetadata,
} from '@redtidev/pixiv-client';
