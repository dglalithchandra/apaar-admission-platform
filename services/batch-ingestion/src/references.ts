import { randomUUID } from 'node:crypto';
import type { BatchReferenceGenerator } from './ports.js';

export class UuidBatchReferenceGenerator implements BatchReferenceGenerator {
  public next(kind: Parameters<BatchReferenceGenerator['next']>[0]): string {
    return `${kind}-${randomUUID()}`;
  }
}
