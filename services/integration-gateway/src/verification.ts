import { createHash } from 'node:crypto';
import type {
  AdmissionFacts,
  AdmissionFactsPort,
  GatewayClock,
  Principal,
  SigningPort,
  VerificationClaim,
  VerificationReceipt,
  VerificationReceiptPort,
} from './model.js';
import { GatewayProblem } from './model.js';

export interface CreateVerificationInput {
  readonly admissionReference: string;
  readonly consentReference: string | null;
  readonly idempotencyKey: string;
  readonly legalBasisReference: string | null;
  readonly purpose: string;
  readonly requestedClaims: readonly VerificationClaim[];
}

function hash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function pickClaims(
  facts: AdmissionFacts,
  claims: readonly VerificationClaim[],
): Readonly<Record<string, string | boolean>> {
  const available: Readonly<Record<VerificationClaim, string | boolean>> = {
    ACADEMIC_YEAR: facts.academicYear,
    ADMISSION_EXISTS: true,
    CURRENT_STATUS: facts.currentStatus,
    INSTITUTION: facts.institutionReference,
    PROGRAMME: facts.programmeReference,
  };
  return Object.fromEntries(claims.map((claim) => [claim, available[claim]]));
}

export class VerificationService {
  public constructor(
    private readonly facts: AdmissionFactsPort,
    private readonly receipts: VerificationReceiptPort,
    private readonly signer: SigningPort,
    private readonly clock: GatewayClock,
    private readonly nextReference: () => string,
  ) {}

  public async create(
    input: CreateVerificationInput,
    principal: Principal,
  ): Promise<VerificationReceipt> {
    if (input.purpose.trim() === '' || input.requestedClaims.length === 0) {
      throw new GatewayProblem(
        'VERIFICATION_PURPOSE_REQUIRED',
        422,
        'Purpose and claims are required.',
      );
    }
    const legalBasis = input.consentReference ?? input.legalBasisReference;
    if (legalBasis === null) {
      throw new GatewayProblem(
        'LEGAL_BASIS_REQUIRED',
        403,
        'Consent or an approved legal basis is required.',
      );
    }
    const requestHash = hash(input);
    const prior = await this.receipts.find(input.idempotencyKey);
    if (prior !== null) {
      if (prior.hash !== requestHash) {
        throw new GatewayProblem(
          'IDEMPOTENCY_CONFLICT',
          409,
          'The idempotency key was reused for another request.',
        );
      }
      return prior.receipt;
    }
    const facts = await this.facts.get(input.admissionReference);
    if (facts === null)
      throw new GatewayProblem('ADMISSION_NOT_FOUND', 404, 'The admission is not visible.');
    const issuedAt = this.clock.now();
    const unsigned = {
      claims: pickClaims(facts, input.requestedClaims),
      expiresAt: new Date(Date.parse(issuedAt) + 15 * 60_000).toISOString(),
      issuedAt,
      legalBasisReference: legalBasis,
      purpose: input.purpose,
      requesterOrganisation: principal.organisationReference,
      status: 'ACTIVE' as const,
      verificationReference: this.nextReference(),
    };
    const signed = await this.signer.sign(JSON.stringify(unsigned));
    const receipt: VerificationReceipt = { ...unsigned, ...signed };
    await this.receipts.save(input.idempotencyKey, requestHash, receipt);
    return receipt;
  }
}

export class SyntheticSigningAdapter implements SigningPort {
  public sign(
    payload: string,
  ): Promise<{ readonly algorithm: string; readonly keyId: string; readonly signature: string }> {
    return Promise.resolve({
      algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
      keyId: 'SYNTH-SIGNING-KEY-001',
      signature: createHash('sha256').update(`SYNTHETIC:${payload}`).digest('hex'),
    });
  }
}

export class InMemoryVerificationReceiptRepository implements VerificationReceiptPort {
  private readonly receipts = new Map<
    string,
    { readonly hash: string; readonly receipt: VerificationReceipt }
  >();

  public find(
    idempotencyKey: string,
  ): Promise<{ readonly hash: string; readonly receipt: VerificationReceipt } | null> {
    return Promise.resolve(this.receipts.get(idempotencyKey) ?? null);
  }

  public save(
    idempotencyKey: string,
    requestHash: string,
    receipt: VerificationReceipt,
  ): Promise<void> {
    this.receipts.set(idempotencyKey, { hash: requestHash, receipt });
    return Promise.resolve();
  }
}

export class InMemoryAdmissionFacts implements AdmissionFactsPort {
  public constructor(private readonly facts: ReadonlyMap<string, AdmissionFacts>) {}

  public get(admissionReference: string): Promise<AdmissionFacts | null> {
    return Promise.resolve(this.facts.get(admissionReference) ?? null);
  }
}
