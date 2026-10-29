import {
  asAcademicYear,
  emptyCapacityUsage,
  asAdmissionCommandId,
  asApprovalSnapshotId,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asIsoDateTime,
  asProgrammeId,
  asStudentKey,
  type AdmissionCategory,
  type ApprovalSnapshot,
  type LateralCapacitySource,
  type StudentAdmission,
} from '@apaar-platform/admission-domain';
import { describe, expect, it } from 'vitest';
import { simulatePolicyScenario } from '../src/index.js';

const IDS = {
  institution: asInstitutionId('SYNTH-INSTITUTION-TWIN'),
  campus: asCampusId('SYNTH-CAMPUS-TWIN'),
  programme: asProgrammeId('SYNTH-PROGRAMME-TWIN'),
  course: asCourseId('SYNTH-COURSE-TWIN'),
};

function approval(id: string, ordinaryIntake: number, schemeCapacity: number): ApprovalSnapshot {
  return {
    academicYear: asAcademicYear('2026-27'),
    approvedBy: 'SYNTH-AUTHORITY',
    campus: { id: IDS.campus, institutionId: IDS.institution, name: 'Synthetic campus' },
    course: {
      campusId: IDS.campus,
      id: IDS.course,
      mode: 'REGULAR',
      name: 'Synthetic engineering',
      programmeId: IDS.programme,
    },
    effectiveFrom: asIsoDate('2026-01-01'),
    effectiveTo: null,
    fnOciGulf: {
      approved: true,
      combinedTotalCapacity: schemeCapacity * 3,
      foreignAndOciCapacity: schemeCapacity * 2,
      foreignNationalAcrossRoutesMaximum: schemeCapacity * 3,
      gulfCapacity: schemeCapacity,
    },
    id: asApprovalSnapshotId(id),
    importBatchReference: 'SYNTH-IMPORT-TWIN',
    institution: { id: IDS.institution, name: 'Synthetic Institute' },
    lateral: {
      approved: true,
      firstYearVacancyCapacity: schemeCapacity,
      supernumeraryCapacity: schemeCapacity,
    },
    nri: { approved: true, maximumWithinOrdinary: Math.min(schemeCapacity, ordinaryIntake) },
    ordinaryIntake,
    pmUspy: {
      approved: true,
      courseCapacity: Math.min(schemeCapacity, 2),
      institutionCapacity: Math.min(schemeCapacity, 2),
    },
    policyVersion: 'SYNTH-POLICY-TWIN',
    programme: { id: IDS.programme, level: 'UNDERGRADUATE', name: 'Engineering' },
    receivedAt: asIsoDateTime('2026-06-01T00:00:00Z'),
    sourceHash: 'SYNTH-HASH-TWIN',
    sourceRecordId: 'SYNTH-SOURCE-TWIN',
    sourceSystem: 'SYNTHETIC',
    supersededBy: null,
    tfw: {
      approved: true,
      capacity: schemeCapacity,
      precedingYearMinimumFillSatisfied: true,
    },
  };
}

function admission(
  suffix: string,
  category: AdmissionCategory,
  lateralCapacitySource: LateralCapacitySource | null = null,
): StudentAdmission {
  return {
    academicYear: asAcademicYear('2026-27'),
    admissionDate: asIsoDate('2026-07-01'),
    campusId: IDS.campus,
    category,
    commandId: asAdmissionCommandId(`SYNTH-COMMAND-${suffix}`),
    courseId: IDS.course,
    categoryEvidenceCheck: {
      method: 'SYNTHETIC_FIXTURE',
      evidenceReference: 'SYNTH-CATEGORY-EVIDENCE',
      reviewerReference: 'SYNTH-REVIEWER',
      checkedAt: asIsoDateTime('2026-07-01T00:00:00Z'),
    },
    eligibilityEvidence: category === 'ORDINARY' ? 'VERIFIED' : 'VERIFIED',
    identityVerification: {
      checkedAt: asIsoDateTime('2026-07-01T10:00:00Z'),
      providerContractVersion: 'SYNTH-1',
      providerRequestReference: `SYNTH-PROVIDER-${suffix}`,
      status: 'VERIFIED',
    },
    institutionId: IDS.institution,
    lateralCapacitySource,
    lifecycleStatus: 'DRAFT',
    programmeId: IDS.programme,
    studentKey: asStudentKey(`SYNTH-STUDENT-${suffix}`),
    studentStatus: {
      foreignNational: category === 'FOREIGN_NATIONAL',
      gulfWorkerChild: category === 'GULF_WORKER_CHILD',
      nri: category === 'NRI',
      oci: category === 'OCI',
    },
  };
}

