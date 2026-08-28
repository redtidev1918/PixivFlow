import { DeliveryConfig } from '../config';
import { ConfigError } from '../utils/errors';
import { HttpMultipartDelivery } from './HttpMultipartDelivery';
import { DeliveryRequest, DeliveryResult } from './types';

/** Resolves named delivery targets without coupling the outbox to a provider. */
export class DeliveryDispatcher {
  constructor(
    private readonly config: DeliveryConfig | undefined,
    private readonly proxyUrl?: string
  ) {}

  hasTarget(name: string): boolean {
    return Boolean(this.config?.targets?.[name]);
  }

  async deliver(name: string, request: DeliveryRequest): Promise<DeliveryResult> {
    const target = this.config?.targets?.[name];
    if (!target) {
      throw new ConfigError(`Delivery target is not configured: ${name}`);
    }
    switch (target.type) {
      case 'httpMultipart':
        return new HttpMultipartDelivery(target, this.proxyUrl).deliver(request);
      default:
        throw new ConfigError(`Unsupported delivery target type: ${(target as { type?: string }).type}`);
    }
  }
}
