import type { SubmitAdmissionCommand } from '@apaar-platform/admission-application';

export const CASE_TYPES = [
  'ADMISSION_CORRECTION',
  'ADMISSION_CANCELLATION',
  'INSTITUTION_TRANSFER',
  'PROGRAMME_OR_COURSE_TRANSFER',
  'CATEGORY_CORRECTION',
  'IDENTITY_LINK_CORRECTION',
  'DUPLICATE_ENROLMENT_REVIEW',
  'CAPACITY_EXCEPTION_REVIEW',
  'APPEAL',
  'OTHER_AUTHORISED_REVIEW',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'MORE_INFORMATION_REQUIRED',
  'RECOMMENDED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'IMPLEMENTED',
  'IMPLEMENTATION_FAILED',
] as const;
export type CaseState = (typeof CASE_STATES)[number];

export const ACTOR_ROLES = [
  'INSTITUTION_OPERATOR',
  'INSTITUTION_APPROVER',
  'AICTE_REVIEWER',
  'AICTE_CHECKER',
  'AUDITOR',
  'SYSTEM_OPERATOR',
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];
export type PolicyAuthority =
  'SOURCE_CONFIRMED' | 'AUTHORITY_CONFIGURED' | 'PROPOSED' | 'UNKNOWN_BLOCKING';
export type CasePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type CorrectionField =
  | 'STUDENT_REFERENCE'
  | 'ACADEMIC_IDENTITY_REFERENCE'
  | 'CATEGORY'
  | 'STUDENT_STATUS'
  | 'PROGRAMME_ID'
  | 'COURSE_ID'
  | 'ADMISSION_DATE'
  | 'ELIGIBILITY_EVIDENCE';

export interface ActorContext {
  readonly actorReference: string;
  readonly correlationReference: string;
  readonly institutionId: string | null;
  readonly purpose: string;
  readonly reason: string;
  readonly requestReference: string;
  readonly role: ActorRole;
}

export interface CorrectionImpact {
  readonly capacityMayChange: boolean;
  readonly identityReverificationRequired: boolean;
  readonly makerCheckerRequired: true;
  readonly policyReevaluationRequired: boolean;
}

export interface CaseRecord {
  readonly admissionId: string;
  readonly caseId: string;
  readonly caseReference: string;
  readonly caseType: CaseType;
  readonly institutionId: string;
  readonly makerReference: string;
  readonly policyVersion: string;
  readonly priority: CasePriority;
  readonly state: CaseState;
  readonly version: number;
}

export const CASE_ACTIONS = [
  'SAVE_DRAFT',
  'SUBMIT',
  'ASSIGN_REVIEWER',
  'DECLARE_CONFLICT',
  'START_REVIEW',
  'REQUEST_MORE_INFORMATION',
  'SUPPLY_INFORMATION',
  'RECOMMEND',
  'DECIDE',
  'DECIDE_APPEAL',
  'WITHDRAW',
  'ADD_CORRECTION_PROPOSAL',
  'ADD_EVIDENCE',
  'RECORD_PURPOSE',
] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

