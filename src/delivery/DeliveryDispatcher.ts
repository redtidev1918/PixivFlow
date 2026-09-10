import { DeliveryConfig } from '../config';
import { ConfigError } from '../utils/errors';
import { HttpMultipartDelivery } from './HttpMultipartDelivery';
import { DeliveryNotificationRequest, DeliveryRequest, DeliveryResult } from './types';

/** Resolves named delivery targets without coupling the outbox to a provider. */
export class DeliveryDispatcher {
  constructor(
    private readonly config: DeliveryConfig | undefined,
    private readonly proxyUrl?: string
  ) {}

  hasTarget(name: string): boolean {
    return Boolean(this.config?.targets?.[name]);
  }

  async isReady(name: string): Promise<boolean> {
    const target = this.config?.targets?.[name];
    // Readiness is an optional preflight. Missing targets still flow through
    // deliver/notify so the durable outbox records the normal retry error.
    if (!target) return true;
    return new HttpMultipartDelivery(target, this.proxyUrl).isReady();
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

  async notify(name: string, request: DeliveryNotificationRequest): Promise<DeliveryResult> {
    const target = this.config?.targets?.[name];
    if (!target) {
      throw new ConfigError(`Delivery target is not configured: ${name}`);
    }
    if (target.type !== 'httpMultipart') {
      throw new ConfigError(`Unsupported delivery target type: ${(target as { type?: string }).type}`);
    }
    if (!target.notificationUrl?.trim()) {
      throw new ConfigError(`Delivery target does not configure notificationUrl: ${name}`);
    }
    return new HttpMultipartDelivery(target, this.proxyUrl).notifyOnce(request);
  }
}
