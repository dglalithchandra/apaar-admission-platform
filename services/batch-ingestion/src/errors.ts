import type { BatchFinding } from './model.js';

export class BatchValidationError extends Error {
  public constructor(
    message: string,
    public readonly findings: readonly BatchFinding[],
  ) {
    super(message);
    this.name = 'BatchValidationError';
  }
}

export class BatchIdempotencyConflictError extends Error {
  public constructor() {
    super('The upload idempotency key was already used for different content.');
    this.name = 'BatchIdempotencyConflictError';
  }
}

export class BatchPersistenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BatchPersistenceError';
  }
}
