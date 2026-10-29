import type {
  AcademicYear,
  AdmissionCommandId,
  ApprovalSnapshotId,
  CampusId,
  CourseId,
  InstitutionId,
  IsoDate,
  IsoDateTime,
  ProgrammeId,
  StudentKey,
} from './identifiers.js';

export type ProgrammeLevel =
  | 'DIPLOMA'
  | 'POST_DIPLOMA_CERTIFICATE'
  | 'UNDERGRADUATE'
  | 'POSTGRADUATE_DIPLOMA'
  | 'POSTGRADUATE';

export type CourseMode = 'REGULAR' | 'OPEN_DISTANCE_LEARNING' | 'ONLINE';

export interface Institution {
  readonly id: InstitutionId;
  readonly name: string;
}

export interface Campus {
  readonly id: CampusId;
  readonly institutionId: InstitutionId;
  readonly name: string;
}

export interface Programme {
  readonly id: ProgrammeId;
  readonly name: string;
  readonly level: ProgrammeLevel;
}

export interface Course {
  readonly id: CourseId;
  readonly campusId: CampusId;
  readonly programmeId: ProgrammeId;
  readonly name: string;
  readonly mode: CourseMode;
}

export type AcademicIdentityVerificationStatus =
  | 'VERIFIED'
  | 'NOT_FOUND'
  | 'MISMATCH'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NOT_ELIGIBLE_FOR_APAAR'
  | 'MANUAL_REVIEW'
  | 'UNVERIFIED';

export interface AcademicIdentityVerification {
  readonly canonicalStudentKey?: StudentKey;
  readonly status: AcademicIdentityVerificationStatus;
  readonly checkedAt: IsoDateTime;
  readonly providerContractVersion: string;
  readonly providerRequestReference: string | null;
}

export type AdmissionCategory =
  | 'ORDINARY'
  | 'NRI'
  | 'FOREIGN_NATIONAL'
  | 'OCI'
  | 'GULF_WORKER_CHILD'
  | 'LATERAL_ENTRY'
  | 'TFW'
  | 'PM_USPY'
  | 'OTHER_SUPERNUMERARY';

export type LateralCapacitySource = 'LATERAL_SUPERNUMERARY' | 'LATERAL_FIRST_YEAR_VACANCY';

export type EligibilityEvidenceStatus = 'VERIFIED' | 'PENDING' | 'MISSING';

/** Trusted application assessment; never accepted from a CSV declaration. */
export interface CategoryEvidenceCheck {
  readonly method: 'INDEPENDENT_REVIEW' | 'SYNTHETIC_FIXTURE';
  readonly evidenceReference: string;
  readonly reviewerReference: string;
  readonly checkedAt: IsoDateTime;
}

export type AdmissionLifecycleStatus =
  'DRAFT' | 'PENDING_IDENTITY' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface StudentStatus {
  readonly nri: boolean;
  readonly oci: boolean;
  readonly foreignNational: boolean;
  readonly gulfWorkerChild: boolean;
}

export interface StudentAdmission {
  readonly commandId: AdmissionCommandId;
  readonly studentKey: StudentKey;
  readonly institutionId: InstitutionId;
  readonly campusId: CampusId;
  readonly programmeId: ProgrammeId;
  readonly courseId: CourseId;
  readonly academicYear: AcademicYear;
  readonly admissionDate: IsoDate;
  readonly category: AdmissionCategory;
  readonly lateralCapacitySource: LateralCapacitySource | null;
  readonly studentStatus: StudentStatus;
  readonly eligibilityEvidence: EligibilityEvidenceStatus;
  readonly categoryEvidenceCheck?: CategoryEvidenceCheck;
  readonly identityVerification: AcademicIdentityVerification;
  readonly lifecycleStatus: AdmissionLifecycleStatus;
}

export interface NriCapacityPolicy {
  readonly approved: boolean;
  readonly maximumWithinOrdinary: number;
}

export interface FnOciGulfCapacityPolicy {
  readonly approved: boolean;
  readonly foreignAndOciCapacity: number;
  readonly gulfCapacity: number;
  readonly combinedTotalCapacity: number;
  readonly foreignNationalAcrossRoutesMaximum: number;
}

export interface LateralCapacityPolicy {
  readonly approved: boolean;
  readonly supernumeraryCapacity: number;
  readonly firstYearVacancyCapacity: number;
}

export interface TfwCapacityPolicy {
  readonly approved: boolean;
  readonly capacity: number;
  readonly precedingYearMinimumFillSatisfied: boolean;
}

export interface PmUspyCapacityPolicy {
  readonly approved: boolean;
  readonly courseCapacity: number;
  readonly institutionCapacity: number;
}

export interface ApprovalSnapshot {
  readonly id: ApprovalSnapshotId;
  readonly sourceSystem: string;
  readonly sourceRecordId: string;
  readonly sourceHash: string;
  readonly importBatchReference: string;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  readonly receivedAt: IsoDateTime;
  readonly approvedBy: string;
  readonly supersededBy: ApprovalSnapshotId | null;
  readonly policyVersion: string;
  readonly academicYear: AcademicYear;
  readonly institution: Institution;
  readonly campus: Campus;
  readonly programme: Programme;
  readonly course: Course;
  readonly ordinaryIntake: number;
  readonly nri: NriCapacityPolicy;
  readonly fnOciGulf: FnOciGulfCapacityPolicy;
  readonly lateral: LateralCapacityPolicy;
  readonly tfw: TfwCapacityPolicy;
  readonly pmUspy: PmUspyCapacityPolicy;
}

export interface CapacityUsage {
  readonly ordinaryUsed: number;
  readonly nriWithinOrdinaryUsed: number;
  readonly foreignAndOciUsed: number;
  readonly gulfUsed: number;
  readonly lateralSupernumeraryUsed: number;
  readonly lateralFirstYearVacancyUsed: number;
  readonly tfwUsed: number;
  readonly pmUspyCourseUsed: number;
  readonly pmUspyInstitutionUsed: number;
  readonly foreignNationalAcrossRoutesUsed: number;
}

export type CapacityBucket =
  | 'ORDINARY'
  | 'FN_OCI_SUPERNUMERARY'
  | 'GULF_WORKER_CHILD_SUPERNUMERARY'
  | 'LATERAL_SUPERNUMERARY'
  | 'LATERAL_FIRST_YEAR_VACANCY'
  | 'TFW_SUPERNUMERARY'
  | 'PM_USPY_SUPERNUMERARY';

export interface CapacityReservation {
  readonly bucket: CapacityBucket;
  readonly subcategory: AdmissionCategory | null;
  readonly units: 1;
}

export function emptyCapacityUsage(): CapacityUsage {
  return {
    foreignAndOciUsed: 0,
    foreignNationalAcrossRoutesUsed: 0,
    gulfUsed: 0,
    lateralFirstYearVacancyUsed: 0,
    lateralSupernumeraryUsed: 0,
    nriWithinOrdinaryUsed: 0,
    ordinaryUsed: 0,
    pmUspyCourseUsed: 0,
    pmUspyInstitutionUsed: 0,
    tfwUsed: 0,
  };
}
