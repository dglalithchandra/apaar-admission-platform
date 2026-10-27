import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { BatchValidationError } from '../../src/errors.js';
import { correctionCsv, parseAdmissionCsv, templateCsv } from '../../src/csv-template.js';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_ROWS } from '../../src/model.js';
import { CSV_HEADER, csvFile, csvRow } from '../fixtures.js';

async function* content(value: string | Buffer): AsyncGenerator<Buffer> {
  const buffer = typeof value === 'string' ? Buffer.from(value) : value;
  const midpoint = Math.max(1, Math.floor(buffer.length / 2));
  yield buffer.subarray(0, midpoint);
  yield buffer.subarray(midpoint);
}

async function codes(value: string | Buffer): Promise<readonly string[]> {
  try {
    await parseAdmissionCsv(content(value));
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(BatchValidationError);
    return (error as BatchValidationError).findings.map(({ code }) => code);
  }
}

describe('versioned admission CSV', () => {
  it('parses a valid UTF-8 stream and computes its digest', async () => {
    const csv = csvFile(csvRow('0001'));
    const parsed = await parseAdmissionCsv(content(csv));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.input?.recordKey).toBe('SYNTH-RECORD-0001');
    expect(parsed.rows[0]?.rowNumber).toBe(2);
    expect(parsed.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.totalBytes).toBe(Buffer.byteLength(csv));
  });

  it('reports empty, malformed and invalid UTF-8 files', async () => {
    await expect(codes(`${CSV_HEADER}\n`)).resolves.toContain('BATCH_EMPTY');
    await expect(codes(`${CSV_HEADER}\n"unterminated`)).resolves.toContain('BATCH_MALFORMED_CSV');
    await expect(codes(Buffer.from([0xc3, 0x28]))).resolves.toContain('BATCH_UTF8_REQUIRED');
  });

  it('rejects missing, duplicate and unknown headers', async () => {
    await expect(codes('record_key\nSYNTH-RECORD-1\n')).resolves.toContain('MISSING_HEADER');
    await expect(
      codes(`${CSV_HEADER},record_key\n${csvRow('0001')},SYNTH-RECORD-0001\n`),
    ).resolves.toContain('DUPLICATE_HEADER');
    await expect(
      codes(`${CSV_HEADER},unknown_field\n${csvRow('0001')},value\n`),
    ).resolves.toContain('UNKNOWN_HEADER');
  });

  it('marks unsupported versions, missing fields and formula prefixes invalid', async () => {
    const parsed = await parseAdmissionCsv(
      content(
        csvFile(
          csvRow('0001', {
            institution_id: '=DANGEROUS',
            student_reference: '',
            template_version: '9.0',
          }),
        ),
      ),
    );
    const rowCodes = parsed.rows[0]?.findings.map(({ code }) => code);
    expect(rowCodes).toEqual(
      expect.arrayContaining([
        'FIELD_REQUIRED',
        'FORMULA_PREFIX_REJECTED',
        'TEMPLATE_VERSION_UNSUPPORTED',
      ]),
    );
    expect(parsed.rows[0]?.input).toBeNull();
  });

  it('reports invalid enums, booleans, lateral buckets, typed values and field lengths', async () => {
    const parsed = await parseAdmissionCsv(
      content(
        csvFile(
          csvRow('0001', {
            academic_year: 'invalid-year',
            category: 'INVALID_CATEGORY',
            eligibility_evidence: 'INVALID_EVIDENCE',
            lateral_capacity_source: 'INVALID_BUCKET',
            nri: 'yes',
            oci: 'no',
            student_reference: `SYNTH-${'X'.repeat(260)}`,
          }),
        ),
      ),
    );
    expect(parsed.rows[0]?.input).toBeNull();
    expect(
      parsed.rows[0]?.findings.filter(({ code }) => code === 'FIELD_INVALID').length,
    ).toBeGreaterThan(4);
  });

  it('turns typed-domain conversion failures into deterministic row findings', async () => {
    const parsed = await parseAdmissionCsv(
      content(csvFile(csvRow('0001', { academic_year: '2026-99' }))),
    );
    expect(parsed.rows[0]?.input).toBeNull();
    expect(parsed.rows[0]?.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'FIELD_INVALID' })]),
    );
  });

  it('marks every occurrence of a duplicate record key invalid', async () => {
    const parsed = await parseAdmissionCsv(
      content(csvFile(csvRow('0001'), csvRow('0002', { record_key: 'SYNTH-RECORD-0001' }))),
    );
    expect(parsed.rows.every(({ input }) => input === null)).toBe(true);
    expect(parsed.rows.every(({ findings }) => findings[0]?.code === 'DUPLICATE_RECORD_KEY')).toBe(
      true,
    );
  });

  it('enforces byte and row limits', async () => {
    await expect(codes(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x61))).resolves.toContain(
      'BATCH_FILE_TOO_LARGE',
    );
    const rows = Array.from({ length: MAX_UPLOAD_ROWS + 1 }, (_, index) =>
      csvRow(String(index).padStart(5, '0')),
    );
    await expect(codes(csvFile(...rows))).resolves.toContain('BATCH_ROW_LIMIT_EXCEEDED');
  }, 15_000);

  it('generates a header-only template and formula-safe correction export', () => {
    expect(templateCsv()).toBe(`${CSV_HEADER}\n`);
    const csv = correctionCsv([
      {
        findings: [
          {
            code: 'FIELD_INVALID',
            field: 'student_reference',
            message: 'Synthetic error',
            severity: 'ERROR',
          },
        ],
        input: null,
        recordKey: 'SYNTH-RECORD-0001',
        rowNumber: 2,
        safeValues: { student_reference: '=1+1' },
      },
    ]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('FIELD_INVALID');
    expect(correctionCsv([])).toBe(`${CSV_HEADER},error_codes,error_messages\n`);
  });
});
