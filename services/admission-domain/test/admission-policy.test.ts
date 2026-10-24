import { describe, expect, it } from 'vitest';

import approvalFixture from '../../../contracts/fixtures/synthetic/approval-capacity.json' with { type: 'json' };
import {
  ADMISSION_RULESET_VERSION,
  RULE_CODES,
  asAcademicYear,
  asAdmissionCommandId,
  asApprovalSnapshotId,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asIsoDateTime,
  asProgrammeId,
  asStudentKey,
  emptyCapacityUsage,
  evaluateAdmissionPolicy,
  type AcademicIdentityVerificationStatus,
  type AdmissionCategory,
  type AdmissionPolicyDecision,
  type ApprovalSnapshot,
  type CapacityUsage,
  type CourseMode,
  type EligibilityEvidenceStatus,
  type LateralCapacitySource,
  type ProgrammeLevel,
  type StudentAdmission,
  type StudentStatus,
} from '../src/index.js';

const IDS = {
  approval: asApprovalSnapshotId(approvalFixture.snapshotId),
  campus: asCampusId(approvalFixture.campus.id),
  command: asAdmissionCommandId('SYNTH-CMD-0001'),
  course: asCourseId(approvalFixture.course.id),
  institution: asInstitutionId(approvalFixture.institution.id),
  programme: asProgrammeId(approvalFixture.programme.id),
  student: asStudentKey('SYNTH-STUDENT-0001'),
} as const;

interface ApprovalOptions {
  readonly academicYear?: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string | null;
  readonly fnApproved?: boolean;
  readonly fnCombinedCapacity?: number;
  readonly fnForeignAndOciCapacity?: number;
  readonly fnForeignAcrossRoutesMaximum?: number;
  readonly fnGulfCapacity?: number;
  readonly lateralApproved?: boolean;
  readonly lateralSupernumeraryCapacity?: number;
  readonly lateralVacancyCapacity?: number;
  readonly mode?: CourseMode;
  readonly nriApproved?: boolean;
  readonly nriCapacity?: number;
  readonly ordinaryIntake?: number;
  readonly pmApproved?: boolean;
  readonly pmCourseCapacity?: number;
  readonly pmInstitutionCapacity?: number;
  readonly programmeLevel?: ProgrammeLevel;
  readonly tfwApproved?: boolean;
  readonly tfwCapacity?: number;
  readonly tfwFillSatisfied?: boolean;
}

