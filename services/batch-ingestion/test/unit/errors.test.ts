import { describe, expect, it } from 'vitest';
import {
  BatchIdempotencyConflictError,
  BatchPersistenceError,
  BatchValidationError,
} from '../../src/errors.js';

describe('stable batch errors', () => {
  it('exposes distinct names and safe messages', () => {
    const validation = new BatchValidationError('Synthetic validation failure.', []);
    const conflict = new BatchIdempotencyConflictError();
    const persistence = new BatchPersistenceError('Synthetic persistence failure.');

    expect(validation).toMatchObject({ name: 'BatchValidationError', findings: [] });
    expect(conflict).toMatchObject({ name: 'BatchIdempotencyConflictError' });
    expect(persistence).toMatchObject({ name: 'BatchPersistenceError' });
  });
});
