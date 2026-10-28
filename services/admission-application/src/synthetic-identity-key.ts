import { createHash } from 'node:crypto';
import { asStudentKey, type StudentKey } from '@apaar-platform/admission-domain';
/** Synthetic-only identity binding. A live verifier must supply its trusted opaque canonical key. */
export function syntheticAcademicIdentityKey(reference: string): StudentKey {
  if (!reference.startsWith('SYNTH-'))
    throw new TypeError('Only a synthetic identity can use this key derivation.');
  return asStudentKey(
    `SYNTH-CANONICAL-${createHash('sha256').update(`SYNTH-CANONICAL:${reference}`).digest('hex')}`,
  );
}