function makeApproval(options: ApprovalOptions = {}): ApprovalSnapshot {
  return {
    academicYear: asAcademicYear(options.academicYear ?? approvalFixture.academicYear),
    approvedBy: approvalFixture.approvedBy,
    campus: {
      id: IDS.campus,
      institutionId: IDS.institution,
      name: approvalFixture.campus.name,
    },
    course: {
      campusId: IDS.campus,
      id: IDS.course,
      mode: options.mode ?? (approvalFixture.course.mode as CourseMode),
      name: approvalFixture.course.name,
      programmeId: IDS.programme,
    },
    effectiveFrom: asIsoDate(options.effectiveFrom ?? approvalFixture.effectiveFrom),
    effectiveTo:
      options.effectiveTo === null
        ? null
        : asIsoDate(options.effectiveTo ?? approvalFixture.effectiveTo),
    fnOciGulf: {
      approved: options.fnApproved ?? approvalFixture.fnOciGulf.approved,
      combinedTotalCapacity:
        options.fnCombinedCapacity ?? approvalFixture.fnOciGulf.combinedTotalCapacity,
      foreignAndOciCapacity:
        options.fnForeignAndOciCapacity ?? approvalFixture.fnOciGulf.foreignAndOciCapacity,
      foreignNationalAcrossRoutesMaximum:
        options.fnForeignAcrossRoutesMaximum ??
        approvalFixture.fnOciGulf.foreignNationalAcrossRoutesMaximum,
      gulfCapacity: options.fnGulfCapacity ?? approvalFixture.fnOciGulf.gulfCapacity,
    },
    id: asApprovalSnapshotId(approvalFixture.snapshotId),
    importBatchReference: approvalFixture.importBatchReference,
    institution: { id: IDS.institution, name: approvalFixture.institution.name },
    lateral: {
      approved: options.lateralApproved ?? approvalFixture.lateral.approved,
      firstYearVacancyCapacity:
        options.lateralVacancyCapacity ?? approvalFixture.lateral.firstYearVacancyCapacity,
      supernumeraryCapacity:
        options.lateralSupernumeraryCapacity ?? approvalFixture.lateral.supernumeraryCapacity,
    },
    nri: {
      approved: options.nriApproved ?? approvalFixture.nri.approved,
      maximumWithinOrdinary: options.nriCapacity ?? approvalFixture.nri.maximumWithinOrdinary,
    },
    ordinaryIntake: options.ordinaryIntake ?? approvalFixture.ordinaryIntake,
    pmUspy: {
      approved: options.pmApproved ?? approvalFixture.pmUspy.approved,
      courseCapacity: options.pmCourseCapacity ?? approvalFixture.pmUspy.courseCapacity,
      institutionCapacity:
        options.pmInstitutionCapacity ?? approvalFixture.pmUspy.institutionCapacity,
    },
    policyVersion: approvalFixture.policyVersion,
    programme: {
      id: IDS.programme,
      level: options.programmeLevel ?? (approvalFixture.programme.level as ProgrammeLevel),
      name: approvalFixture.programme.name,
    },
    receivedAt: asIsoDateTime(approvalFixture.receivedAt),
    sourceHash: approvalFixture.sourceHash,
    sourceRecordId: approvalFixture.sourceRecordId,
    sourceSystem: approvalFixture.sourceSystem,
    supersededBy: null,
    tfw: {
      approved: options.tfwApproved ?? approvalFixture.tfw.approved,
      capacity: options.tfwCapacity ?? approvalFixture.tfw.capacity,
      precedingYearMinimumFillSatisfied:
        options.tfwFillSatisfied ?? approvalFixture.tfw.precedingYearMinimumFillSatisfied,
    },
  };
}

function statusFor(category: AdmissionCategory): StudentStatus {
  return {
    foreignNational: category === 'FOREIGN_NATIONAL',
    gulfWorkerChild: category === 'GULF_WORKER_CHILD',
    nri: category === 'NRI',
    oci: category === 'OCI',
  };
}

interface AdmissionOptions {
  readonly academicYear?: string;
  readonly admissionDate?: string;
  readonly category?: AdmissionCategory;
  readonly eligibilityEvidence?: EligibilityEvidenceStatus;
  readonly identityStatus?: AcademicIdentityVerificationStatus;
  readonly institutionId?: string;
  readonly lateralCapacitySource?: LateralCapacitySource | null;
  readonly studentStatus?: StudentStatus;
}

function makeAdmission(options: AdmissionOptions = {}): StudentAdmission {
  const category = options.category ?? 'ORDINARY';
  return {
    academicYear: asAcademicYear(options.academicYear ?? approvalFixture.academicYear),
    admissionDate: asIsoDate(options.admissionDate ?? '2026-08-01'),
    campusId: IDS.campus,
    category,
    commandId: IDS.command,
    courseId: IDS.course,
    eligibilityEvidence: options.eligibilityEvidence ?? 'VERIFIED',
    identityVerification: {
      checkedAt: asIsoDateTime('2026-08-01T08:00:00.000Z'),
      providerContractVersion: 'SYNTH-APAAR-SIMULATOR-1',
      providerRequestReference: 'SYNTH-IDENTITY-REQUEST-0001',
      status: options.identityStatus ?? 'VERIFIED',
    },
    institutionId: asInstitutionId(options.institutionId ?? approvalFixture.institution.id),
    lateralCapacitySource:
      options.lateralCapacitySource !== undefined
        ? options.lateralCapacitySource
        : category === 'LATERAL_ENTRY'
          ? 'LATERAL_SUPERNUMERARY'
          : null,
    lifecycleStatus: 'DRAFT',
    programmeId: IDS.programme,
    studentKey: IDS.student,
    studentStatus: options.studentStatus ?? statusFor(category),
  };
}

function makeUsage(overrides: Partial<CapacityUsage> = {}): CapacityUsage {
  return { ...emptyCapacityUsage(), ...overrides };
}

