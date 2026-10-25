import type {
  AdmissionSubmissionResult,
  SubmitAdmissionCommand,
} from '@apaar-platform/admission-application';
import type {
  BatchReceipt,
  BatchFinding,
  BatchRowResult,
  BatchSourceFile,
  BatchStatus,
  BatchSummary,
  ClaimedBatchRow,
  CompletedBatchRow,
  IdentityVerificationRequest,
  IdentityVerificationResponse,
  ParsedBatchRow,
} from './model.js';

export interface BatchReferenceGenerator {
  next(kind: 'BATCH' | 'OBJECT' | 'RECEIPT' | 'ROW'): string;
}

export interface BatchClock {
  now(): string;
}

export interface ObjectStoragePort {
  put(
    reference: string,
    content: readonly Buffer[],
    metadata: Readonly<Record<string, string>>,
  ): Promise<void>;
}

export interface MalwareScannerPort {
  scan(content: readonly Buffer[]): Promise<'CLEAN' | 'INFECTED' | 'UNAVAILABLE'>;
}

export interface AcademicIdentityVerifierPort {
  verify(request: IdentityVerificationRequest): Promise<IdentityVerificationResponse>;
}

export interface AdmissionSubmissionPort {
  execute(command: SubmitAdmissionCommand): Promise<AdmissionSubmissionResult>;
}

export interface RegisterBatchInput {
  readonly actorReference: string;
  readonly batchId: string;
  readonly idempotencyKey: string;
  readonly institutionId: string;
  readonly reason: string;
  readonly receiptReference: string;
  readonly receivedAt: string;
  readonly requestHash: string;
  readonly requestReference: string;
  readonly source: BatchSourceFile;
  readonly templateVersion: string;
}

export interface RegisterBatchResult {
  readonly receipt: BatchReceipt;
  readonly shouldProcess: boolean;
}

export interface BatchRepositoryPort {
  register(input: RegisterBatchInput): Promise<RegisterBatchResult>;
  transition(batchId: string, expected: BatchStatus, next: BatchStatus): Promise<void>;
  saveRows(batchId: string, rows: readonly ParsedBatchRow[]): Promise<void>;
  failBatch(batchId: string, findings: readonly BatchFinding[]): Promise<void>;
  claimRows(
    batchId: string,
    workerId: string,
    limit: number,
    leasedUntil: string,
  ): Promise<readonly ClaimedBatchRow[]>;
  completeRow(rowId: string, workerId: string, completed: CompletedBatchRow): Promise<void>;
  deferRow(
    rowId: string,
    workerId: string,
    finding: BatchFindingInput,
    retryable: boolean,
  ): Promise<void>;
  reconcile(batchId: string): Promise<BatchSummary>;
  getSummary(batchId: string): Promise<BatchSummary | null>;
  listRows(batchId: string): Promise<readonly BatchRowResult[]>;
  correctionRows(batchId: string): Promise<readonly ParsedBatchRow[]>;
}

export interface BatchFindingInput {
  readonly code: 'IDENTITY_PROVIDER_RETRYABLE' | 'PROCESSING_RETRY_EXHAUSTED';
  readonly message: string;
}
