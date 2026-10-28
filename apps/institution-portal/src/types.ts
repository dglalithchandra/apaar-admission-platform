export type BatchStatus =
  'RECEIVED' | 'SCANNING' | 'VALIDATING' | 'PROCESSING' | 'NEEDS_ACTION' | 'COMPLETED' | 'FAILED';

export type RowStatus =
  'ACCEPTED' | 'REJECTED' | 'MANUAL_REVIEW' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'INVALID';

export interface PortalFinding {
  readonly code: string;
  readonly field: string | null;
  readonly message: string;
}

export interface PortalRow {
  readonly admissionReference: string | null;
  readonly findings: readonly PortalFinding[];
  readonly recordKey: string;
  readonly rowNumber: number;
  readonly status: RowStatus;
}

export interface PortalBatch {
  readonly batchId: string;
  readonly receivedAt: string;
  readonly receiptReference: string;
  readonly sha256: string;
  readonly status: BatchStatus;
  readonly totals: {
    readonly accepted: number;
    readonly failed: number;
    readonly invalid: number;
    readonly manualReview: number;
    readonly pending: number;
    readonly rejected: number;
    readonly retryable: number;
    readonly total: number;
  };
}

export interface PortalClient {
  printableRecord?(admissionReference: string): Promise<void>;
  correctionCsv(batchId: string): Promise<string>;
  createBatch(file: File): Promise<PortalBatch>;
  listRows(batchId: string): Promise<readonly PortalRow[]>;
  retryRow(batchId: string, recordKey: string): Promise<PortalRow>;
  templateCsv(): Promise<string>;
}