function decide(
  admission: StudentAdmission = makeAdmission(),
  approval: ApprovalSnapshot | null = makeApproval(),
  usage: CapacityUsage = makeUsage(),
): AdmissionPolicyDecision {
  return evaluateAdmissionPolicy({
    admission,
    approval,
    evaluatedAt: asIsoDateTime('2026-08-01T09:00:00.000Z'),
    usage,
  });
}

function codes(decision: AdmissionPolicyDecision): readonly string[] {
  return decision.findings.map(({ code }) => code);
}

describe('domain value construction', () => {
  it('uses the existing synthetic approval fixture without treating NRI as extra capacity', () => {
    expect(approvalFixture.fixtureNotice).toContain('SYNTHETIC DATA ONLY');
    expect(approvalFixture.nri.countsAgainst).toBe('ORDINARY');
    expect(approvalFixture.tfw.convertible).toBe(false);
    expect(approvalFixture.pmUspy.convertible).toBe(false);
  });

  it('constructs every identifier type from a non-empty synthetic identifier', () => {
    expect(asInstitutionId('SYNTH-INST-2')).toBe('SYNTH-INST-2');
    expect(asCampusId('SYNTH-CAMPUS-2')).toBe('SYNTH-CAMPUS-2');
    expect(asProgrammeId('SYNTH-PROG-2')).toBe('SYNTH-PROG-2');
    expect(asCourseId('SYNTH-COURSE-2')).toBe('SYNTH-COURSE-2');
    expect(asApprovalSnapshotId('SYNTH-APPROVAL-2')).toBe('SYNTH-APPROVAL-2');
    expect(asStudentKey('SYNTH-STUDENT-2')).toBe('SYNTH-STUDENT-2');
    expect(asAdmissionCommandId('SYNTH-CMD-2')).toBe('SYNTH-CMD-2');
  });

  it('rejects empty identifiers and malformed temporal values', () => {
    expect(() => asInstitutionId('   ')).toThrow('must not be empty');
    expect(() => asAcademicYear('2026')).toThrow('YYYY-YY');
    expect(() => asAcademicYear('2026-29')).toThrow('consecutive');
    expect(() => asIsoDate('2026/08/01')).toThrow('YYYY-MM-DD');
    expect(() => asIsoDate('2026-02-30')).toThrow('real calendar date');
    expect(() => asIsoDateTime('not-a-timestamp')).toThrow('ISO-8601');
    expect(() => asIsoDateTime('2026-02-30T12:00:00.000Z')).toThrow('real calendar date');
    expect(() => asIsoDateTime('2026-02-28T12:00:00+99:99')).toThrow('ISO-8601');
  });

  it('accepts a consecutive academic year and valid ISO values', () => {
    expect(asAcademicYear('2099-00')).toBe('2099-00');
    expect(asIsoDate('2026-02-28')).toBe('2026-02-28');
    expect(asIsoDateTime('2026-02-28T12:00:00.000Z')).toBe('2026-02-28T12:00:00.000Z');
  });
});

describe('approval matching and integrity', () => {
  it('rejects an admission when no approval snapshot exists', () => {
    const decision = decide(makeAdmission(), null);

    expect(decision.outcome).toBe('REJECT');
    expect(decision.approvalSnapshotId).toBeNull();
    expect(codes(decision)).toContain(RULE_CODES.APPROVAL_NOT_FOUND);
  });

  it.each([
    makeApproval({ ordinaryIntake: 2, nriCapacity: 3 }),
    makeApproval({ pmCourseCapacity: 3 }),
    makeApproval({ pmInstitutionCapacity: 11 }),
  ])('rejects a snapshot with inconsistent or above-policy absolute capacities', (approval) => {
    const decision = decide(makeAdmission(), approval);

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.APPROVAL_CONFIGURATION_INVALID);
  });

  it('rejects a snapshot that belongs to another institution', () => {
    const decision = decide(makeAdmission({ institutionId: 'SYNTH-INST-OTHER' }));

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.APPROVAL_KEY_MISMATCH);
  });

  it.each([
    ['before', '2026-03-31'],
    ['after', '2027-04-01'],
  ])('rejects an admission %s the approval period', (_label, admissionDate) => {
    const decision = decide(makeAdmission({ admissionDate }));

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.APPROVAL_NOT_EFFECTIVE);
  });

  it('supports an approval with no closing effective date', () => {
    const decision = decide(makeAdmission(), makeApproval({ effectiveTo: null }));

    expect(decision.outcome).toBe('ACCEPT');
  });

  it('rejects corrupt negative usage rather than making a capacity decision', () => {
    expect(() => decide(makeAdmission(), makeApproval(), makeUsage({ ordinaryUsed: -1 }))).toThrow(
      'ordinaryUsed',
    );
  });
});

