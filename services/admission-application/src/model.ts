export const ADMISSION_VALIDATION_PROFILE_VERSION = 'handbook-evidence/3';
import type {
  AdmissionPolicyDecision,
  ApprovalSnapshot,
  StudentAdmission,
} from '@apaar-platform/admission-domain';

export interface AdmissionCommandContext {
  readonly institutionId: StudentAdmission['institutionId'];
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly actorReference: string;
  readonly reason: string;
  readonly correlationReference: string;
  readonly requestReference: string;
}

export interface SubmitAdmissionCommand {
  readonly context: AdmissionCommandContext;
  readonly admission: StudentAdmission;
}

export interface AdmissionSubmissionReferences {
  readonly idempotencyRecordId: string;
  readonly admissionId: string;
  readonly decisionId: string;
  readonly identityVerificationId: string;
  readonly auditEventId: string;
  readonly outboxEventId: string;
  readonly registrationReference: string | null;
}

export interface AdmissionSubmissionResult {
  readonly validationProfileVersion?: string;
  readonly admissionId: string;
  readonly admissionReference: string | null;
  readonly decisionId: string;
  readonly decision: AdmissionPolicyDecision;
  readonly replayed: boolean;
}

export interface PersistAdmissionOutcome {
  readonly command: SubmitAdmissionCommand;
  readonly approval: ApprovalSnapshot | null;
  readonly decision: AdmissionPolicyDecision;
  readonly references: AdmissionSubmissionReferences;
  readonly occurredAt: StudentAdmission['identityVerification']['checkedAt'];
}

export interface ApprovalImportCommand {
  readonly snapshot: ApprovalSnapshot;
  readonly supersedesSnapshotId?: string;
  readonly supersessionReason?: string;
}

export interface ReferenceGenerator {
  next(kind: 'ADMISSION' | 'DECISION' | 'IDENTITY' | 'AUDIT' | 'OUTBOX' | 'REGISTRATION'): string;
}
