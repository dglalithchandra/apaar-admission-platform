export class IdempotencyConflictError extends Error {
  public constructor() {
    super('The idempotency key was already used with different request content.');
    this.name = 'IdempotencyConflictError';
  }
}

export class PersistenceInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PersistenceInvariantError';
  }
}

export class InvalidDatabaseConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidDatabaseConfigurationError';
  }
}
