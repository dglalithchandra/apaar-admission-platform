import { describe, expect, it } from 'vitest';
import {
  InMemoryAdmissionFacts,
  InMemoryVerificationReceiptRepository,
  SyntheticSigningAdapter,
  VerificationService,
} from '../../src/verification.js';
import type { Principal } from '../../src/model.js';
class FailingReceipts extends InMemoryVerificationReceiptRepository {
  public constructor(private readonly failure: unknown) {
    super();
  }
  public override save(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Exercise malformed persistence-provider rejections deliberately.
    return Promise.reject(this.failure);
  }
}
const principal: Principal = {
  actorReference: 'SYNTH-ACTOR',
  organisationReference: 'SYNTH-ORG',
  institutionId: null,
  roles: ['AUTHORIZED_VERIFIER'],
};
const input = {
  admissionReference: 'SYNTH-ADMISSION',
  consentReference: 'SYNTH-GRANT',
  legalBasisReference: null,
  idempotencyKey: 'SYNTH-IDEMPOTENCY',
  purpose: 'SYNTH-PURPOSE',
  requestedClaims: ['ADMISSION_EXISTS'] as const,
};
function service(failure: unknown) {
  return new VerificationService(
    new InMemoryAdmissionFacts(
      new Map([
        [
          'SYNTH-ADMISSION',
          {
            admissionReference: 'SYNTH-ADMISSION',
            academicYear: '2026-27',
            currentStatus: 'ACCEPTED',
            institutionReference: 'SYNTH-INSTITUTION',
            programmeReference: 'SYNTH-PROGRAMME',
          },
        ],
      ]),
    ),
    new FailingReceipts(failure),
    new SyntheticSigningAdapter(),
    { now: () => '2026-10-28T00:00:00Z' },
    () => 'SYNTH-VERIFICATION',
    { assertAllowed: () => Promise.resolve({ expiresAt: '2027-01-01T00:00:00.000Z' }) },
  );
}
describe('verification persistence failures', () => {
  it('returns a grant denial when authorization is withdrawn during issuance', async () => {
    await expect(
      service({ constraint: 'verification_grant_active' }).create(input, principal),
    ).rejects.toMatchObject({ code: 'VERIFICATION_GRANT_DENIED', status: 403 });
  });
  it.each([new Error('SYNTH-STORAGE-FAILURE'), null, 'SYNTH-FAILURE', {}])(
    'preserves unrelated infrastructure failures: %j',
    async (failure) => {
      await expect(service(failure).create(input, principal)).rejects.toBe(failure);
    },
  );
});