describe('policy digital twin', () => {
  it('replays the same synthetic cohort through baseline and proposed policy without mutations', () => {
    const baseline = approval('SYNTH-APPROVAL-BASELINE', 20, 1);
    const proposed = approval('SYNTH-APPROVAL-PROPOSED', 40, 2);
    const admissions = [
      admission('NRI-1', 'NRI'),
      admission('NRI-2', 'NRI'),
      admission('ORD-1', 'ORDINARY'),
      admission('ORD-2', 'ORDINARY'),
      admission('TFW-1', 'TFW'),
      admission('TFW-2', 'TFW'),
      admission('PM-1', 'PM_USPY'),
      admission('PM-2', 'PM_USPY'),
    ];

    const result = simulatePolicyScenario({
      initialUsage: { ...emptyCapacityUsage(), ordinaryUsed: 18 },
      baselineApproval: baseline,
      cohort: { admissions, reference: 'SYNTH-COHORT-001' },
      scenario: {
        name: 'Access expansion',
        proposedApproval: proposed,
        rationale: 'Synthetic evaluation only',
        reference: 'SYNTH-SCENARIO-001',
      },
    });

    expect(result.simulationReference).toBe('SIM-SYNTH-COHORT-001-SYNTH-SCENARIO-001');
    expect(result.baseline).toEqual({ accepted: 4, manualReview: 0, rejected: 4 });
    expect(result.proposed).toEqual({ accepted: 8, manualReview: 0, rejected: 0 });
    expect(result.acceptedSeatDelta).toBe(4);
    expect(result.transitions).toHaveLength(4);
    expect(result.ruleImpacts.map(({ ruleCode }) => ruleCode)).toEqual(
      expect.arrayContaining([
        'NRI_CAPACITY_EXCEEDED',
        'ORDINARY_CAPACITY_EXCEEDED',
        'TFW_CAPACITY_EXCEEDED',
        'PM_USPY_COURSE_CAPACITY_EXCEEDED',
      ]),
    );
    expect(result.categoryImpacts.find(({ category }) => category === 'TFW')?.delta).toBe(1);
    expect(result.safety).toEqual({
      decisionMode: 'ADVISORY_ONLY',
      liveLedgerMutated: false,
      usesSyntheticCohort: true,
    });
    expect(baseline.ordinaryIntake).toBe(20);

    const restrictive = simulatePolicyScenario({
      initialUsage: { ...emptyCapacityUsage(), ordinaryUsed: 18 },
      baselineApproval: baseline,
      cohort: { admissions, reference: 'SYNTH-COHORT-RESTRICTIVE' },
      scenario: {
        name: 'Approved control',
        proposedApproval: baseline,
        rationale: 'Synthetic control scenario',
        reference: 'SYNTH-SCENARIO-RESTRICTIVE',
      },
    });
    expect(restrictive.preventedExcessAdmissions).toBe(4);
  });

  it('accounts for every capacity bucket and preserves manual-review outcomes', () => {
    const rich = approval('SYNTH-APPROVAL-RICH', 40, 2);
    const foreignLateral = {
      ...admission('LAT-FN', 'LATERAL_ENTRY', 'LATERAL_SUPERNUMERARY'),
      studentStatus: {
        foreignNational: true,
        gulfWorkerChild: false,
        nri: false,
        oci: false,
      },
    };
    const pending = {
      ...admission('PENDING', 'ORDINARY'),
      identityVerification: {
        ...admission('PENDING', 'ORDINARY').identityVerification,
        status: 'UNVERIFIED' as const,
      },
    };
    const admissions = [
      admission('ORD', 'ORDINARY'),
      admission('NRI', 'NRI'),
      admission('FN', 'FOREIGN_NATIONAL'),
      admission('OCI', 'OCI'),
      admission('GULF', 'GULF_WORKER_CHILD'),
      admission('LAT-S', 'LATERAL_ENTRY', 'LATERAL_SUPERNUMERARY'),
      foreignLateral,
      admission('LAT-V', 'LATERAL_ENTRY', 'LATERAL_FIRST_YEAR_VACANCY'),
      admission('TFW', 'TFW'),
      admission('PM', 'PM_USPY'),
      pending,
      admission('OTHER', 'OTHER_SUPERNUMERARY'),
    ];

    const result = simulatePolicyScenario({
      baselineApproval: rich,
      cohort: { admissions, reference: 'SYNTH-COHORT-RICH' },
      scenario: {
        name: 'No policy change',
        proposedApproval: rich,
        rationale: 'Control replay',
        reference: 'SYNTH-SCENARIO-CONTROL',
      },
    });

    expect(result.baseline).toEqual({ accepted: 10, manualReview: 2, rejected: 0 });
    expect(result.transitions).toEqual([]);
    expect(result.ruleImpacts).toEqual([]);
    expect(result.finalBaselineUsage).toMatchObject({
      foreignAndOciUsed: 2,
      foreignNationalAcrossRoutesUsed: 2,
      gulfUsed: 1,
      lateralFirstYearVacancyUsed: 1,
      lateralSupernumeraryUsed: 2,
      nriWithinOrdinaryUsed: 1,
      ordinaryUsed: 2,
      pmUspyCourseUsed: 1,
      pmUspyInstitutionUsed: 1,
      tfwUsed: 1,
    });
  });
});

