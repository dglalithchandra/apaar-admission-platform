export type CaseworkRole = 'INSTITUTION_OPERATOR' | 'AICTE_REVIEWER' | 'AICTE_CHECKER';

export type PortalCaseType =
  | 'ADMISSION_CORRECTION'
  | 'ADMISSION_CANCELLATION'
  | 'PROGRAMME_OR_COURSE_TRANSFER'
  | 'INSTITUTION_TRANSFER';

export type PortalCaseState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'MORE_INFORMATION_REQUIRED'
  | 'RECOMMENDED'
  | 'APPROVED'
  | 'REJECTED'
  | 'IMPLEMENTED';

export interface PortalImplementationReceipt {
  readonly implementationType: 'CANCELLATION' | 'TRANSFER';
  readonly receiptReference: string;
  readonly releasedReservationCount: number;
  readonly targetAdmissionReference: string | null;
}

export interface PortalCase {
  readonly admissionReference: string;
  readonly assignedReviewer: string | null;
  readonly caseId: string;
  readonly caseReference: string;
  readonly caseType: PortalCaseType;
  readonly conflictStatus: 'NOT_DECLARED' | 'CLEAR' | 'DECLARED';
  readonly implementationReceipt: PortalImplementationReceipt | null;
  readonly institutionId: string;
  readonly lastAction: string;
  readonly openedAt: string;
  readonly policyAuthority: 'AUTHORITY_CONFIGURED' | 'SOURCE_CONFIRMED' | 'UNKNOWN_BLOCKING';
  readonly policyVersion: string;
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly state: PortalCaseState;
  readonly summary: string;
  readonly version: number;
}

export interface CreatePortalCaseInput {
  readonly admissionReference: string;
  readonly caseType: Exclude<PortalCaseType, 'INSTITUTION_TRANSFER'>;
  readonly reason: string;
}

export interface CaseworkClient {
  createCase(input: CreatePortalCaseInput): Promise<PortalCase>;
  decideCase(
    caseId: string,
    expectedVersion: number,
    outcome: 'APPROVED' | 'REJECTED',
    explanation: string,
  ): Promise<PortalCase>;
  declareConflict(
    caseId: string,
    expectedVersion: number,
    hasConflict: boolean,
  ): Promise<PortalCase>;
  implementCase(caseId: string, expectedVersion: number): Promise<PortalCase>;
  listCases(role: CaseworkRole): Promise<readonly PortalCase[]>;
  recommendCase(
    caseId: string,
    expectedVersion: number,
    outcome: 'APPROVE' | 'REJECT' | 'MORE_INFORMATION_REQUIRED',
    explanation: string,
  ): Promise<PortalCase>;
  startReview(caseId: string, expectedVersion: number): Promise<PortalCase>;
  submitCase(caseId: string, expectedVersion: number): Promise<PortalCase>;
  supplyInformation(caseId: string, expectedVersion: number, response: string): Promise<PortalCase>;
}
