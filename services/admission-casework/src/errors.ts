import type { CaseFinding } from './model.js';

export class CaseworkError extends Error {
  public constructor(
    public readonly finding: CaseFinding,
    message = finding.explanation,
  ) {
    super(message);
    this.name = 'CaseworkError';
  }
}

export class CaseworkConflictError extends Error {
  public constructor(
    message: string,
    public readonly code:
      | 'CASE_VERSION_CONFLICT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'POLICY_AUTHORITY_REQUIRED'
      | 'PERSISTENCE_CONFLICT' = 'PERSISTENCE_CONFLICT',
  ) {
    super(message);
    this.name = 'CaseworkConflictError';
  }
}
