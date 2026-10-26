import { describe, expect, it } from 'vitest';
import { CaseworkConflictError, CaseworkError } from '../../src/errors.js';

describe('casework errors', () => {
  it('preserves stable findings and conflict names', () => {
    expect(
      new CaseworkError({ code: 'ACTION_FORBIDDEN', explanation: 'Synthetic denial.' }),
    ).toMatchObject({ name: 'CaseworkError', message: 'Synthetic denial.' });
    expect(new CaseworkConflictError('Synthetic conflict.')).toMatchObject({
      name: 'CaseworkConflictError',
      message: 'Synthetic conflict.',
    });
  });
});
