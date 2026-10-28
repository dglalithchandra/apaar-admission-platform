import { describe, expect, it } from 'vitest';
import {
  GrantVerificationAuthorization,
  type VerificationGrant,
} from '../../src/verification-authorization.js';

const grant: VerificationGrant = {
  reference: 'SYNTH-CONSENT-GRANT',
  kind: 'CONSENT',
  admissionReference: 'SYNTH-ADMISSION',
  institutionReference: 'SYNTH-INSTITUTION',
  recipientOrganisation: 'SYNTH-RECIPIENT',
  purpose: 'SYNTH-PURPOSE',
  claims: ['ADMISSION_EXISTS'],
  validFrom: '2026-01-01T00:00:00Z',
  expiresAt: '2026-12-31T00:00:00Z',
  revoked: false,
};
const input = {
  admissionReference: 'SYNTH-ADMISSION',
  consentReference: grant.reference,
  legalBasisReference: null,
  idempotencyKey: 'SYNTH-IDEMPOTENCY',
  purpose: 'SYNTH-PURPOSE',
  requestedClaims: ['ADMISSION_EXISTS'] as const,
};
const principal = {
  actorReference: 'SYNTH-ACTOR',
  institutionId: null,
  organisationReference: 'SYNTH-RECIPIENT',
  roles: ['AUTHORIZED_VERIFIER'] as const,
};
const facts = {
  admissionReference: 'SYNTH-ADMISSION',
  institutionReference: 'SYNTH-INSTITUTION',
  academicYear: '2026-27',
  currentStatus: 'ACCEPTED',
  programmeReference: 'SYNTH-PROGRAMME',
};
function service(record: VerificationGrant | null, now = '2026-10-28T00:00:00Z') {
  return new GrantVerificationAuthorization(
    { find: () => Promise.resolve(record) },
    { now: () => now },
  );
}

describe('verification grant authorization', () => {
  it('accepts only a registered scoped grant', async () => {
    await expect(service(grant).assertAllowed(input, facts, principal)).resolves.toEqual({
      expiresAt: grant.expiresAt,
    });
  });
  it.each([
    null,
    { ...grant, revoked: true },
    { ...grant, kind: 'LEGAL_BASIS' as const },
    { ...grant, recipientOrganisation: 'SYNTH-OTHER' },
    { ...grant, purpose: 'SYNTH-OTHER' },
    { ...grant, institutionReference: 'SYNTH-OTHER' },
    { ...grant, admissionReference: null },
    { ...grant, admissionReference: 'SYNTH-OTHER' },
    { ...grant, claims: [] },
    { ...grant, validFrom: '2027-01-01T00:00:00Z' },
    { ...grant, expiresAt: '2026-10-28T00:00:00Z' },
    { ...grant, validFrom: 'invalid' },
    { ...grant, expiresAt: 'invalid' },
  ])('denies missing, withdrawn, mismatched or expired grants: %j', async (record) => {
    await expect(service(record).assertAllowed(input, facts, principal)).rejects.toMatchObject({
      code: 'VERIFICATION_GRANT_DENIED',
    });
  });
  it('denies ambiguous, blank and missing references', async () => {
    for (const changed of [
      { ...input, legalBasisReference: 'SYNTH-LEGAL' },
      { ...input, consentReference: '' },
      { ...input, consentReference: null },
    ]) {
      await expect(service(grant).assertAllowed(changed, facts, principal)).rejects.toMatchObject({
        code: 'VERIFICATION_GRANT_REQUIRED',
      });
    }
  });
  it('denies invalid evaluation time', async () => {
    await expect(
      service(grant, 'invalid').assertAllowed(input, facts, principal),
    ).rejects.toMatchObject({ code: 'VERIFICATION_GRANT_DENIED' });
  });
  it('accepts a registered institution-scoped legal basis', async () => {
    await expect(
      service({ ...grant, kind: 'LEGAL_BASIS', admissionReference: null }).assertAllowed(
        { ...input, consentReference: null, legalBasisReference: grant.reference },
        facts,
        principal,
      ),
    ).resolves.toEqual({ expiresAt: grant.expiresAt });
  });
});