describe('ordinary and NRI capacity', () => {
  it('accepts an ordinary admission and returns a stable auditable reservation', () => {
    const decision = decide();

    expect(decision).toMatchObject({
      approvalSnapshotId: IDS.approval,
      outcome: 'ACCEPT',
      reservation: { bucket: 'ORDINARY', subcategory: 'ORDINARY', units: 1 },
      rulesetVersion: ADMISSION_RULESET_VERSION,
      targetLifecycleStatus: 'ACCEPTED',
    });
    expect(codes(decision)).toContain(RULE_CODES.IDENTITY_VERIFIED);
  });

  it('accepts the final available ordinary seat and rejects the next one', () => {
    expect(decide(makeAdmission(), makeApproval(), makeUsage({ ordinaryUsed: 59 })).outcome).toBe(
      'ACCEPT',
    );

    const exhausted = decide(makeAdmission(), makeApproval(), makeUsage({ ordinaryUsed: 60 }));
    expect(exhausted.outcome).toBe('REJECT');
    expect(exhausted.reservation).toBeNull();
    expect(codes(exhausted)).toContain(RULE_CODES.ORDINARY_CAPACITY_EXCEEDED);
  });

  it('accepts NRI inside ordinary intake rather than as extra capacity', () => {
    const decision = decide(makeAdmission({ category: 'NRI' }));

    expect(decision.outcome).toBe('ACCEPT');
    expect(decision.reservation).toEqual({ bucket: 'ORDINARY', subcategory: 'NRI', units: 1 });
  });

  it.each([
    [
      'course approval',
      makeApproval({ nriApproved: false }),
      makeUsage(),
      RULE_CODES.NRI_NOT_APPROVED,
    ],
    [
      'ordinary intake',
      makeApproval(),
      makeUsage({ ordinaryUsed: 60 }),
      RULE_CODES.ORDINARY_CAPACITY_EXCEEDED,
    ],
    [
      'NRI sublimit',
      makeApproval(),
      makeUsage({ nriWithinOrdinaryUsed: 3 }),
      RULE_CODES.NRI_CAPACITY_EXCEEDED,
    ],
  ])('rejects NRI when the %s is exhausted or unavailable', (_label, approval, usage, code) => {
    const decision = decide(makeAdmission({ category: 'NRI' }), approval, usage);

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(code);
  });

  it('rejects an NRI category whose learner status does not match', () => {
    const decision = decide(
      makeAdmission({ category: 'NRI', studentStatus: statusFor('ORDINARY') }),
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.CATEGORY_STATUS_MISMATCH);
  });

  it('rejects NRI admission in a non-regular course', () => {
    const decision = decide(makeAdmission({ category: 'NRI' }), makeApproval({ mode: 'ONLINE' }));

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.MODE_NOT_REGULAR);
  });

  it.each([
    ['MISSING', RULE_CODES.ELIGIBILITY_EVIDENCE_REQUIRED],
    ['PENDING', RULE_CODES.ELIGIBILITY_EVIDENCE_PENDING],
  ] as const)('holds NRI for review when eligibility evidence is %s', (evidence, code) => {
    const decision = decide(makeAdmission({ category: 'NRI', eligibilityEvidence: evidence }));

    expect(decision.outcome).toBe('MANUAL_REVIEW');
    expect(decision.reservation).toBeNull();
    expect(codes(decision)).toContain(code);
  });
});

