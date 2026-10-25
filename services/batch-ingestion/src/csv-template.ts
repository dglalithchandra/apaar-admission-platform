import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  asAcademicYear,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asProgrammeId,
  asStudentKey,
  type AdmissionCategory,
  type StudentAdmission,
} from '@apaar-platform/admission-domain';
import { parse } from 'csv-parse';
import { BatchValidationError } from './errors.js';
import {
  CURRENT_TEMPLATE_VERSION,
  MAX_FIELD_CHARACTERS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_ROWS,
  type AdmissionRowInput,
  type BatchFinding,
  type ParsedBatch,
  type ParsedBatchRow,
} from './model.js';

export const CSV_HEADERS = [
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
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];
type RawRow = Record<CsvHeader, string>;

const REQUIRED_VALUE_HEADERS: readonly CsvHeader[] = CSV_HEADERS.filter(
  (header) => header !== 'lateral_capacity_source',
);
const CATEGORIES = new Set<AdmissionCategory>([
  'ORDINARY',
  'NRI',
  'FOREIGN_NATIONAL',
  'OCI',
  'GULF_WORKER_CHILD',
  'LATERAL_ENTRY',
  'TFW',
  'PM_USPY',
  'OTHER_SUPERNUMERARY',
]);
const ELIGIBILITY = new Set<StudentAdmission['eligibilityEvidence']>([
  'VERIFIED',
  'PENDING',
  'MISSING',
]);
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function finding(
  code: BatchFinding['code'],
  message: string,
  field: string | null = null,
): BatchFinding {
  return { code, field, message, severity: 'ERROR' };
}

function validateHeaders(headers: string[]): string[] {
  const findings: BatchFinding[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) {
      findings.push(finding('DUPLICATE_HEADER', `Header ${header} occurs more than once.`, header));
    }
    seen.add(header);
    if (!(CSV_HEADERS as readonly string[]).includes(header)) {
      findings.push(
        finding('UNKNOWN_HEADER', `Header ${header} is not part of template 1.0.`, header),
      );
    }
  }
  for (const header of CSV_HEADERS) {
    if (!seen.has(header)) {
      findings.push(finding('MISSING_HEADER', `Required header ${header} is missing.`, header));
    }
  }
  if (findings.length > 0) {
    throw new BatchValidationError('The CSV header is invalid.', findings);
  }
  return headers;
}

function booleanValue(value: string, field: CsvHeader, findings: BatchFinding[]): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  findings.push(finding('FIELD_INVALID', `${field} must be true or false.`, field));
  return false;
}

function buildInput(raw: RawRow, findings: BatchFinding[]): AdmissionRowInput | null {
  if (raw.template_version !== CURRENT_TEMPLATE_VERSION) {
    findings.push(
      finding(
        'TEMPLATE_VERSION_UNSUPPORTED',
        `Template version ${raw.template_version || '(empty)'} is not supported.`,
        'template_version',
      ),
    );
  }
  const category = raw.category as AdmissionCategory;
  if (!CATEGORIES.has(category)) {
    findings.push(finding('FIELD_INVALID', 'category is not recognised.', 'category'));
  }
  const eligibility = raw.eligibility_evidence as StudentAdmission['eligibilityEvidence'];
  if (!ELIGIBILITY.has(eligibility)) {
    findings.push(
      finding('FIELD_INVALID', 'eligibility_evidence is not recognised.', 'eligibility_evidence'),
    );
  }
  const lateral = raw.lateral_capacity_source;
  if (
    lateral !== '' &&
    lateral !== 'LATERAL_SUPERNUMERARY' &&
    lateral !== 'LATERAL_FIRST_YEAR_VACANCY'
  ) {
    findings.push(
      finding(
        'FIELD_INVALID',
        'lateral_capacity_source must be empty or a supported lateral bucket.',
        'lateral_capacity_source',
      ),
    );
  }

  const studentStatus = {
    foreignNational: booleanValue(raw.foreign_national, 'foreign_national', findings),
    gulfWorkerChild: booleanValue(raw.gulf_worker_child, 'gulf_worker_child', findings),
    nri: booleanValue(raw.nri, 'nri', findings),
    oci: booleanValue(raw.oci, 'oci', findings),
  };
  if (findings.length > 0) return null;

  try {
    return {
      academicIdentityReference: raw.academic_identity_reference,
      academicYear: asAcademicYear(raw.academic_year),
      admissionDate: asIsoDate(raw.admission_date),
      campusId: asCampusId(raw.campus_id),
      category,
      courseId: asCourseId(raw.course_id),
      eligibilityEvidence: eligibility,
      institutionId: asInstitutionId(raw.institution_id),
      lateralCapacitySource:
        lateral === '' ? null : (lateral as StudentAdmission['lateralCapacitySource']),
      programmeId: asProgrammeId(raw.programme_id),
      recordKey: raw.record_key,
      studentKey: asStudentKey(raw.student_reference),
      studentStatus,
      templateVersion: CURRENT_TEMPLATE_VERSION,
    };
  } catch (error) {
    findings.push(
      finding(
        'FIELD_INVALID',
        error instanceof Error ? error.message : 'A typed field is invalid.',
      ),
    );
    return null;
  }
}

