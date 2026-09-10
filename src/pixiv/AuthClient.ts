/**
 * @deprecated Pixiv OAuth/refresh-token handling is PixivFlow product code and
 * now lives at `../auth/PixivAuth`. This shim preserves the old import path.
 * The reusable kit only consumes access tokens via AccessTokenProvider.
 */
export { PixivAuth } from '../auth/PixivAuth';
