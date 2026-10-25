import type {
  AdmissionCategory,
  AcademicIdentityVerification,
  StudentAdmission,
} from '@apaar-platform/admission-domain';

export const CURRENT_TEMPLATE_VERSION = '1.0' as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_ROWS = 10_000;
export const MAX_FIELD_CHARACTERS = 256;
export const MAX_PROCESSING_ATTEMPTS = 3;

export const BATCH_STATUSES = [
  'RECEIVED',
  'SCANNING',
  'VALIDATING',
  'PROCESSING',
  'NEEDS_ACTION',
  'COMPLETED',
  'FAILED',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const ROW_STATUSES = [
  'RECEIVED',
  'VALID',
  'INVALID',
  'PROCESSING',
  'ACCEPTED',
  'REJECTED',
  'MANUAL_REVIEW',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
] as const;
export type BatchRowStatus = (typeof ROW_STATUSES)[number];

export type BatchFindingSeverity = 'ERROR' | 'REVIEW' | 'WARNING';

export type BatchRuleCode =
  | 'BATCH_EMPTY'
  | 'BATCH_FILE_TOO_LARGE'
  | 'BATCH_MALFORMED_CSV'
  | 'BATCH_MALWARE_DETECTED'
  | 'BATCH_FILENAME_INVALID'
  | 'BATCH_ROW_LIMIT_EXCEEDED'
  | 'BATCH_SCANNER_UNAVAILABLE'
  | 'BATCH_UNSUPPORTED_MEDIA_TYPE'
  | 'BATCH_UTF8_REQUIRED'
  | 'DUPLICATE_HEADER'
  | 'DUPLICATE_RECORD_KEY'
  | 'FIELD_INVALID'
  | 'FIELD_REQUIRED'
  | 'FORMULA_PREFIX_REJECTED'
  | 'IDENTITY_PROVIDER_RETRYABLE'
  | 'MISSING_HEADER'
  | 'PROCESSING_RETRY_EXHAUSTED'
  | 'TEMPLATE_VERSION_UNSUPPORTED'
  | 'UNKNOWN_HEADER';

export interface BatchFinding {
  readonly code: BatchRuleCode;
  readonly field: string | null;
  readonly message: string;
  readonly severity: BatchFindingSeverity;
}

export interface BatchSourceFile {
  readonly byteSize: number;
  readonly contentType: 'text/csv';
  readonly objectReference: string;
  readonly originalFilename: string;
  readonly sha256: string;
}

export interface AdmissionRowInput {
  readonly academicIdentityReference: string;
  readonly academicYear: StudentAdmission['academicYear'];
  readonly admissionDate: StudentAdmission['admissionDate'];
  readonly campusId: StudentAdmission['campusId'];
  readonly category: AdmissionCategory;
  readonly courseId: StudentAdmission['courseId'];
  readonly eligibilityEvidence: StudentAdmission['eligibilityEvidence'];
  readonly institutionId: StudentAdmission['institutionId'];
  readonly lateralCapacitySource: StudentAdmission['lateralCapacitySource'];
  readonly programmeId: StudentAdmission['programmeId'];
  readonly recordKey: string;
  readonly studentKey: StudentAdmission['studentKey'];
  readonly studentStatus: StudentAdmission['studentStatus'];
  readonly templateVersion: typeof CURRENT_TEMPLATE_VERSION;
}

export interface ParsedBatchRow {
  readonly findings: readonly BatchFinding[];
  readonly input: AdmissionRowInput | null;
  readonly recordKey: string;
  readonly rowNumber: number;
  readonly safeValues: Readonly<Record<string, string>>;
}

export interface ParsedBatch {
  readonly rows: readonly ParsedBatchRow[];
  readonly sha256: string;
  readonly totalBytes: number;
}

export interface BatchReceipt {
  readonly batchId: string;
  readonly receiptReference: string;
  readonly receivedAt: string;
  readonly replayed: boolean;
  readonly sha256: string;
  readonly status: 'RECEIVED';
  readonly templateVersion: typeof CURRENT_TEMPLATE_VERSION;
}

export interface BatchTotals {
  readonly accepted: number;
  readonly failedFinal: number;
  readonly invalid: number;
  readonly manualReview: number;
  readonly pending: number;
  readonly rejected: number;
  readonly retryable: number;
  readonly total: number;
}

export interface BatchSummary extends Omit<BatchReceipt, 'status'> {
  readonly status: BatchStatus;
  readonly totals: BatchTotals;
}

export interface ClaimedBatchRow {
  readonly actorReference: string;
  readonly attemptCount: number;
  readonly batchId: string;
  readonly input: AdmissionRowInput;
  readonly reason: string;
  readonly requestReference: string;
  readonly rowId: string;
  readonly rowNumber: number;
}

export interface RowResultFinding {
  readonly code: string;
  readonly field: string | null;
  readonly message: string;
  readonly severity: string;
}

export interface CompletedBatchRow {
  readonly admissionId: string;
  readonly admissionReference: string | null;
  readonly decisionId: string;
  readonly findings: readonly RowResultFinding[];
  readonly outcome: 'ACCEPTED' | 'MANUAL_REVIEW' | 'REJECTED';
}

export interface BatchRowResult {
  readonly admissionReference: string | null;
  readonly attemptCount: number;
  readonly decisionReference: string | null;
  readonly findings: readonly RowResultFinding[];
  readonly recordKey: string;
  readonly rowNumber: number;
  readonly status: BatchRowStatus;
}

export interface IdentityVerificationRequest {
  readonly academicIdentityReference: string;
  readonly correlationReference: string;
  readonly studentKey: StudentAdmission['studentKey'];
}

export type IdentityVerificationResponse = AcademicIdentityVerification;

export interface CreateBatchCommand {
  readonly actorReference: string;
  readonly content: AsyncIterable<Buffer | string>;
  readonly contentType: string;
  readonly idempotencyKey: string;
  readonly institutionId: string;
  readonly originalFilename: string;
  readonly reason: string;
  readonly requestReference: string;
  readonly templateVersion: string;
}
