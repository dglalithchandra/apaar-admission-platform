import type { SecurityEventPort } from './model.js';
import { redactSecurityObject } from './config.js';

export interface RecordedSecurityEvent {
  readonly actorReference: string;
  readonly correlationReference: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly eventCode: string;
}

export class InMemorySecurityEventWriter implements SecurityEventPort {
  private readonly values: RecordedSecurityEvent[] = [];

  public record(input: RecordedSecurityEvent): Promise<void> {
    this.values.push({ ...input, details: redactSecurityObject(input.details) });
    return Promise.resolve();
  }

  public events(): readonly RecordedSecurityEvent[] {
    return [...this.values];
  }
}