describe('simulation assumptions', () => {
  it('uses occupied seats without mutating input and exposes ordering sensitivity', () => {
    const base = approval('SYNTH-OCCUPIED', 20, 1);
    const occupied = { ...emptyCapacityUsage(), ordinaryUsed: 19 };
    const input = {
      baselineApproval: base,
      cohort: {
        reference: 'SYNTH-ORDER-COHORT',
        admissions: [
          admission('SYNTH-ORDER-A', 'ORDINARY'),
          admission('SYNTH-ORDER-B', 'ORDINARY'),
        ],
      },
      scenario: {
        reference: 'SYNTH-ORDER-SCENARIO',
        name: 'SYNTH-CONTROL',
        rationale: 'SYNTH-ORDER-CHECK',
        proposedApproval: base,
      },
      initialUsage: occupied,
    };
    const result = simulatePolicyScenario(input);
    expect(result.baseline.accepted).toBe(1);
    expect(result.finalBaselineUsage.ordinaryUsed).toBe(20);
    expect(occupied.ordinaryUsed).toBe(19);
    expect(result.orderingSensitivity.baselineChangedStudents).toBe(2);
    expect(result.orderingSensitivity.proposedChangedStudents).toBe(2);
    expect(result.orderingSensitivity.reversedBaselineAccepted).toBe(1);
    expect(() =>
      simulatePolicyScenario({ ...input, initialUsage: { ...occupied, ordinaryUsed: -1 } }),
    ).toThrow('non-negative');
    expect(() =>
      simulatePolicyScenario({ ...input, initialUsage: { ...occupied, ordinaryUsed: 0.5 } }),
    ).toThrow('whole');
    expect(() =>
      simulatePolicyScenario({
        ...input,
        cohort: {
          reference: 'SYNTH-DUPLICATE-COHORT',
          admissions: [input.cohort.admissions[0]!, input.cohort.admissions[0]!],
        },
      }),
    ).toThrow('repeated student');
  });
});

describe('authority boundary and reproducibility', () => {
  it('blocks old sixty/five/six configuration and separately labels an explicit amendment', () => {
    const base = approval('SYNTH-SOURCE-BASELINE', 60, 3);
    const proposed = {
      ...base,
      nri: { approved: true, maximumWithinOrdinary: 5 },
      tfw: { ...base.tfw, capacity: 6 },
    };
    const input = {
      baselineApproval: base,
      cohort: { reference: 'SYNTH-BOUNDARY', admissions: [admission('SYNTH-NRI', 'NRI')] },
      scenario: {
        reference: 'SYNTH-CHANGE',
        name: 'SYNTH-CHANGE',
        rationale: 'SYNTH-TEST',
        proposedApproval: proposed,
      },
    };
    const original = JSON.stringify(input);
    const blocked = simulatePolicyScenario(input);
    expect(blocked.baseline.accepted).toBe(1);
    expect(blocked.proposed.rejected).toBe(1);
    expect(blocked.proposedConfigurationFindings).toHaveLength(2);
    const amendment = {
      reference: 'SYNTH-AMENDMENT',
      rationale: 'SYNTH-NOT-AUTHORIZED',
      nriPercent: 10,
      tfwPercent: 10,
    };
    expect(() =>
      simulatePolicyScenario({ ...input, scenario: { ...input.scenario, amendment } }),
    ).toThrow('explicitly declared');
    expect(() =>
      simulatePolicyScenario({
        ...input,
        scenario: { ...input.scenario, kind: 'HYPOTHETICAL_AMENDMENT' },
      }),
    ).toThrow('explicitly declared');
    const hypothetical = simulatePolicyScenario({
      ...input,
      scenario: { ...input.scenario, kind: 'HYPOTHETICAL_AMENDMENT', amendment },
    });
    expect(hypothetical.proposalStatus).toBe('HYPOTHETICAL_AMENDMENT');
    expect(hypothetical.proposed.accepted).toBe(1);
    expect(JSON.stringify(input)).toBe(original);
    expect(simulatePolicyScenario(hypothetical.reproduction)).toEqual(hypothetical);
    expect(blocked.transitions[0]?.explanation).toContain('APPROVAL_CONFIGURATION_INVALID');
  });
});
