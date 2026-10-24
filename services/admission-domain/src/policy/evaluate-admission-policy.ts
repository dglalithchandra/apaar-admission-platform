import type {
  AdmissionCategory,
  ApprovalSnapshot,
  CapacityReservation,
  CapacityUsage,
  StudentAdmission,
} from '../model/entities.js';
import type { IsoDateTime } from '../model/identifiers.js';
import {
  RULE_CODES,
  type AdmissionPolicyDecision,
  type RuleAuthority,
  type RuleCode,
  type ValidationFinding,
  type ValidationSeverity,
} from '../model/validation.js';

export const ADMISSION_RULESET_VERSION = '2026.10-stage1';

export interface AdmissionPolicyInput {
  readonly admission: StudentAdmission;
  readonly approval: ApprovalSnapshot | null;
  readonly usage: CapacityUsage;
  readonly evaluatedAt: IsoDateTime;
}

interface CategoryEvaluation {
  readonly reservation: CapacityReservation | null;
  readonly findings: readonly ValidationFinding[];
}

function finding(
  code: RuleCode,
  severity: ValidationSeverity,
  authority: RuleAuthority,
  message: string,
): ValidationFinding {
  return { authority, code, message, severity };
}

function sourceError(code: RuleCode, message: string): ValidationFinding {
  return finding(code, 'ERROR', 'SOURCE_CONFIRMED', message);
}

function configuredError(code: RuleCode, message: string): ValidationFinding {
  return finding(code, 'ERROR', 'AUTHORITY_CONFIGURED', message);
}

function unknownReview(code: RuleCode, message: string): ValidationFinding {
  return finding(code, 'REVIEW', 'UNKNOWN_BLOCKING', message);
}

