import { DeliveryConfig } from '../config';
import { ConfigError } from '../utils/errors';
import { HttpMultipartDelivery, ReadinessProbeResult } from './HttpMultipartDelivery';
import { TelegramReviewDelivery } from './TelegramReviewDelivery';
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
    return (await this.readinessProbe(name)).ready;
  }

  /** Structured readiness (includes reason/status for the audit event). */
  async readinessProbe(name: string): Promise<ReadinessProbeResult> {
    const target = this.config?.targets?.[name];
    // Readiness is an optional preflight. Missing targets still flow through
    // deliver/notify so the durable outbox records the normal retry error.
    if (!target) return { ready: true };
    // Only the HTTP provider exposes a readiness endpoint. A Telegram review
    // target has nothing to probe: its delivery fails visibly instead.
    if (target.type !== 'httpMultipart') return { ready: true };
    return new HttpMultipartDelivery(target, this.proxyUrl).readinessProbe();
  }

  async deliver(name: string, request: DeliveryRequest): Promise<DeliveryResult> {
    const target = this.config?.targets?.[name];
    if (!target) {
      throw new ConfigError(`Delivery target is not configured: ${name}`);
    }
    switch (target.type) {
      case 'httpMultipart':
        return new HttpMultipartDelivery(target, this.proxyUrl).deliver(request);
      case 'telegram':
        return new TelegramReviewDelivery(target).deliver(request);
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