describe('FN, OCI and Gulf-worker-child capacity', () => {
  it.each([
    ['FOREIGN_NATIONAL', 'FN_OCI_SUPERNUMERARY'],
    ['OCI', 'FN_OCI_SUPERNUMERARY'],
    ['GULF_WORKER_CHILD', 'GULF_WORKER_CHILD_SUPERNUMERARY'],
  ] as const)('accepts a valid %s admission', (category, bucket) => {
    const decision = decide(makeAdmission({ category }));

    expect(decision.outcome).toBe('ACCEPT');
    expect(decision.reservation?.bucket).toBe(bucket);
  });

  it('rejects the group when it is not approved', () => {
    const decision = decide(
      makeAdmission({ category: 'OCI' }),
      makeApproval({ fnApproved: false }),
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.FN_OCI_GULF_NOT_APPROVED);
  });

  it.each([
    [
      'foreign/OCI subgroup',
      makeAdmission({ category: 'OCI' }),
      makeUsage({ foreignAndOciUsed: 6 }),
    ],
    ['Gulf subgroup', makeAdmission({ category: 'GULF_WORKER_CHILD' }), makeUsage({ gulfUsed: 3 })],
    [
      'combined group',
      makeAdmission({ category: 'OCI' }),
      makeUsage({ foreignAndOciUsed: 6, gulfUsed: 3 }),
    ],
  ])('rejects an exhausted %s capacity', (_label, admission, usage) => {
    const decision = decide(admission, makeApproval(), usage);

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.FN_OCI_GULF_CAPACITY_EXCEEDED);
  });

  it('enforces the foreign-national ceiling shared with lateral entry', () => {
    const decision = decide(
      makeAdmission({ category: 'FOREIGN_NATIONAL' }),
      makeApproval(),
      makeUsage({ foreignNationalAcrossRoutesUsed: 9 }),
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.FOREIGN_NATIONAL_COMBINED_CAPACITY_EXCEEDED);
  });
});

describe('lateral-entry capacity', () => {
  it.each([
    ['LATERAL_SUPERNUMERARY', 'LATERAL_SUPERNUMERARY'],
    ['LATERAL_FIRST_YEAR_VACANCY', 'LATERAL_FIRST_YEAR_VACANCY'],
  ] as const)('reserves the explicitly selected %s source', (source, bucket) => {
    const decision = decide(
      makeAdmission({ category: 'LATERAL_ENTRY', lateralCapacitySource: source }),
    );

    expect(decision.outcome).toBe('ACCEPT');
    expect(decision.reservation?.bucket).toBe(bucket);
  });

  it('rejects lateral entry when approval is absent', () => {
    const decision = decide(
      makeAdmission({ category: 'LATERAL_ENTRY' }),
      makeApproval({ lateralApproved: false }),
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.LATERAL_ENTRY_NOT_APPROVED);
  });

  it('rejects lateral entry for an ineligible programme level', () => {
    const decision = decide(
      makeAdmission({ category: 'LATERAL_ENTRY' }),
      makeApproval({ programmeLevel: 'POSTGRADUATE' }),
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.LATERAL_ENTRY_PROGRAMME_LEVEL_INVALID);
  });

  it('requires an explicit lateral capacity source instead of guessing', () => {
    const decision = decide(
      makeAdmission({ category: 'LATERAL_ENTRY', lateralCapacitySource: null }),
    );

    expect(decision.outcome).toBe('MANUAL_REVIEW');
    expect(codes(decision)).toContain(RULE_CODES.LATERAL_CAPACITY_SOURCE_REQUIRED);
  });

  it.each([
    ['LATERAL_SUPERNUMERARY', makeUsage({ lateralSupernumeraryUsed: 6 })],
    ['LATERAL_FIRST_YEAR_VACANCY', makeUsage({ lateralFirstYearVacancyUsed: 2 })],
  ] as const)('rejects an exhausted %s source', (source, usage) => {
    const decision = decide(
      makeAdmission({ category: 'LATERAL_ENTRY', lateralCapacitySource: source }),
      makeApproval(),
      usage,
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.LATERAL_CAPACITY_EXCEEDED);
  });

  it('enforces the combined foreign-national ceiling for lateral entry', () => {
    const decision = decide(
      makeAdmission({
        category: 'LATERAL_ENTRY',
        studentStatus: {
          foreignNational: true,
          gulfWorkerChild: false,
          nri: false,
          oci: false,
        },
      }),
      makeApproval(),
      makeUsage({ foreignNationalAcrossRoutesUsed: 9 }),
    );

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(RULE_CODES.FOREIGN_NATIONAL_COMBINED_CAPACITY_EXCEEDED);
  });
});

