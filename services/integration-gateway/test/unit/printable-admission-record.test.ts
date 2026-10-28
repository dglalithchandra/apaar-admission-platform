import { describe, expect, it } from 'vitest';
import { renderAdmissionRecord } from '../../src/printable-admission-record.js';
const record = {
  admissionReference: 'SYNTH-ADMISSION',
  institutionReference: 'SYNTH-INSTITUTION',
  institutionStudentId: 'SYNTH-INSTITUTION-STUDENT-ID',
  studentReference: 'SYNTH-STUDENT',
  academicIdentityReference: 'SYNTH-APAAR',
  programmeReference: 'SYNTH-PROGRAMME',
  academicYear: '2026-27',
  currentStatus: 'ACTIVE',
  decisionReference: 'SYNTH-DECISION',
  generatedAt: '2026-10-28T00:00:00.000Z',
};
describe('printable admission record', () => {
  it('keeps student and academic identity fields separate and makes provenance clear', () => {
    const html = renderAdmissionRecord(record);
    expect(html).toContain('SYNTH-INSTITUTION-STUDENT-ID');
    expect(html).toContain('SYNTH-APAAR');
    expect(html).toContain('not a degree');
    expect(html).toContain('NiyamSetu');
    expect(
      renderAdmissionRecord({
        ...record,
        institutionStudentId: null,
        academicIdentityReference: null,
      }),
    ).toContain('Not supplied by institution');
  });
  it('escapes untrusted field content and includes no executable scripts', () => {
    const html = renderAdmissionRecord({ ...record, studentReference: `SYNTH-<script>"&'test` });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });
});
