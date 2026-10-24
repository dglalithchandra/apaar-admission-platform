import type {
  AcademicIdentityVerification,
  ApprovalSnapshot,
  StudentAdmission,
} from './model/entities.js';
import type {
  AcademicYear,
  CampusId,
  CourseId,
  InstitutionId,
  IsoDate,
  IsoDateTime,
  ProgrammeId,
} from './model/identifiers.js';
import type { AdmissionPolicyDecision } from './model/validation.js';

export interface ApprovalSnapshotQuery {
  readonly institutionId: InstitutionId;
  readonly campusId: CampusId;
  readonly programmeId: ProgrammeId;
  readonly courseId: CourseId;
  readonly academicYear: AcademicYear;
  readonly admissionDate: IsoDate;
}

export interface ApprovalSnapshotRepository {
  findEffective(query: ApprovalSnapshotQuery): Promise<ApprovalSnapshot | null>;
}

export interface AcademicIdentityVerificationRequest {
  readonly studentKey: StudentAdmission['studentKey'];
  readonly purpose: 'ADMISSION_LINKING' | 'CORRECTION_REVIEW';
}

export interface AcademicIdentityVerifier {
  verify(request: AcademicIdentityVerificationRequest): Promise<AcademicIdentityVerification>;
}

export interface Clock {
  now(): IsoDateTime;
}

export interface AdmissionAuditEvent {
  readonly eventType: 'ADMISSION_POLICY_EVALUATED';
  readonly admission: StudentAdmission;
  readonly decision: AdmissionPolicyDecision;
}

export interface AuditWriter {
  append(event: AdmissionAuditEvent): Promise<void>;
}