interface CaseActionBase {
  readonly action: CaseAction;
  readonly actor: ActorContext;
  readonly caseId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export type CaseActionCommand =
  | (CaseActionBase & { readonly action: 'SAVE_DRAFT'; readonly priority: CasePriority })
  | (CaseActionBase & { readonly action: 'SUBMIT' | 'START_REVIEW' | 'WITHDRAW' })
  | (CaseActionBase & {
      readonly action: 'ASSIGN_REVIEWER';
      readonly assignmentId: string;
      readonly reviewerReference: string;
    })
  | (CaseActionBase & {
      readonly action: 'DECLARE_CONFLICT';
      readonly declarationId: string;
      readonly hasConflict: boolean;
    })
  | (CaseActionBase & {
      readonly action: 'REQUEST_MORE_INFORMATION';
      readonly informationRequestId: string;
      readonly requestText: string;
    })
  | (CaseActionBase & {
      readonly action: 'SUPPLY_INFORMATION';
      readonly informationRequestId: string;
      readonly responseId: string;
      readonly responseText: string;
    })
  | (CaseActionBase & {
      readonly action: 'RECOMMEND';
      readonly explanation: string;
      readonly policyVersion: string;
      readonly reasonCode: string;
      readonly recommendation: 'APPROVE' | 'REJECT' | 'MORE_INFORMATION_REQUIRED';
      readonly recommendationId: string;
    })
  | (CaseActionBase & {
      readonly action: 'DECIDE';
      readonly decisionId: string;
      readonly explanation: string;
      readonly outcome: 'APPROVED' | 'REJECTED';
      readonly policyVersion: string;
      readonly reasonCode: string;
    })
  | (CaseActionBase & {
      readonly action: 'DECIDE_APPEAL';
      readonly appealOutcome: 'UPHELD' | 'PARTIALLY_UPHELD' | 'OVERTURNED' | 'DISMISSED';
      readonly decisionId: string;
      readonly explanation: string;
      readonly policyVersion: string;
      readonly reasonCode: string;
    })
  | (CaseActionBase & {
      readonly action: 'ADD_CORRECTION_PROPOSAL';
      readonly changes: readonly {
        readonly fieldCode: string;
        readonly previousValue: unknown;
        readonly proposedValue: unknown;
      }[];
      readonly proposalId: string;
    })
  | (CaseActionBase & {
      readonly action: 'ADD_EVIDENCE';
      readonly evidence: {
        readonly evidenceId: string;
        readonly malwareStatus: 'PENDING' | 'CLEAN' | 'REJECTED';
        readonly mediaType: string;
        readonly objectReference: string;
        readonly safeFilename: string;
        readonly sha256: string;
      };
    })
  | (CaseActionBase & {
      readonly action: 'RECORD_PURPOSE';
      readonly purposeRecord: {
        readonly consentReference: string | null;
        readonly consentStatus: string | null;
        readonly dataCategories: readonly string[];
        readonly legalBasisCategory: string;
        readonly purposeRecordId: string;
        readonly recipientCategory: string;
        readonly retentionPolicyReference: string;
      };
    });

export interface CreateAppealCommand {
  readonly actor: ActorContext;
  readonly appealCaseId: string;
  readonly appealId: string;
  readonly appealedCaseId: string | null;
  readonly appealedDecisionId: string | null;
  readonly caseReference: string;
  readonly idempotencyKey: string;
  readonly institutionId: string;
  readonly policyAuthority: PolicyAuthority;
  readonly policyVersion: string;
  readonly priority: CasePriority;
}

export interface CaseListQuery {
  readonly afterCaseId: string | null;
  readonly caseType: CaseType | null;
  readonly institutionId: string | null;
  readonly limit: number;
  readonly state: CaseState | null;
}

export interface CasePage {
  readonly items: readonly CaseRecord[];
  readonly nextCursor: string | null;
}

export interface CaseImplementationResult {
  readonly caseId: string;
  readonly implementationId: string;
  readonly implementationType: 'CANCELLATION' | 'TRANSFER';
  readonly receiptReference: string;
  readonly releasedReservationIds: readonly string[];
  readonly sourceAdmissionId: string;
  readonly sourceAdmissionVersionId: string;
  readonly state: 'IMPLEMENTED';
  readonly targetAdmissionId: string | null;
  readonly targetDecisionId: string | null;
}

export interface ImplementCancellationCommand {
  readonly actor: ActorContext;
  readonly caseId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly implementationId: string;
  readonly receiptReference: string;
  readonly sourceAdmissionVersionId: string;
}

export interface TransferAdmissionReferences {
  readonly admissionId: string;
  readonly auditEventId: string;
  readonly decisionId: string;
  readonly identityVerificationId: string;
  readonly outboxEventId: string;
  readonly registrationReference: string;
}

export interface ImplementTransferCommand {
  readonly actor: ActorContext;
  readonly caseId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly implementationId: string;
  readonly receiptReference: string;
  readonly sourceAdmissionVersionId: string;
  readonly targetReferences: TransferAdmissionReferences;
  readonly targetSubmission: SubmitAdmissionCommand;
  readonly transferId: string;
}

export interface CaseFinding {
  readonly code:
    | 'ACTION_FORBIDDEN'
    | 'CASE_TRANSITION_INVALID'
    | 'CHECKER_MUST_DIFFER_FROM_MAKER'
    | 'CONFLICT_OF_INTEREST'
    | 'CORRECTION_FIELD_UNSUPPORTED'
    | 'CASE_VERSION_CONFLICT'
    | 'IDEMPOTENCY_CONFLICT'
    | 'POLICY_AUTHORITY_REQUIRED'
    | 'REVIEWER_MUST_DIFFER_FROM_MAKER'
    | 'CHECKER_MUST_DIFFER_FROM_REVIEWER'
    | 'TENANT_SCOPE_DENIED';
  readonly explanation: string;
}

export interface CreateCaseCommand {
  readonly actor: ActorContext;
  readonly admissionId: string;
  readonly caseId: string;
  readonly caseReference: string;
  readonly caseType: CaseType;
  readonly idempotencyKey: string;
  readonly institutionId: string;
  readonly policyAuthority: PolicyAuthority;
  readonly policyVersion: string;
  readonly priority: CasePriority;
}

export interface TransitionCaseCommand {
  readonly actor: ActorContext;
  readonly caseId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly nextState: CaseState;
}
