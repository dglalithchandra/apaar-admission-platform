import type {
  ApprovalSnapshot,
  ApprovalSnapshotRepository,
  CapacityUsage,
  Clock,
  StudentAdmission,
} from '@apaar-platform/admission-domain';
import type {
  AdmissionSubmissionResult,
  ApprovalImportCommand,
  PersistAdmissionOutcome,
  SubmitAdmissionCommand,
} from './model.js';

export interface AdmissionTransaction extends ApprovalSnapshotRepository {
  classifyStudentConflict(admission: StudentAdmission): Promise<'NONE' | 'EXACT' | 'POTENTIAL'>;
  loadCapacityUsageForUpdate(approval: ApprovalSnapshot): Promise<CapacityUsage>;
  persistOutcome(outcome: PersistAdmissionOutcome): Promise<void>;
}

export interface IdempotentTransactionOptions {
  readonly institutionId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly idempotencyRecordId: string;
}

export interface AdmissionUnitOfWork {
  runIdempotent(
    options: IdempotentTransactionOptions,
    work: (transaction: AdmissionTransaction) => Promise<AdmissionSubmissionResult>,
  ): Promise<AdmissionSubmissionResult>;
}

export interface ApprovalSnapshotWriter {
  importSnapshot(command: ApprovalImportCommand): Promise<void>;
}

export interface ApplicationDependencies {
  readonly unitOfWork: AdmissionUnitOfWork;
  readonly clock: Clock;
}

export interface AdmissionCommandValidator {
  validate(command: SubmitAdmissionCommand): void;
}
