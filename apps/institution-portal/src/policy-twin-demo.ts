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
  type StudentAdmission,
} from '@apaar-platform/admission-domain';
import { simulatePolicyScenario, type SimulationResult } from '@apaar-platform/policy-digital-twin';

const institutionId = asInstitutionId('SYNTH-INSTITUTION-POLICY-LAB');
const campusId = asCampusId('SYNTH-CAMPUS-POLICY-LAB');
const programmeId = asProgrammeId('SYNTH-PROGRAMME-POLICY-LAB');
const courseId = asCourseId('SYNTH-COURSE-POLICY-LAB');

export const BASELINE_LEVERS = { nriLimit: 5, ordinaryIntake: 60, tfwCapacity: 6 } as const;

function approval(
  id: string,
  levers: {
    readonly nriLimit: number;
    readonly ordinaryIntake: number;
    readonly tfwCapacity: number;
  },
): ApprovalSnapshot {
  return {
    academicYear: asAcademicYear('2026-27'),
    approvedBy: 'SYNTH-AICTE-POLICY-AUTHORITY',
    campus: { id: campusId, institutionId, name: 'Synthetic Bengaluru campus' },
    course: {
      campusId,
      id: courseId,
      mode: 'REGULAR',
      name: 'Computer Science and Engineering',
      programmeId,
    },
    effectiveFrom: asIsoDate('2026-01-01'),
    effectiveTo: null,
    fnOciGulf: {
      approved: true,
      combinedTotalCapacity: 9,
      foreignAndOciCapacity: 6,
      foreignNationalAcrossRoutesMaximum: 6,
      gulfCapacity: 3,
    },
    id: asApprovalSnapshotId(id),
    importBatchReference: 'SYNTH-IMPORT-POLICY-LAB',
    institution: { id: institutionId, name: 'Synthetic Institute of Technology' },
    lateral: { approved: true, firstYearVacancyCapacity: 4, supernumeraryCapacity: 6 },
    nri: { approved: true, maximumWithinOrdinary: levers.nriLimit },
    ordinaryIntake: levers.ordinaryIntake,
    pmUspy: { approved: true, courseCapacity: 2, institutionCapacity: 2 },
    policyVersion: 'SYNTH-POLICY-2026',
    programme: { id: programmeId, level: 'UNDERGRADUATE', name: 'Bachelor of Technology' },
    receivedAt: asIsoDateTime('2026-06-01T00:00:00Z'),
    sourceHash: 'SYNTH-SHA256-POLICY-LAB',
    sourceRecordId: 'SYNTH-APPROVAL-RECORD-POLICY-LAB',
    sourceSystem: 'SYNTHETIC_REFERENCE',
    supersededBy: null,
    tfw: {
      approved: true,
      capacity: levers.tfwCapacity,
      precedingYearMinimumFillSatisfied: true,
    },
  };
}

function admission(
  index: number,
  category: AdmissionCategory,
  identityVerified = true,
): StudentAdmission {
  const suffix = `${category}-${String(index).padStart(3, '0')}${identityVerified ? '' : '-PENDING'}`;
  return {
    academicYear: asAcademicYear('2026-27'),
    admissionDate: asIsoDate('2026-07-10'),
    campusId,
    category,
    commandId: asAdmissionCommandId(`SYNTH-COMMAND-${suffix}`),
    courseId,
    eligibilityEvidence: 'VERIFIED',
    identityVerification: {
      checkedAt: asIsoDateTime('2026-07-10T10:00:00Z'),
      providerContractVersion: 'SYNTH-APAAR-1',
      providerRequestReference: `SYNTH-APAAR-REQUEST-${suffix}`,
      status: identityVerified ? 'VERIFIED' : 'UNVERIFIED',
    },
    institutionId,
    lateralCapacitySource: null,
    lifecycleStatus: 'DRAFT',
    programmeId,
    studentKey: asStudentKey(`SYNTH-STUDENT-${suffix}`),
    studentStatus: {
      foreignNational: false,
      gulfWorkerChild: false,
      nri: category === 'NRI',
      oci: false,
    },
  };
}

const range = (count: number): readonly number[] =>
  Array.from({ length: count }, (_, index) => index);
const cohort = [
  ...range(2).map((index) => admission(index, 'ORDINARY', false)),
  ...range(7).map((index) => admission(index, 'NRI')),
  ...range(63).map((index) => admission(index, 'ORDINARY')),
  ...range(10).map((index) => admission(index, 'TFW')),
  ...range(2).map((index) => admission(index, 'PM_USPY')),
];

export function runPolicyTwin(
  levers: {
    readonly nriLimit: number;
    readonly ordinaryIntake: number;
    readonly tfwCapacity: number;
  },
  ordinaryOccupied = 0,
): SimulationResult {
  return simulatePolicyScenario({
    initialUsage: { ...emptyCapacityUsage(), ordinaryUsed: ordinaryOccupied },
    baselineApproval: approval('SYNTH-APPROVAL-BASELINE', BASELINE_LEVERS),
    cohort: { admissions: cohort, reference: 'SYNTH-COHORT-84-ADMISSIONS' },
    scenario: {
      name: 'AICTE policy sandbox proposal',
      proposedApproval: approval(
        `SYNTH-APPROVAL-PROPOSED-${String(levers.ordinaryIntake)}-${String(levers.nriLimit)}-${String(levers.tfwCapacity)}`,
        levers,
      ),
      rationale: 'Explore impact before accountable policy approval.',
      reference: `SYNTH-SCENARIO-${String(levers.ordinaryIntake)}-${String(levers.nriLimit)}-${String(levers.tfwCapacity)}-OCC-${String(ordinaryOccupied)}`,
    },
  });
}
