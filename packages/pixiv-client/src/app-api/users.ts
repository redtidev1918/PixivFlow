import type { Transport } from '../transport/transport';
import type { PixivUser } from '../models';

/** Current authenticated user endpoints. */
export class UsersApi {
  constructor(private readonly transport: Transport) {}

  async me(signal?: AbortSignal): Promise<PixivUser> {
    const response = await this.transport.request<{ user_profile: { user: PixivUser } }>(
      '/v1/user/profile',
      { method: 'GET', signal }
    );
    return response.user_profile.user;
  }
}
