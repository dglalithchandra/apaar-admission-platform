declare const brand: unique symbol;

type BrandedString<Name extends string> = string & { readonly [brand]: Name };

export type InstitutionId = BrandedString<'InstitutionId'>;
export type CampusId = BrandedString<'CampusId'>;
export type ProgrammeId = BrandedString<'ProgrammeId'>;
export type CourseId = BrandedString<'CourseId'>;
export type ApprovalSnapshotId = BrandedString<'ApprovalSnapshotId'>;
export type StudentKey = BrandedString<'StudentKey'>;
export type AdmissionCommandId = BrandedString<'AdmissionCommandId'>;
export type AcademicYear = BrandedString<'AcademicYear'>;
export type IsoDate = BrandedString<'IsoDate'>;
export type IsoDateTime = BrandedString<'IsoDateTime'>;

function asNonEmptyIdentifier<Name extends string>(
  value: string,
  label: Name,
): BrandedString<Name> {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }

  return value as BrandedString<Name>;
}

export function asInstitutionId(value: string): InstitutionId {
  return asNonEmptyIdentifier(value, 'InstitutionId');
}

export function asCampusId(value: string): CampusId {
  return asNonEmptyIdentifier(value, 'CampusId');
}

export function asProgrammeId(value: string): ProgrammeId {
  return asNonEmptyIdentifier(value, 'ProgrammeId');
}

export function asCourseId(value: string): CourseId {
  return asNonEmptyIdentifier(value, 'CourseId');
}

export function asApprovalSnapshotId(value: string): ApprovalSnapshotId {
  return asNonEmptyIdentifier(value, 'ApprovalSnapshotId');
}

export function asStudentKey(value: string): StudentKey {
  return asNonEmptyIdentifier(value, 'StudentKey');
}

export function asAdmissionCommandId(value: string): AdmissionCommandId {
  return asNonEmptyIdentifier(value, 'AdmissionCommandId');
}

export function asAcademicYear(value: string): AcademicYear {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new TypeError('AcademicYear must use YYYY-YY format.');
  }

  const startYearText = value.slice(0, 4);
  const endYearText = value.slice(5, 7);
  const expectedEnd = ((Number(startYearText) + 1) % 100).toString().padStart(2, '0');
  if (endYearText !== expectedEnd) {
    throw new TypeError('AcademicYear must describe consecutive years.');
  }

  return value as AcademicYear;
}

export function asIsoDate(value: string): IsoDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new TypeError('IsoDate must use YYYY-MM-DD format.');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError('IsoDate must be a real calendar date.');
  }

  return value as IsoDate;
}

export function asIsoDateTime(value: string): IsoDateTime {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError('IsoDateTime must be a valid ISO-8601 timestamp.');
  }

  asIsoDate(value.slice(0, 10));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new TypeError('IsoDateTime must be a valid ISO-8601 timestamp.');
  }

  return value as IsoDateTime;
}
