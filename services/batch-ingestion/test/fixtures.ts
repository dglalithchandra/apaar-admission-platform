import {
  asAcademicYear,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asProgrammeId,
  asStudentKey,
} from '@apaar-platform/admission-domain';
import {
  CURRENT_TEMPLATE_VERSION,
  type AdmissionRowInput,
  type BatchReferenceGenerator,
} from '../src/index.js';

export const CSV_HEADER =
  'template_version,record_key,student_reference,academic_identity_reference,institution_id,campus_id,programme_id,course_id,academic_year,admission_date,category,lateral_capacity_source,nri,oci,foreign_national,gulf_worker_child,eligibility_evidence';

export function csvRow(suffix: string, overrides: Partial<Record<string, string>> = {}): string {
  const values: Record<string, string> = {
    academic_identity_reference: `SYNTH-IDENTITY-VERIFIED-${suffix}`,
    academic_year: '2026-27',
    admission_date: '2026-08-01',
    campus_id: 'SYNTH-CAMPUS-0001',
    category: 'ORDINARY',
    course_id: 'SYNTH-COURSE-0001',
    eligibility_evidence: 'VERIFIED',
    foreign_national: 'false',
    gulf_worker_child: 'false',
    institution_id: 'SYNTH-INST-0001',
    lateral_capacity_source: '',
    nri: 'false',
    oci: 'false',
    programme_id: 'SYNTH-PROG-0001',
    record_key: `SYNTH-RECORD-${suffix}`,
    student_reference: `SYNTH-STUDENT-${suffix}`,
    template_version: CURRENT_TEMPLATE_VERSION,
    ...overrides,
  };
  return [
    'template_version',
    'record_key',
    'student_reference',
    'academic_identity_reference',
    'institution_id',
    'campus_id',
    'programme_id',
    'course_id',
    'academic_year',
    'admission_date',
    'category',
    'lateral_capacity_source',
    'nri',
    'oci',
    'foreign_national',
    'gulf_worker_child',
    'eligibility_evidence',
  ]
    .map((key) => values[key] ?? '')
    .join(',');
}

export function csvFile(...rows: string[]): string {
  return `${CSV_HEADER}\n${rows.join('\n')}\n`;
}

export function admissionRow(suffix: string): AdmissionRowInput {
  return {
    academicIdentityReference: `SYNTH-IDENTITY-VERIFIED-${suffix}`,
    academicYear: asAcademicYear('2026-27'),
    admissionDate: asIsoDate('2026-08-01'),
    campusId: asCampusId('SYNTH-CAMPUS-0001'),
    category: 'ORDINARY',
    courseId: asCourseId('SYNTH-COURSE-0001'),
    eligibilityEvidence: 'VERIFIED',
    institutionId: asInstitutionId('SYNTH-INST-0001'),
    lateralCapacitySource: null,
    programmeId: asProgrammeId('SYNTH-PROG-0001'),
    recordKey: `SYNTH-RECORD-${suffix}`,
    studentKey: asStudentKey(`SYNTH-STUDENT-${suffix}`),
    studentStatus: { foreignNational: false, gulfWorkerChild: false, nri: false, oci: false },
    templateVersion: CURRENT_TEMPLATE_VERSION,
  };
}

export class SyntheticBatchReferences implements BatchReferenceGenerator {
  private count = 0;

  public next(kind: Parameters<BatchReferenceGenerator['next']>[0]): string {
    this.count += 1;
    return `SYNTH-${kind}-${String(this.count).padStart(4, '0')}`;
  }
}
