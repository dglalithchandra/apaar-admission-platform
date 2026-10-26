import type {
  NotificationDelivery,
  NotificationGatewayPort,
  NotificationRepositoryPort,
} from './model.js';

export class NotificationWorker {
  public constructor(
    private readonly repository: NotificationRepositoryPort,
    private readonly gateway: NotificationGatewayPort,
    private readonly maximumAttempts = 3,
  ) {}

  public async processOne(now: string): Promise<NotificationDelivery | null> {
    const delivery = await this.repository.claim(now);
    if (delivery === null) return null;
    const result = await this.gateway.deliver(delivery);
    const outcome =
      result === 'DELIVERED'
        ? 'DELIVERED'
        : result === 'RETRYABLE' && delivery.attemptCount < this.maximumAttempts
          ? 'RETRYABLE'
          : 'DEAD_LETTER';
    await this.repository.complete(delivery.notificationId, outcome);
    return { ...delivery, state: outcome };
  }
}

export class SyntheticNotificationGateway implements NotificationGatewayPort {
  public deliver(delivery: NotificationDelivery): Promise<'DELIVERED' | 'RETRYABLE' | 'FAILED'> {
    if (!delivery.destinationReference.startsWith('SYNTH-')) return Promise.resolve('FAILED');
    if (delivery.destinationReference.includes('RETRY')) return Promise.resolve('RETRYABLE');
    if (delivery.destinationReference.includes('FAIL')) return Promise.resolve('FAILED');
    return Promise.resolve('DELIVERED');
  }
}

export class InMemoryNotificationRepository implements NotificationRepositoryPort {
  private readonly queue: NotificationDelivery[];

  public constructor(deliveries: readonly NotificationDelivery[]) {
    this.queue = [...deliveries];
  }

  public claim(): Promise<NotificationDelivery | null> {
    const delivery = this.queue.find(
      (item) => item.state === 'PENDING' || item.state === 'RETRYABLE',
    );
    if (delivery === undefined) return Promise.resolve(null);
    const claimed = { ...delivery, attemptCount: delivery.attemptCount + 1 };
    this.replace(claimed);
    return Promise.resolve(claimed);
  }

  public complete(
    notificationId: string,
    outcome: 'DELIVERED' | 'RETRYABLE' | 'DEAD_LETTER',
  ): Promise<void> {
    const current = this.queue.find((item) => item.notificationId === notificationId);
    if (current !== undefined) this.replace({ ...current, state: outcome });
    return Promise.resolve();
  }

  public get(notificationId: string): NotificationDelivery | undefined {
    return this.queue.find((item) => item.notificationId === notificationId);
  }

  private replace(delivery: NotificationDelivery): void {
    const index = this.queue.findIndex((item) => item.notificationId === delivery.notificationId);
    if (index >= 0) this.queue[index] = delivery;
  }
}
