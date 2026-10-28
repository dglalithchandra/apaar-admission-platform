import type { AdmissionFacts, GatewayClock, Principal, VerificationClaim } from './model.js';
import { GatewayProblem } from './model.js';
import type { CreateVerificationInput } from './verification.js';

export interface VerificationGrant {
  readonly reference: string;
  readonly kind: 'CONSENT' | 'LEGAL_BASIS';
  readonly admissionReference: string | null;
  readonly institutionReference: string;
  readonly recipientOrganisation: string;
  readonly purpose: string;
  readonly claims: readonly VerificationClaim[];
  readonly validFrom: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export interface VerificationGrantRepository {
  find(reference: string): Promise<VerificationGrant | null>;
}

export interface VerificationAuthorizationPort {
  assertAllowed(
    input: CreateVerificationInput,
    facts: AdmissionFacts,
    principal: Principal,
  ): Promise<{ readonly expiresAt: string }>;
}

export class GrantVerificationAuthorization implements VerificationAuthorizationPort {
  public constructor(
    private readonly repository: VerificationGrantRepository,
    private readonly clock: GatewayClock,
  ) {}

  public async assertAllowed(
    input: CreateVerificationInput,
    facts: AdmissionFacts,
    principal: Principal,
  ): Promise<{ readonly expiresAt: string }> {
    const reference = input.consentReference ?? input.legalBasisReference;
    if (
      !reference?.trim() ||
      (input.consentReference !== null && input.legalBasisReference !== null)
    ) {
      throw new GatewayProblem(
        'VERIFICATION_GRANT_REQUIRED',
        403,
        'Exactly one registered consent or legal basis is required.',
      );
    }
    const grant = await this.repository.find(reference);
    const now = Date.parse(this.clock.now());
    if (
      grant === null ||
      grant.revoked ||
      grant.kind !== (input.consentReference !== null ? 'CONSENT' : 'LEGAL_BASIS') ||
      grant.recipientOrganisation !== principal.organisationReference ||
      grant.purpose !== input.purpose ||
      grant.institutionReference !== facts.institutionReference ||
      (grant.kind === 'CONSENT' && grant.admissionReference === null) ||
      (grant.admissionReference !== null &&
        grant.admissionReference !== input.admissionReference) ||
      !Number.isFinite(now) ||
      !Number.isFinite(Date.parse(grant.validFrom)) ||
      !Number.isFinite(Date.parse(grant.expiresAt)) ||
      now < Date.parse(grant.validFrom) ||
      now >= Date.parse(grant.expiresAt) ||
      !input.requestedClaims.every((claim) => grant.claims.includes(claim))
    ) {
      throw new GatewayProblem(
        'VERIFICATION_GRANT_DENIED',
        403,
        'The authorization grant is unavailable, out of scope, expired or withdrawn.',
      );
    }
    return { expiresAt: grant.expiresAt };
  }
}
