import { createHash } from 'node:crypto';
import type { VerificationAuthorizationPort } from './verification-authorization.js';
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

const ALLOWED_CLAIMS = new Set<VerificationClaim>([
  'ACADEMIC_YEAR',
  'ADMISSION_EXISTS',
  'CURRENT_STATUS',
  'INSTITUTION',
  'PROGRAMME',
]);

export function verificationSigningPayload(
  receipt: Omit<VerificationReceipt, 'algorithm' | 'keyId' | 'signature'>,
): string {
  return JSON.stringify({
    claims: Object.fromEntries(
      Object.entries(receipt.claims).sort(([left], [right]) => left.localeCompare(right)),
    ),
    expiresAt: receipt.expiresAt,
    issuedAt: receipt.issuedAt,
    legalBasisReference: receipt.legalBasisReference,
    purpose: receipt.purpose,
    requesterOrganisation: receipt.requesterOrganisation,
    status: 'ACTIVE',
    verificationReference: receipt.verificationReference,
  });
}

export class VerificationService {
  public constructor(
    private readonly facts: AdmissionFactsPort,
    private readonly receipts: VerificationReceiptPort,
    private readonly signer: SigningPort,
    private readonly clock: GatewayClock,
    private readonly nextReference: () => string,
    private readonly authorization: VerificationAuthorizationPort,
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
    if (
      new Set(input.requestedClaims).size !== input.requestedClaims.length ||
      !input.requestedClaims.every((claim) => ALLOWED_CLAIMS.has(claim))
    ) {
      throw new GatewayProblem(
        'VERIFICATION_CLAIMS_INVALID',
        422,
        'The requested verification claims are invalid.',
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
    const facts = await this.facts.get(input.admissionReference);
    if (facts === null)
      throw new GatewayProblem('ADMISSION_NOT_FOUND', 404, 'The admission is not visible.');
    const authorization = await this.authorization.assertAllowed(input, facts, principal);
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
    const issuedAt = this.clock.now();
    const unsigned = {
      claims: pickClaims(facts, input.requestedClaims),
      expiresAt: new Date(
        Math.min(Date.parse(authorization.expiresAt), Date.parse(issuedAt) + 15 * 60_000),
      ).toISOString(),
      issuedAt,
      legalBasisReference: legalBasis,
      purpose: input.purpose,
      requesterOrganisation: principal.organisationReference,
      status: 'ACTIVE' as const,
      verificationReference: this.nextReference(),
    };
    const signed = await this.signer.sign(verificationSigningPayload(unsigned));
    const receipt: VerificationReceipt = { ...unsigned, ...signed };
    try {
      await this.receipts.save(input.idempotencyKey, requestHash, receipt);
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'constraint' in error &&
        error.constraint === 'verification_grant_active'
      ) {
        throw new GatewayProblem(
          'VERIFICATION_GRANT_DENIED',
          403,
          'Authorization changed before the receipt could be issued.',
        );
      }
      throw error;
    }
    return receipt;
  }
}

export class VerificationStatusService {
  public constructor(
    private readonly receipts: VerificationReceiptPort,
    private readonly clock: GatewayClock,
    private readonly signer: SigningPort,
  ) {}

  public async get(reference: string): Promise<VerificationReceipt> {
    const receipt = await this.receipts.findByReference(reference);
    if (receipt === null) {
      throw new GatewayProblem('VERIFICATION_NOT_FOUND', 404, 'The verification was not found.');
    }
    const { algorithm, keyId, signature, ...unsigned } = receipt;
    if (
      !(await this.signer.verify(verificationSigningPayload(unsigned), {
        algorithm,
        keyId,
        signature,
      }))
    ) {
      throw new GatewayProblem(
        'VERIFICATION_SIGNATURE_INVALID',
        502,
        'The verification receipt signature is invalid.',
      );
    }
    if (receipt.status === 'REVOKED') return receipt;
    return Date.parse(receipt.expiresAt) <= Date.parse(this.clock.now())
      ? { ...receipt, status: 'EXPIRED' }
      : receipt;
  }

  public async revoke(reference: string, reason: string, principal: Principal): Promise<void> {
    if (reason.trim() === '') {
      throw new GatewayProblem(
        'REVOCATION_REASON_REQUIRED',
        422,
        'A revocation reason is required.',
      );
    }
    await this.get(reference);
    await this.receipts.revoke(reference, reason, principal.actorReference, this.clock.now());
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

  public verify(
    payload: string,
    signed: { readonly algorithm: string; readonly keyId: string; readonly signature: string },
  ): Promise<boolean> {
    return Promise.resolve(
      signed.algorithm === 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION' &&
        signed.keyId === 'SYNTH-SIGNING-KEY-001' &&
        signed.signature === createHash('sha256').update(`SYNTHETIC:${payload}`).digest('hex'),
    );
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

  public findByReference(verificationReference: string): Promise<VerificationReceipt | null> {
    for (const value of this.receipts.values()) {
      if (value.receipt.verificationReference === verificationReference) {
        return Promise.resolve(value.receipt);
      }
    }
    return Promise.resolve(null);
  }

  public revoke(
    verificationReference: string,
    _reason: string,
    _actor: string,
    _at: string,
  ): Promise<void> {
    for (const [key, value] of this.receipts.entries()) {
      if (value.receipt.verificationReference === verificationReference) {
        this.receipts.set(key, { ...value, receipt: { ...value.receipt, status: 'REVOKED' } });
        return Promise.resolve();
      }
    }
    return Promise.resolve();
  }
}

export class InMemoryAdmissionFacts implements AdmissionFactsPort {
  public constructor(private readonly facts: ReadonlyMap<string, AdmissionFacts>) {}

  public get(admissionReference: string): Promise<AdmissionFacts | null> {
    return Promise.resolve(this.facts.get(admissionReference) ?? null);
  }
}
