import { writeFile } from 'node:fs/promises';
import { renderAdmissionRecord } from '../services/integration-gateway/src/printable-admission-record.js';
await writeFile(
  'docs/hackathon/NiyamSetu_Synthetic_Admission_Record.html',
  renderAdmissionRecord({
    admissionReference: 'SYNTH-ADMISSION-EXAMPLE-001',
    institutionReference: 'SYNTH-INSTITUTION-EXAMPLE-001',
    institutionStudentId: 'SYNTH-INSTITUTION-STUDENT-001',
    studentReference: 'SYNTH-STUDENT-REFERENCE-001',
    academicIdentityReference: 'SYNTH-APAAR-EXAMPLE-001',
    programmeReference: 'SYNTH-PROGRAMME-EXAMPLE-001',
    academicYear: '2026-27',
    currentStatus: 'ACTIVE',
    decisionReference: 'SYNTH-DECISION-EXAMPLE-001',
    generatedAt: new Date().toISOString(),
  }),
);
process.stdout.write('Synthetic independent admission record rendered.\n');
