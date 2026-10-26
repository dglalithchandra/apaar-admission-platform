import type {
  ActorContext,
  CaseAction,
  CaseFinding,
  CaseState,
  CorrectionField,
  CorrectionImpact,
  PolicyAuthority,
} from './model.js';

const TRANSITIONS: Readonly<Record<CaseState, readonly CaseState[]>> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['MORE_INFORMATION_REQUIRED', 'RECOMMENDED', 'REJECTED'],
  MORE_INFORMATION_REQUIRED: ['SUBMITTED', 'WITHDRAWN'],
  RECOMMENDED: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED', 'IMPLEMENTATION_FAILED'],
  REJECTED: [],
  WITHDRAWN: [],
  IMPLEMENTED: [],
  IMPLEMENTATION_FAILED: [],
};

const IMPACT: Readonly<Record<CorrectionField, CorrectionImpact>> = {
  STUDENT_REFERENCE: {
    capacityMayChange: false,
    identityReverificationRequired: false,
    makerCheckerRequired: true,
    policyReevaluationRequired: false,
  },
  ACADEMIC_IDENTITY_REFERENCE: {
    capacityMayChange: false,
    identityReverificationRequired: true,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
  CATEGORY: {
    capacityMayChange: true,
    identityReverificationRequired: false,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
  STUDENT_STATUS: {
    capacityMayChange: true,
    identityReverificationRequired: true,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
  PROGRAMME_ID: {
    capacityMayChange: true,
    identityReverificationRequired: false,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
  COURSE_ID: {
    capacityMayChange: true,
    identityReverificationRequired: false,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
  ADMISSION_DATE: {
    capacityMayChange: false,
    identityReverificationRequired: false,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
  ELIGIBILITY_EVIDENCE: {
    capacityMayChange: false,
    identityReverificationRequired: false,
    makerCheckerRequired: true,
    policyReevaluationRequired: true,
  },
};

export function correctionImpact(field: string): CorrectionImpact | null {
  return Object.hasOwn(IMPACT, field) ? IMPACT[field as CorrectionField] : null;
}

export function transitionFinding(current: CaseState, next: CaseState): CaseFinding | null {
  return TRANSITIONS[current].includes(next)
    ? null
    : {
        code: 'CASE_TRANSITION_INVALID',
        explanation: `A case cannot move from ${current} to ${next}.`,
      };
}

export function authorityFinding(authority: PolicyAuthority): CaseFinding | null {
  return authority === 'UNKNOWN_BLOCKING' || authority === 'PROPOSED'
    ? {
        code: 'POLICY_AUTHORITY_REQUIRED',
        explanation: 'An activated source-confirmed or authority-configured policy is required.',
      }
    : null;
}

export function checkerFinding(makerReference: string, checker: ActorContext): CaseFinding | null {
  if (checker.role !== 'AICTE_CHECKER') {
    return { code: 'ACTION_FORBIDDEN', explanation: 'Only an authorised checker may decide.' };
  }
  return checker.actorReference === makerReference
    ? {
        code: 'CHECKER_MUST_DIFFER_FROM_MAKER',
        explanation: 'The checker must be independent from the case maker.',
      }
    : null;
}

export function canWrite(role: ActorContext['role']): boolean {
  return role !== 'AUDITOR' && role !== 'SYSTEM_OPERATOR';
}

const ACTION_ROLES: Readonly<Record<CaseAction, readonly ActorContext['role'][]>> = {
  SAVE_DRAFT: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER'],
  SUBMIT: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER'],
  ASSIGN_REVIEWER: ['AICTE_CHECKER'],
  DECLARE_CONFLICT: ['AICTE_REVIEWER', 'AICTE_CHECKER'],
  START_REVIEW: ['AICTE_REVIEWER'],
  REQUEST_MORE_INFORMATION: ['AICTE_REVIEWER'],
  SUPPLY_INFORMATION: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER'],
  RECOMMEND: ['AICTE_REVIEWER'],
  DECIDE: ['AICTE_CHECKER'],
  DECIDE_APPEAL: ['AICTE_CHECKER'],
  WITHDRAW: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER'],
  ADD_CORRECTION_PROPOSAL: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER'],
  ADD_EVIDENCE: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER', 'AICTE_REVIEWER'],
  RECORD_PURPOSE: ['INSTITUTION_OPERATOR', 'INSTITUTION_APPROVER', 'AICTE_REVIEWER'],
};

export function canPerform(role: ActorContext['role'], action: CaseAction): boolean {
  return ACTION_ROLES[action].includes(role);
}

const ACTION_STATES: Readonly<Record<CaseAction, readonly CaseState[]>> = {
  SAVE_DRAFT: ['DRAFT'],
  SUBMIT: ['DRAFT', 'MORE_INFORMATION_REQUIRED'],
  ASSIGN_REVIEWER: ['SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED'],
  DECLARE_CONFLICT: ['UNDER_REVIEW'],
  START_REVIEW: ['SUBMITTED'],
  REQUEST_MORE_INFORMATION: ['UNDER_REVIEW'],
  SUPPLY_INFORMATION: ['MORE_INFORMATION_REQUIRED'],
  RECOMMEND: ['UNDER_REVIEW'],
  DECIDE: ['RECOMMENDED'],
  DECIDE_APPEAL: ['RECOMMENDED'],
  WITHDRAW: ['DRAFT', 'SUBMITTED', 'MORE_INFORMATION_REQUIRED'],
  ADD_CORRECTION_PROPOSAL: ['DRAFT'],
  ADD_EVIDENCE: [
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'MORE_INFORMATION_REQUIRED',
    'RECOMMENDED',
    'APPROVED',
  ],
  RECORD_PURPOSE: [
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'MORE_INFORMATION_REQUIRED',
    'RECOMMENDED',
    'APPROVED',
  ],
};

export function actionStateFinding(action: CaseAction, state: CaseState): CaseFinding | null {
  return ACTION_STATES[action].includes(state)
    ? null
    : {
        code: 'CASE_TRANSITION_INVALID',
        explanation: `${action} is not valid while a case is ${state}.`,
      };
}
