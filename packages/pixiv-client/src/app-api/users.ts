import type { Transport } from '../transport/transport';
import type { PixivUser } from '../models';

/** User endpoints (App API). */
export class UsersApi {
  constructor(private readonly transport: Transport) {}

  /**
   * Public profile of one user.
   * NOTE: `/v1/user/profile` (the old "current user") endpoint was removed by
   * Pixiv and now always answers 404 "Specified end-point doesn't exist"; the
   * App API only exposes per-user detail, which is what this wraps.
   */
  async user(userId: string | number, options: { signal?: AbortSignal } = {}): Promise<PixivUser> {
    const params = new URLSearchParams({ user_id: String(userId), filter: 'for_ios' });
    const response = await this.transport.request<{ user: PixivUser }>(
      `/v1/user/detail?${params.toString()}`,
      { method: 'GET', signal: options.signal }
    );
    return response.user;
  }
}