describe('TFW and PM-USPY capacity', () => {
  it('keeps TFW separate and available even when ordinary intake is full', () => {
    const decision = decide(
      makeAdmission({ category: 'TFW' }),
      makeApproval(),
      makeUsage({ ordinaryUsed: 60 }),
    );

    expect(decision.outcome).toBe('ACCEPT');
    expect(decision.reservation?.bucket).toBe('TFW_SUPERNUMERARY');
  });

  it.each([
    [makeApproval({ tfwApproved: false }), makeUsage(), RULE_CODES.TFW_NOT_APPROVED],
    [
      makeApproval({ tfwFillSatisfied: false }),
      makeUsage(),
      RULE_CODES.TFW_PRECEDING_YEAR_FILL_NOT_SATISFIED,
    ],
    [makeApproval(), makeUsage({ tfwUsed: 3 }), RULE_CODES.TFW_CAPACITY_EXCEEDED],
    [
      makeApproval({ programmeLevel: 'POSTGRADUATE' }),
      makeUsage(),
      RULE_CODES.TFW_PROGRAMME_LEVEL_INVALID,
    ],
  ])('rejects TFW when its own rule fails', (approval, usage, code) => {
    const decision = decide(makeAdmission({ category: 'TFW' }), approval, usage);

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(code);
  });

  it('accepts PM-USPY within both course and institution caps', () => {
    const decision = decide(makeAdmission({ category: 'PM_USPY' }));

    expect(decision.outcome).toBe('ACCEPT');
    expect(decision.reservation?.bucket).toBe('PM_USPY_SUPERNUMERARY');
  });

  it.each([
    [makeApproval({ pmApproved: false }), makeUsage(), RULE_CODES.PM_USPY_NOT_APPROVED],
    [
      makeApproval(),
      makeUsage({ pmUspyCourseUsed: 2 }),
      RULE_CODES.PM_USPY_COURSE_CAPACITY_EXCEEDED,
    ],
    [
      makeApproval(),
      makeUsage({ pmUspyInstitutionUsed: 10 }),
      RULE_CODES.PM_USPY_INSTITUTION_CAPACITY_EXCEEDED,
    ],
    [
      makeApproval({ programmeLevel: 'DIPLOMA' }),
      makeUsage(),
      RULE_CODES.PM_USPY_PROGRAMME_LEVEL_INVALID,
    ],
  ])('rejects PM-USPY when an approval or cap rule fails', (approval, usage, code) => {
    const decision = decide(makeAdmission({ category: 'PM_USPY' }), approval, usage);

    expect(decision.outcome).toBe('REJECT');
    expect(codes(decision)).toContain(code);
  });
});

describe('identity and unresolved policy', () => {
  it.each([
    ['TEMPORARILY_UNAVAILABLE', RULE_CODES.IDENTITY_PROVIDER_UNAVAILABLE],
    ['RATE_LIMITED', RULE_CODES.IDENTITY_PROVIDER_UNAVAILABLE],
    ['NOT_FOUND', RULE_CODES.IDENTITY_NOT_FOUND],
    ['MISMATCH', RULE_CODES.IDENTITY_MISMATCH],
    ['NOT_ELIGIBLE_FOR_APAAR', RULE_CODES.IDENTITY_NOT_ELIGIBLE],
    ['MANUAL_REVIEW', RULE_CODES.IDENTITY_MANUAL_REVIEW],
    ['UNVERIFIED', RULE_CODES.IDENTITY_UNVERIFIED],
  ] as const)('routes %s to review rather than adverse identity rejection', (status, code) => {
    const decision = decide(makeAdmission({ identityStatus: status }));

    expect(decision.outcome).toBe('MANUAL_REVIEW');
    expect(decision.targetLifecycleStatus).toBe('UNDER_REVIEW');
    expect(decision.reservation).toBeNull();
    expect(codes(decision)).toContain(code);
  });

  it('routes an unconfigured supernumerary category to review', () => {
    const decision = decide(makeAdmission({ category: 'OTHER_SUPERNUMERARY' }));

    expect(decision.outcome).toBe('MANUAL_REVIEW');
    expect(codes(decision)).toContain(RULE_CODES.POLICY_CATEGORY_UNCONFIGURED);
  });
});
