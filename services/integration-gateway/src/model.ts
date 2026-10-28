export const GATEWAY_ROLES = [
  'INSTITUTION_OPERATOR',
  'INSTITUTION_ADMINISTRATOR',
  'AICTE_REVIEWER',
  'AICTE_CHECKER',
  'AUDITOR',
  'AUTHORIZED_VERIFIER',
  'SERVICE_INTEGRATION_CLIENT',
] as const;
export type GatewayRole = (typeof GATEWAY_ROLES)[number];

export interface Principal {
  readonly actorReference: string;
  readonly institutionId: string | null;
  readonly organisationReference: string;
  readonly roles: readonly GatewayRole[];
}

export interface AuthenticationPort {
  authenticate(authorization: string | undefined): Promise<Principal | null>;
}

export type GatewayAction =
  | 'OVERSIGHT_READ'
  | 'ADMISSION_WRITE'
  | 'BATCH_WRITE'
  | 'RECORD_READ'
  | 'CASE_CREATE'
  | 'CASE_READ'
  | 'CASE_INSTITUTION_ACT'
  | 'CASE_RECOMMEND'
  | 'CASE_DECIDE'
  | 'METADATA_READ'
  | 'IDENTITY_VERIFY'
  | 'APPROVAL_IMPORT'
  | 'NOTIFICATION_PROCESS'
  | 'VERIFICATION_CREATE'
  | 'VERIFICATION_READ'
  | 'VERIFICATION_REVOKE'
  | 'PILOT_READ'
  | 'PILOT_INSTITUTION_READ'
  | 'PILOT_MANAGE'
  | 'PILOT_ACTIVATE'
  | 'PILOT_MIGRATE'
  | 'AUDIT_READ';

export class GatewayProblem extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayProblem';
  }
}

export interface GatewayClock {
  now(): string;
}

export interface GatewayTelemetryPort {
  record(input: {
    readonly durationMilliseconds: number;
    readonly method: string;
    readonly route: string;
    readonly status: number;
  }): void;
  prometheus(): string;
}

export interface SecurityEventPort {
  record(input: {
    readonly actorReference: string;
    readonly correlationReference: string;
    readonly details: Readonly<Record<string, unknown>>;
    readonly eventCode: string;
  }): Promise<void>;
}

export type AcademicIdentityStatus =
  | 'VERIFIED'
  | 'NOT_FOUND'
  | 'MISMATCH'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NOT_ELIGIBLE_FOR_APAAR'
  | 'MANUAL_REVIEW'
  | 'UNVERIFIED';

export interface AcademicIdentityResult {
  readonly checkedAt: string;
  readonly providerContractVersion: string;
  readonly providerRequestReference: string | null;
  readonly status: AcademicIdentityStatus;
}

export interface AcademicIdentityPort {
  verify(input: {
    readonly academicIdentity: string;
    readonly correlationReference: string;
    readonly purpose: 'ADMISSION_LINKING' | 'CORRECTION_REVIEW';
  }): Promise<AcademicIdentityResult>;
}

export interface ApprovalImportManifest {
  readonly authority: 'SOURCE_CONFIRMED' | 'AUTHORITY_CONFIGURED' | 'PROPOSED';
  readonly campusId: string;
  readonly courseId: string;
  readonly digestSha256: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly importReference: string;
  readonly integrity: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly signature: string;
  };
  readonly institutionId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly programmeId: string;
  readonly sourceSystem: string;
  readonly sourceVersion: string;
  readonly supersedesImportReference: string | null;
}

export interface ApprovalIntegrityPort {
  verify(manifest: ApprovalImportManifest): Promise<boolean>;
}

export interface ApprovalImportResult {
  readonly importReference: string;
  readonly replayed: boolean;
  readonly status: 'IMPORTED' | 'PROPOSED';
}

export interface ApprovalImportPort {
  import(manifest: ApprovalImportManifest, principal: Principal): Promise<ApprovalImportResult>;
}

export interface NotificationDelivery {
  readonly attemptCount: number;
  readonly destinationReference: string;
  readonly messageCode: string;
  readonly notificationId: string;
  readonly state: 'PENDING' | 'IN_FLIGHT' | 'DELIVERED' | 'RETRYABLE' | 'DEAD_LETTER';
}

export interface NotificationGatewayPort {
  deliver(delivery: NotificationDelivery): Promise<'DELIVERED' | 'RETRYABLE' | 'FAILED'>;
}

export interface NotificationRepositoryPort {
  claim(now: string): Promise<NotificationDelivery | null>;
  complete(
    notificationId: string,
    outcome: 'DELIVERED' | 'RETRYABLE' | 'DEAD_LETTER',
    availableAt: string | null,
  ): Promise<void>;
}

export interface AdmissionFacts {
  readonly academicYear: string;
  readonly admissionReference: string;
  readonly currentStatus: string;
  readonly institutionReference: string;
  readonly programmeReference: string;
}

export type VerificationClaim =
  'ADMISSION_EXISTS' | 'INSTITUTION' | 'PROGRAMME' | 'ACADEMIC_YEAR' | 'CURRENT_STATUS';

export interface VerificationReceipt {
  readonly algorithm: string;
  readonly claims: Readonly<Record<string, string | boolean>>;
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly keyId: string;
  readonly legalBasisReference: string;
  readonly purpose: string;
  readonly requesterOrganisation: string;
  readonly signature: string;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  readonly verificationReference: string;
}

export interface AdmissionFactsPort {
  get(admissionReference: string): Promise<AdmissionFacts | null>;
}

export interface SigningPort {
  exportPublicKey?(): { readonly keyId: string; readonly pem: string };
  sign(
    payload: string,
  ): Promise<{ readonly algorithm: string; readonly keyId: string; readonly signature: string }>;
  verify(
    payload: string,
    signed: { readonly algorithm: string; readonly keyId: string; readonly signature: string },
  ): Promise<boolean>;
}

export interface VerificationReceiptPort {
  find(
    idempotencyKey: string,
  ): Promise<{ readonly hash: string; readonly receipt: VerificationReceipt } | null>;
  save(idempotencyKey: string, hash: string, receipt: VerificationReceipt): Promise<void>;
  findByReference(verificationReference: string): Promise<VerificationReceipt | null>;
  revoke(verificationReference: string, reason: string, actor: string, at: string): Promise<void>;
}

export interface ExistingServiceTransportPort {
  execute(
    operation: string,
    input: Readonly<Record<string, unknown>>,
    principal: Principal,
  ): Promise<GatewayTransportResponse>;
}

export interface OperationalEvent {
  readonly aggregateReference: string;
  readonly aggregateType: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly sequence: number;
}

export interface OperationalEventStreamPort {
  list(
    principal: Principal,
    afterSequence: number,
    limit: number,
  ): Promise<readonly OperationalEvent[]>;
}

export interface GatewayTransportResponse {
  readonly body: unknown;
  readonly contentType?: 'application/json' | 'text/csv' | 'text/html';
  readonly headers?: Readonly<Record<string, string>>;
  readonly status: number;
}

export interface ContractValidationPort {
  validateRequest(operationId: string, input: Readonly<Record<string, unknown>>): void;
  validateResponse(operationId: string, response: GatewayTransportResponse): void;
}