function makeDecision(
  input: AdmissionPolicyInput,
  findings: readonly ValidationFinding[],
  proposedReservation: CapacityReservation | null,
): AdmissionPolicyDecision {
  const hasError = findings.some(({ severity }) => severity === 'ERROR');
  const needsReview = findings.some(({ severity }) => severity === 'REVIEW');
  const outcome = hasError ? 'REJECT' : needsReview ? 'MANUAL_REVIEW' : 'ACCEPT';

  return {
    approvalSnapshotId: input.approval?.id ?? null,
    evaluatedAt: input.evaluatedAt,
    findings,
    outcome,
    reservation: outcome === 'ACCEPT' ? proposedReservation : null,
    rulesetVersion: ADMISSION_RULESET_VERSION,
    targetLifecycleStatus:
      outcome === 'ACCEPT' ? 'ACCEPTED' : outcome === 'REJECT' ? 'REJECTED' : 'UNDER_REVIEW',
  };
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function hasValidCapacityConfiguration(approval: ApprovalSnapshot): boolean {
  const capacities = [
    approval.ordinaryIntake,
    approval.nri.maximumWithinOrdinary,
    approval.fnOciGulf.foreignAndOciCapacity,
    approval.fnOciGulf.gulfCapacity,
    approval.fnOciGulf.combinedTotalCapacity,
    approval.fnOciGulf.foreignNationalAcrossRoutesMaximum,
    approval.lateral.supernumeraryCapacity,
    approval.lateral.firstYearVacancyCapacity,
    approval.tfw.capacity,
    approval.pmUspy.courseCapacity,
    approval.pmUspy.institutionCapacity,
  ];

  return (
    capacities.every(isNonNegativeInteger) &&
    approval.nri.maximumWithinOrdinary <= approval.ordinaryIntake &&
    approval.fnOciGulf.foreignAndOciCapacity + approval.fnOciGulf.gulfCapacity <=
      approval.fnOciGulf.combinedTotalCapacity &&
    approval.pmUspy.courseCapacity <= approval.pmUspy.institutionCapacity &&
    approval.pmUspy.courseCapacity <= 2 &&
    approval.pmUspy.institutionCapacity <= 10
  );
}

function assertValidUsage(usage: CapacityUsage): void {
  const entries = Object.entries(usage) as [keyof CapacityUsage, number][];
  const invalid = entries.find(([, value]) => !isNonNegativeInteger(value));
  if (invalid !== undefined) {
    throw new RangeError(`Capacity usage ${invalid[0]} must be a non-negative integer.`);
  }
}

function approvalMatchesAdmission(
  approval: ApprovalSnapshot,
  admission: StudentAdmission,
): boolean {
  return (
    approval.institution.id === admission.institutionId &&
    approval.campus.id === admission.campusId &&
    approval.campus.institutionId === admission.institutionId &&
    approval.programme.id === admission.programmeId &&
    approval.course.id === admission.courseId &&
    approval.course.campusId === admission.campusId &&
    approval.course.programmeId === admission.programmeId &&
    approval.academicYear === admission.academicYear
  );
}

function isApprovalEffective(approval: ApprovalSnapshot, admission: StudentAdmission): boolean {
  return (
    admission.admissionDate >= approval.effectiveFrom &&
    (approval.effectiveTo === null || admission.admissionDate <= approval.effectiveTo)
  );
}

function evaluateIdentity(admission: StudentAdmission): ValidationFinding {
  switch (admission.identityVerification.status) {
    case 'VERIFIED':
      return finding(
        RULE_CODES.IDENTITY_VERIFIED,
        'INFO',
        'SOURCE_CONFIRMED',
        'The academic identity was verified by the configured adapter.',
      );
    case 'TEMPORARILY_UNAVAILABLE':
    case 'RATE_LIMITED':
      return unknownReview(
        RULE_CODES.IDENTITY_PROVIDER_UNAVAILABLE,
        'The identity provider is temporarily unavailable; the admission requires a retry or review, not rejection.',
      );
    case 'NOT_FOUND':
      return unknownReview(
        RULE_CODES.IDENTITY_NOT_FOUND,
        'The academic identity was not found; the authorised exception and correction policy is not yet configured.',
      );
    case 'MISMATCH':
      return unknownReview(
        RULE_CODES.IDENTITY_MISMATCH,
        'The identity attributes did not match; an authorised correction path is required before a decision.',
      );
    case 'NOT_ELIGIBLE_FOR_APAAR':
      return unknownReview(
        RULE_CODES.IDENTITY_NOT_ELIGIBLE,
        'The learner is not eligible for APAAR under the adapter result; an authorised alternative identity path is required.',
      );
    case 'MANUAL_REVIEW':
      return unknownReview(
        RULE_CODES.IDENTITY_MANUAL_REVIEW,
        'The identity adapter requested manual review.',
      );
    case 'UNVERIFIED':
      return unknownReview(
        RULE_CODES.IDENTITY_UNVERIFIED,
        'The academic identity has not yet been verified.',
      );
  }
}

function evaluateEligibilityEvidence(admission: StudentAdmission): ValidationFinding[] {
  if (admission.category === 'ORDINARY') {
    return [];
  }

  if (admission.eligibilityEvidence === 'MISSING') {
    return [
      unknownReview(
        RULE_CODES.ELIGIBILITY_EVIDENCE_REQUIRED,
        'The selected admission category requires eligibility evidence and accountable review.',
      ),
    ];
  }

  if (admission.eligibilityEvidence === 'PENDING') {
    return [
      unknownReview(
        RULE_CODES.ELIGIBILITY_EVIDENCE_PENDING,
        'Eligibility evidence is pending review.',
      ),
    ];
  }

  return [];
}

function evaluateCategoryStatus(admission: StudentAdmission): ValidationFinding[] {
  const matches =
    admission.category === 'NRI'
      ? admission.studentStatus.nri
      : admission.category === 'OCI'
        ? admission.studentStatus.oci
        : admission.category === 'FOREIGN_NATIONAL'
          ? admission.studentStatus.foreignNational
          : admission.category === 'GULF_WORKER_CHILD'
            ? admission.studentStatus.gulfWorkerChild
            : true;

  if (matches) {
    return [];
  }

  return [
    sourceError(
      RULE_CODES.CATEGORY_STATUS_MISMATCH,
      `The ${admission.category} category does not match the learner status supplied for this admission.`,
    ),
  ];
}

function requiresRegularMode(admission: StudentAdmission): boolean {
  return (
    admission.category === 'NRI' ||
    admission.category === 'OCI' ||
    admission.category === 'FOREIGN_NATIONAL' ||
    admission.category === 'GULF_WORKER_CHILD' ||
    (admission.category === 'LATERAL_ENTRY' &&
      (admission.studentStatus.nri ||
        admission.studentStatus.oci ||
        admission.studentStatus.foreignNational ||
        admission.studentStatus.gulfWorkerChild))
  );
}

function regularModeFinding(
  admission: StudentAdmission,
  approval: ApprovalSnapshot,
): ValidationFinding[] {
  if (!requiresRegularMode(admission) || approval.course.mode === 'REGULAR') {
    return [];
  }

  return [
    sourceError(
      RULE_CODES.MODE_NOT_REGULAR,
      'NRI, OCI, foreign-national and Gulf-worker-child admissions are permitted only in regular-mode courses.',
    ),
  ];
}

function ordinaryEvaluation(approval: ApprovalSnapshot, usage: CapacityUsage): CategoryEvaluation {
  if (usage.ordinaryUsed >= approval.ordinaryIntake) {
    return {
      findings: [
        sourceError(
          RULE_CODES.ORDINARY_CAPACITY_EXCEEDED,
          'The approved ordinary intake has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  return {
    findings: [],
    reservation: { bucket: 'ORDINARY', subcategory: 'ORDINARY', units: 1 },
  };
}

function nriEvaluation(approval: ApprovalSnapshot, usage: CapacityUsage): CategoryEvaluation {
  if (!approval.nri.approved) {
    return {
      findings: [
        configuredError(
          RULE_CODES.NRI_NOT_APPROVED,
          'This approval snapshot does not authorise NRI admissions for the course.',
        ),
      ],
      reservation: null,
    };
  }

  if (usage.ordinaryUsed >= approval.ordinaryIntake) {
    return {
      findings: [
        sourceError(
          RULE_CODES.ORDINARY_CAPACITY_EXCEEDED,
          'NRI admission consumes Approved Intake, which has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  if (usage.nriWithinOrdinaryUsed >= approval.nri.maximumWithinOrdinary) {
    return {
      findings: [
        configuredError(
          RULE_CODES.NRI_CAPACITY_EXCEEDED,
          'The configured NRI limit within Approved Intake has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  return {
    findings: [],
    reservation: { bucket: 'ORDINARY', subcategory: 'NRI', units: 1 },
  };
}

function fnOciGulfEvaluation(
  category: Extract<AdmissionCategory, 'FOREIGN_NATIONAL' | 'OCI' | 'GULF_WORKER_CHILD'>,
  approval: ApprovalSnapshot,
  usage: CapacityUsage,
): CategoryEvaluation {
  if (!approval.fnOciGulf.approved) {
    return {
      findings: [
        configuredError(
          RULE_CODES.FN_OCI_GULF_NOT_APPROVED,
          'This approval snapshot does not authorise the FN/OCI/Gulf-worker-child group.',
        ),
      ],
      reservation: null,
    };
  }

  const combinedUsed = usage.foreignAndOciUsed + usage.gulfUsed;
  if (combinedUsed >= approval.fnOciGulf.combinedTotalCapacity) {
    return {
      findings: [
        configuredError(
          RULE_CODES.FN_OCI_GULF_CAPACITY_EXCEEDED,
          'The combined FN/OCI/Gulf-worker-child supernumerary capacity has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  const isGulf = category === 'GULF_WORKER_CHILD';
  const subgroupUsed = isGulf ? usage.gulfUsed : usage.foreignAndOciUsed;
  const subgroupCapacity = isGulf
    ? approval.fnOciGulf.gulfCapacity
    : approval.fnOciGulf.foreignAndOciCapacity;
  if (subgroupUsed >= subgroupCapacity) {
    return {
      findings: [
        configuredError(
          RULE_CODES.FN_OCI_GULF_CAPACITY_EXCEEDED,
          'The configured subgroup capacity has been exhausted; no unrecorded bucket transfer is permitted.',
        ),
      ],
      reservation: null,
    };
  }

  if (
    category === 'FOREIGN_NATIONAL' &&
    usage.foreignNationalAcrossRoutesUsed >= approval.fnOciGulf.foreignNationalAcrossRoutesMaximum
  ) {
    return {
      findings: [
        sourceError(
          RULE_CODES.FOREIGN_NATIONAL_COMBINED_CAPACITY_EXCEEDED,
          'The configured combined ceiling for foreign nationals across supernumerary and lateral-entry routes has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  return {
    findings: [],
    reservation: {
      bucket: isGulf ? 'GULF_WORKER_CHILD_SUPERNUMERARY' : 'FN_OCI_SUPERNUMERARY',
      subcategory: category,
      units: 1,
    },
  };
}

function lateralEvaluation(
  admission: StudentAdmission,
  approval: ApprovalSnapshot,
  usage: CapacityUsage,
): CategoryEvaluation {
  if (!approval.lateral.approved) {
    return {
      findings: [
        configuredError(
          RULE_CODES.LATERAL_ENTRY_NOT_APPROVED,
          'This approval snapshot does not authorise lateral entry.',
        ),
      ],
      reservation: null,
    };
  }

  if (approval.programme.level !== 'DIPLOMA' && approval.programme.level !== 'UNDERGRADUATE') {
    return {
      findings: [
        sourceError(
          RULE_CODES.LATERAL_ENTRY_PROGRAMME_LEVEL_INVALID,
          'Lateral entry is supported only for eligible Diploma and Undergraduate programmes.',
        ),
      ],
      reservation: null,
    };
  }

  if (admission.lateralCapacitySource === null) {
    return {
      findings: [
        unknownReview(
          RULE_CODES.LATERAL_CAPACITY_SOURCE_REQUIRED,
          'The admission must identify whether it consumes the supernumerary lateral allocation or a documented first-year vacancy.',
        ),
      ],
      reservation: null,
    };
  }

  const isSupernumerary = admission.lateralCapacitySource === 'LATERAL_SUPERNUMERARY';
  const used = isSupernumerary ? usage.lateralSupernumeraryUsed : usage.lateralFirstYearVacancyUsed;
  const capacity = isSupernumerary
    ? approval.lateral.supernumeraryCapacity
    : approval.lateral.firstYearVacancyCapacity;
  if (used >= capacity) {
    return {
      findings: [
        configuredError(
          RULE_CODES.LATERAL_CAPACITY_EXCEEDED,
          'The selected lateral-entry capacity source has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  if (
    admission.studentStatus.foreignNational &&
    usage.foreignNationalAcrossRoutesUsed >= approval.fnOciGulf.foreignNationalAcrossRoutesMaximum
  ) {
    return {
      findings: [
        sourceError(
          RULE_CODES.FOREIGN_NATIONAL_COMBINED_CAPACITY_EXCEEDED,
          'The configured combined ceiling for foreign nationals across supernumerary and lateral-entry routes has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  return {
    findings: [],
    reservation: {
      bucket: admission.lateralCapacitySource,
      subcategory: 'LATERAL_ENTRY',
      units: 1,
    },
  };
}

function tfwEvaluation(approval: ApprovalSnapshot, usage: CapacityUsage): CategoryEvaluation {
  if (!approval.tfw.approved) {
    return {
      findings: [
        configuredError(
          RULE_CODES.TFW_NOT_APPROVED,
          'This approval snapshot does not authorise TFW admissions.',
        ),
      ],
      reservation: null,
    };
  }

  if (!approval.tfw.precedingYearMinimumFillSatisfied) {
    return {
      findings: [
        sourceError(
          RULE_CODES.TFW_PRECEDING_YEAR_FILL_NOT_SATISFIED,
          'The preceding-year minimum-fill condition for TFW capacity is not satisfied.',
        ),
      ],
      reservation: null,
    };
  }

  if (
    approval.programme.level !== 'DIPLOMA' &&
    approval.programme.level !== 'POST_DIPLOMA_CERTIFICATE' &&
    approval.programme.level !== 'UNDERGRADUATE'
  ) {
    return {
      findings: [
        sourceError(
          RULE_CODES.TFW_PROGRAMME_LEVEL_INVALID,
          'TFW is not configured for this programme level under the sourced rule.',
        ),
      ],
      reservation: null,
    };
  }

  if (usage.tfwUsed >= approval.tfw.capacity) {
    return {
      findings: [
        configuredError(
          RULE_CODES.TFW_CAPACITY_EXCEEDED,
          'The TFW supernumerary capacity has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  return {
    findings: [],
    reservation: { bucket: 'TFW_SUPERNUMERARY', subcategory: 'TFW', units: 1 },
  };
}

function pmUspyEvaluation(approval: ApprovalSnapshot, usage: CapacityUsage): CategoryEvaluation {
  if (!approval.pmUspy.approved) {
    return {
      findings: [
        configuredError(
          RULE_CODES.PM_USPY_NOT_APPROVED,
          'This approval snapshot does not authorise PM-USPY admissions.',
        ),
      ],
      reservation: null,
    };
  }

  if (approval.programme.level !== 'UNDERGRADUATE') {
    return {
      findings: [
        sourceError(
          RULE_CODES.PM_USPY_PROGRAMME_LEVEL_INVALID,
          'PM-USPY seats in the sourced rule apply to Bachelor programmes.',
        ),
      ],
      reservation: null,
    };
  }

  if (usage.pmUspyCourseUsed >= approval.pmUspy.courseCapacity) {
    return {
      findings: [
        sourceError(
          RULE_CODES.PM_USPY_COURSE_CAPACITY_EXCEEDED,
          'The PM-USPY course capacity has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  if (usage.pmUspyInstitutionUsed >= approval.pmUspy.institutionCapacity) {
    return {
      findings: [
        sourceError(
          RULE_CODES.PM_USPY_INSTITUTION_CAPACITY_EXCEEDED,
          'The PM-USPY institution-wide capacity has been exhausted.',
        ),
      ],
      reservation: null,
    };
  }

  return {
    findings: [],
    reservation: { bucket: 'PM_USPY_SUPERNUMERARY', subcategory: 'PM_USPY', units: 1 },
  };
}

function evaluateCategory(
  admission: StudentAdmission,
  approval: ApprovalSnapshot,
  usage: CapacityUsage,
): CategoryEvaluation {
  switch (admission.category) {
    case 'ORDINARY':
      return ordinaryEvaluation(approval, usage);
    case 'NRI':
      return nriEvaluation(approval, usage);
    case 'FOREIGN_NATIONAL':
    case 'OCI':
    case 'GULF_WORKER_CHILD':
      return fnOciGulfEvaluation(admission.category, approval, usage);
    case 'LATERAL_ENTRY':
      return lateralEvaluation(admission, approval, usage);
    case 'TFW':
      return tfwEvaluation(approval, usage);
    case 'PM_USPY':
      return pmUspyEvaluation(approval, usage);
    case 'OTHER_SUPERNUMERARY':
      return {
        findings: [
          unknownReview(
            RULE_CODES.POLICY_CATEGORY_UNCONFIGURED,
            'This supernumerary category does not yet have an authority-approved operational rule.',
          ),
        ],
        reservation: null,
      };
  }
}

export function evaluateAdmissionPolicy(input: AdmissionPolicyInput): AdmissionPolicyDecision {
  assertValidUsage(input.usage);

  if (input.approval === null) {
    return makeDecision(
      input,
      [
        sourceError(
          RULE_CODES.APPROVAL_NOT_FOUND,
          'No effective approval snapshot was supplied for this admission.',
        ),
      ],
      null,
    );
  }

  if (!hasValidCapacityConfiguration(input.approval)) {
    return makeDecision(
      input,
      [
        configuredError(
          RULE_CODES.APPROVAL_CONFIGURATION_INVALID,
          'The approval snapshot contains inconsistent or invalid absolute capacities.',
        ),
      ],
      null,
    );
  }

  if (!approvalMatchesAdmission(input.approval, input.admission)) {
    return makeDecision(
      input,
      [
        sourceError(
          RULE_CODES.APPROVAL_KEY_MISMATCH,
          'The approval snapshot does not match the institution, campus, programme, course or academic year.',
        ),
      ],
      null,
    );
  }

  if (!isApprovalEffective(input.approval, input.admission)) {
    return makeDecision(
      input,
      [
        sourceError(
          RULE_CODES.APPROVAL_NOT_EFFECTIVE,
          'The approval snapshot is not effective on the admission date.',
        ),
      ],
      null,
    );
  }

  const category = evaluateCategory(input.admission, input.approval, input.usage);
  const findings = [
    evaluateIdentity(input.admission),
    ...evaluateCategoryStatus(input.admission),
    ...evaluateEligibilityEvidence(input.admission),
    ...regularModeFinding(input.admission, input.approval),
    ...category.findings,
  ];

  return makeDecision(input, findings, category.reservation);
}