function validateRow(raw: RawRow, rowNumber: number): ParsedBatchRow {
  const findings: BatchFinding[] = [];
  for (const header of REQUIRED_VALUE_HEADERS) {
    if (raw[header] === '') {
      findings.push(finding('FIELD_REQUIRED', `${header} is required.`, header));
    }
  }
  for (const [header, value] of Object.entries(raw)) {
    if (value.length > MAX_FIELD_CHARACTERS) {
      findings.push(
        finding(
          'FIELD_INVALID',
          `${header} exceeds ${String(MAX_FIELD_CHARACTERS)} characters.`,
          header,
        ),
      );
    }
    if (FORMULA_PREFIX.test(value)) {
      findings.push(
        finding(
          'FORMULA_PREFIX_REJECTED',
          `${header} begins with a spreadsheet formula prefix.`,
          header,
        ),
      );
    }
  }
  const input = buildInput(raw, findings);
  return {
    findings,
    input,
    recordKey: raw.record_key,
    rowNumber,
    safeValues: raw,
  };
}

async function* decodedUtf8(
  content: AsyncIterable<Buffer | string>,
  state: { bytes: number; readonly hash: ReturnType<typeof createHash> },
): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const value of content) {
      const chunk = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
      state.bytes += chunk.byteLength;
      if (state.bytes > MAX_UPLOAD_BYTES) {
        throw new BatchValidationError('The CSV exceeds the upload limit.', [
          finding('BATCH_FILE_TOO_LARGE', `The upload exceeds ${String(MAX_UPLOAD_BYTES)} bytes.`),
        ]);
      }
      state.hash.update(chunk);
      yield decoder.decode(chunk, { stream: true });
    }
    yield decoder.decode();
  } catch (error) {
    if (error instanceof BatchValidationError) throw error;
    throw new BatchValidationError('The CSV must be valid UTF-8.', [
      finding('BATCH_UTF8_REQUIRED', 'The uploaded bytes are not valid UTF-8.'),
    ]);
  }
}

export async function parseAdmissionCsv(
  content: AsyncIterable<Buffer | string>,
): Promise<ParsedBatch> {
  const state = { bytes: 0, hash: createHash('sha256') };
  const parser = parse({
    bom: true,
    columns: validateHeaders,
    relax_column_count: false,
    skip_empty_lines: true,
  });
  const streaming = pipeline(Readable.from(decodedUtf8(content, state)), parser);
  const rows: ParsedBatchRow[] = [];
  try {
    for await (const record of parser) {
      if (rows.length >= MAX_UPLOAD_ROWS) {
        throw new BatchValidationError('The CSV exceeds the row limit.', [
          finding(
            'BATCH_ROW_LIMIT_EXCEEDED',
            `The upload exceeds ${String(MAX_UPLOAD_ROWS)} data rows.`,
          ),
        ]);
      }
      rows.push(validateRow(record as RawRow, rows.length + 2));
    }
    await streaming;
  } catch (error) {
    await streaming.catch(() => undefined);
    if (error instanceof BatchValidationError) throw error;
    throw new BatchValidationError('The CSV could not be parsed.', [
      finding('BATCH_MALFORMED_CSV', 'The CSV quoting or column structure is malformed.'),
    ]);
  }
  if (rows.length === 0) {
    throw new BatchValidationError('The CSV contains no data rows.', [
      finding('BATCH_EMPTY', 'The CSV must contain a header and at least one data row.'),
    ]);
  }

  const firstByKey = new Map<string, number>();
  const duplicateIndexes = new Set<number>();
  rows.forEach((row, index) => {
    const first = firstByKey.get(row.recordKey);
    if (first === undefined) firstByKey.set(row.recordKey, index);
    else {
      duplicateIndexes.add(first);
      duplicateIndexes.add(index);
    }
  });
  const finalRows = rows.map((row, index): ParsedBatchRow => {
    if (!duplicateIndexes.has(index)) return row;
    const findings = [
      ...row.findings,
      finding(
        'DUPLICATE_RECORD_KEY',
        `Record key ${row.recordKey || '(empty)'} occurs more than once in this file.`,
        'record_key',
      ),
    ];
    return { ...row, findings, input: null };
  });

  return {
    rows: finalRows,
    sha256: state.hash.digest('hex'),
    totalBytes: state.bytes,
  };
}

function csvCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function correctionCsv(rows: readonly ParsedBatchRow[]): string {
  const header = [...CSV_HEADERS, 'error_codes', 'error_messages'].join(',');
  const lines = rows
    .filter((row) => row.findings.length > 0)
    .map((row) => {
      const values = CSV_HEADERS.map((key) => csvCell(row.safeValues[key] ?? ''));
      const codes = row.findings.map(({ code }) => code).join('|');
      const messages = row.findings.map(({ message }) => message).join('|');
      return [...values, csvCell(codes), csvCell(messages)].join(',');
    });
  return `${header}\n${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`;
}

export function templateCsv(): string {
  return `${CSV_HEADERS.join(',')}\n`;
}
