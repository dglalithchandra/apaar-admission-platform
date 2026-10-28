import { describe, expect, it } from 'vitest';
import { syntheticAcademicIdentityKey } from '../../src/synthetic-identity-key.js';
describe('synthetic canonical identity binding', () => {
  it('is stable for one academic identity and distinct for another', () => {
    expect(syntheticAcademicIdentityKey('SYNTH-IDENTITY-001')).toBe(
      syntheticAcademicIdentityKey('SYNTH-IDENTITY-001'),
    );
    expect(syntheticAcademicIdentityKey('SYNTH-IDENTITY-001')).not.toBe(
      syntheticAcademicIdentityKey('SYNTH-IDENTITY-002'),
    );
  });
  it.each(['', 'UNTRUSTED-REFERENCE'])('rejects a non-synthetic reference', (reference) => {
    expect(() => syntheticAcademicIdentityKey(reference)).toThrow(TypeError);
  });
});
