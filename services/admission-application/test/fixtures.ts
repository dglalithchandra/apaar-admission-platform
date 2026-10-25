import {
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
  type AdmissionCategory,
  type ApprovalSnapshot,
  type CapacityUsage,
  type StudentAdmission,
} from '@apaar-platform/admission-domain';
import { createHash } from 'node:crypto';
import type { ReferenceGenerator, SubmitAdmissionCommand } from '../src/model.js';

export function syntheticApproval(overrides: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot {
  const institutionId = asInstitutionId('SYNTH-INST-0001');
  const campusId = asCampusId('SYNTH-CAMPUS-0001');
  const programmeId = asProgrammeId('SYNTH-PROG-0001');
  return {
    academicYear: asAcademicYear('2026-27'),
    approvedBy: 'SYNTH-AUTHORITY-0001',
    campus: { id: campusId, institutionId, name: 'Synthetic Main Campus' },
    course: {
      campusId,
      id: asCourseId('SYNTH-COURSE-0001'),
      mode: 'REGULAR',
      name: 'Synthetic Engineering Course',
      programmeId,
    },
    effectiveFrom: asIsoDate('2026-04-01'),
    effectiveTo: asIsoDate('2027-03-31'),
    fnOciGulf: {
      approved: true,
      combinedTotalCapacity: 9,
      foreignAndOciCapacity: 6,
      foreignNationalAcrossRoutesMaximum: 9,
      gulfCapacity: 3,
    },
    id: asApprovalSnapshotId('SYNTH-APPROVAL-0001'),
    importBatchReference: 'SYNTH-IMPORT-0001',
    institution: { id: institutionId, name: 'Synthetic Institute of Technology' },
    lateral: { approved: true, firstYearVacancyCapacity: 2, supernumeraryCapacity: 6 },
    nri: { approved: true, maximumWithinOrdinary: 3 },
    ordinaryIntake: 60,
    pmUspy: { approved: true, courseCapacity: 2, institutionCapacity: 10 },
    policyVersion: 'SYNTH-POLICY-2026',
    programme: { id: programmeId, level: 'UNDERGRADUATE', name: 'Synthetic Programme' },
    receivedAt: asIsoDateTime('2026-04-02T09:00:00.000Z'),
    sourceHash: 'SYNTH-SOURCE-HASH-0001',
    sourceRecordId: 'SYNTH-SOURCE-RECORD-0001',
    sourceSystem: 'SYNTHETIC-SOURCE',
    supersededBy: null,
    tfw: { approved: true, capacity: 3, precedingYearMinimumFillSatisfied: true },
    ...overrides,
  };
}

function studentStatus(category: AdmissionCategory): StudentAdmission['studentStatus'] {
  return {
    foreignNational: category === 'FOREIGN_NATIONAL',
    gulfWorkerChild: category === 'GULF_WORKER_CHILD',
    nri: category === 'NRI',
    oci: category === 'OCI',
  };
}

export function syntheticCommand(
  suffix: string,
  category: AdmissionCategory = 'ORDINARY',
  identityStatus: StudentAdmission['identityVerification']['status'] = 'VERIFIED',
): SubmitAdmissionCommand {
  const approval = syntheticApproval();
  return {
    admission: {
      academicYear: approval.academicYear,
      admissionDate: asIsoDate('2026-08-01'),
      campusId: approval.campus.id,
      category,
      commandId: asAdmissionCommandId(`SYNTH-CMD-${suffix}`),
      courseId: approval.course.id,
      eligibilityEvidence: 'VERIFIED',
      identityVerification: {
        checkedAt: asIsoDateTime('2026-08-01T08:00:00.000Z'),
        providerContractVersion: 'SYNTH-IDENTITY-1',
        providerRequestReference: `SYNTH-IDENTITY-REQUEST-${suffix}`,
        status: identityStatus,
      },
      institutionId: approval.institution.id,
      lateralCapacitySource: category === 'LATERAL_ENTRY' ? 'LATERAL_SUPERNUMERARY' : null,
      lifecycleStatus: 'DRAFT',
      programmeId: approval.programme.id,
      studentKey: asStudentKey(`SYNTH-STUDENT-${suffix}`),
      studentStatus: studentStatus(category),
    },
    context: {
      actorReference: 'SYNTH-ACTOR-0001',
      correlationReference: `SYNTH-CORRELATION-${suffix}`,
      idempotencyKey: `SYNTH-IDEMPOTENCY-${suffix}`,
      institutionId: approval.institution.id,
      reason: 'SYNTHETIC_ADMISSION_SUBMISSION',
      requestHash: createHash('sha256').update(`SYNTH-REQUEST-${suffix}`).digest('hex'),
      requestReference: `SYNTH-REQUEST-${suffix}`,
    },
  };
}

export function syntheticUsage(overrides: Partial<CapacityUsage> = {}): CapacityUsage {
  return { ...emptyCapacityUsage(), ...overrides };
}

export class SyntheticReferenceGenerator implements ReferenceGenerator {
  private count = 0;

  public next(kind: Parameters<ReferenceGenerator['next']>[0]): string {
    this.count += 1;
    return `SYNTH-${kind}-${this.count.toString().padStart(4, '0')}`;
  }
}
