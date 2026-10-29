import { Buffer } from 'node:buffer';
import { createPublicKey, verify } from 'node:crypto';
import './prepare-local-signing-key.mjs';
import { spawnSync } from 'node:child_process';

/* global Blob, FormData, Headers */

const base = process.env.FULL_SYSTEM_BASE_URL ?? 'http://127.0.0.1:5173';
const compose = ['compose', '-f', 'infra/compose/compose.yaml'];

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0)
    throw new Error(`docker ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout?.trim() ?? '';
}

async function waitReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/ready`);
      if (response.ok && (await response.json()).status === 'UP') return;
    } catch {
      // The proxy may be temporarily unavailable while containers restart.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The integrated stack did not become ready.');
}

async function session(role) {
  const response = await fetch(`${base}/v1/reference-sessions/${role}`);
  if (!response.ok) throw new Error(`Synthetic ${role} session is unavailable.`);
  return (await response.json()).token;
}

async function request(path, token, init = {}, expected = 200) {
  const headers = new Headers(init.headers);
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  const body =
    text === ''
      ? null
      : response.headers.get('content-type')?.includes('json') === true
        ? JSON.parse(text)
        : text;
  if (response.status !== expected) {
    throw new Error(
      `${init.method ?? 'GET'} ${path}: expected ${expected}, got ${response.status}: ${text}`,
    );
  }
  return body;
}

function command(path, token, body, key, expected = 200) {
  return request(
    path,
    token,
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      method: 'POST',
    },
    expected,
  );
}

docker([...compose, 'up', '--build', '--wait'], { stdio: 'inherit' });
await waitReady();

const roles = [
  'INSTITUTION_OPERATOR',
  'INSTITUTION_ADMINISTRATOR',
  'AICTE_REVIEWER',
  'AICTE_CHECKER',
  'AUDITOR',
  'AUTHORIZED_VERIFIER',
  'SERVICE_INTEGRATION_CLIENT',
];
const tokens = Object.fromEntries(
  await Promise.all(roles.map(async (role) => [role, await session(role)])),
);
const operator = tokens.INSTITUTION_OPERATOR;
const runReference = Date.now().toString();
const caseKey = (name) => `SYNTH-${name}-FULL-${runReference}`;

const template = await fetch(`${base}/v1/admission-batches/templates/1.0.csv`, {
  headers: { authorization: `Bearer ${operator}` },
});
if (!template.ok || !(await template.text()).startsWith('template_version,record_key')) {
  throw new Error('The versioned CSV template was not available from the gateway.');
}

const header =
  'template_version,record_key,student_reference,academic_identity_reference,institution_id,campus_id,programme_id,course_id,academic_year,admission_date,category,lateral_capacity_source,nri,oci,foreign_national,gulf_worker_child,eligibility_evidence';
const rows = [
  '1.0,SYNTH-RECORD-FULL-001,SYNTH-STUDENT-FULL-001,SYNTH-APAAR-FULL-001,SYNTH-INSTITUTION-001,SYNTH-CAMPUS-001,SYNTH-PROGRAMME-001,SYNTH-COURSE-001,2026-27,2026-07-01,ORDINARY,,false,false,false,false,VERIFIED',
  '1.0,SYNTH-RECORD-FULL-002,SYNTH-STUDENT-FULL-002,SYNTH-APAAR-NOT-FOUND,SYNTH-INSTITUTION-001,SYNTH-CAMPUS-001,SYNTH-PROGRAMME-001,SYNTH-COURSE-001,2026-27,2026-07-01,ORDINARY,,false,false,false,false,VERIFIED',
  '1.0,SYNTH-RECORD-FULL-003,SYNTH-STUDENT-FULL-003,SYNTH-APAAR-MANUAL,SYNTH-INSTITUTION-001,SYNTH-CAMPUS-001,SYNTH-PROGRAMME-001,SYNTH-COURSE-001,2026-27,2026-07-01,ORDINARY,,false,false,false,false,VERIFIED',
  '1.0,SYNTH-RECORD-FULL-004,SYNTH-STUDENT-FULL-004,SYNTH-APAAR-OUTAGE,SYNTH-INSTITUTION-001,SYNTH-CAMPUS-001,SYNTH-PROGRAMME-001,SYNTH-COURSE-001,2026-27,2026-07-01,ORDINARY,,false,false,false,false,VERIFIED',
];
const runRows = rows.map((row) =>
  row
    .replace(/SYNTH-STUDENT-FULL-(\d+)/g, `SYNTH-STUDENT-FULL-$1-${runReference}`)
    .replace(/SYNTH-RECORD-FULL-(\d+)/g, `SYNTH-RECORD-FULL-$1-${runReference}`)
    .replace('SYNTH-APAAR-FULL-001', `SYNTH-APAAR-FULL-001-${runReference}`),
);
const csv = `${[header, ...runRows].join('\n')}\n`;

function upload(content, key) {
  const form = new FormData();
  form.set('file', new Blob([content], { type: 'text/csv' }), 'synthetic-full-system.csv');
  form.set('originalFilename', 'synthetic-full-system.csv');
  form.set('templateVersion', '1.0');
  form.set('actorReference', 'SYNTH-OPERATOR-001');
  form.set('reason', 'Synthetic full-system verification');
  form.set('requestReference', 'SYNTH-FULL-SYSTEM-REQUEST-001');
  return request(
    '/v1/institutions/SYNTH-INSTITUTION-001/admission-batches',
    operator,
    {
      body: form,
      headers: { 'idempotency-key': key },
      method: 'POST',
    },
    202,
  );
}

const receipt = await upload(csv, caseKey('UPLOAD'));
let summary;
for (let attempt = 0; attempt < 80; attempt += 1) {
  summary = await request(`/v1/admission-batches/${receipt.batchId}`, operator);
  if (!['RECEIVED', 'SCANNING', 'VALIDATING', 'PROCESSING'].includes(summary.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (summary.totals.accepted !== 1 || summary.totals.manualReview !== 3) {
  throw new Error(`Unexpected batch reconciliation: ${JSON.stringify(summary.totals)}`);
}
const batchRows = await request(`/v1/admission-batches/${receipt.batchId}/rows`, operator);
const accepted = batchRows.items.find((item) => item.status === 'ACCEPTED');
if (!accepted?.admissionReference) throw new Error('No accepted synthetic admission was produced.');
const browsed = await request(
  `/v1/institutions/SYNTH-INSTITUTION-001/admissions?search=${encodeURIComponent(accepted.admissionReference)}`,
  operator,
);
if (
  browsed.items.length !== 1 ||
  browsed.items[0].registration_reference !== accepted.admissionReference
)
  throw new Error('Admission search did not find the stored record.');
const storedEvidence = await request(
  `/v1/admissions/${encodeURIComponent(accepted.admissionReference)}`,
  operator,
);
if (
  !storedEvidence.evidence.decisions.length ||
  !storedEvidence.evidence.approval?.sourceRecord ||
  !storedEvidence.evidence.identityChecks.length
)
  throw new Error('Stored decision provenance is incomplete.');
await request(
  '/v1/institutions/SYNTH-INSTITUTION-001/admissions',
  tokens.AUTHORIZED_VERIFIER,
  {},
  403,
);
await request('/v1/institutions/SYNTH-OTHER-TENANT/admissions', operator, {}, 404);
await request(
  '/v1/institutions/SYNTH-INSTITUTION-001/admissions?search=' + 'x'.repeat(129),
  operator,
  {},
  422,
);

await request(`/v1/admission-batches/${receipt.batchId}/corrections.csv`, operator);

const replay = await upload(csv, caseKey('UPLOAD'));
if (!replay.replayed || replay.batchId !== receipt.batchId)
  throw new Error('Batch replay was not exactly idempotent.');
await upload(
  csv.replace('SYNTH-STUDENT-FULL-001', 'SYNTH-STUDENT-FULL-CONFLICT'),
  caseKey('UPLOAD'),
)
  .then(() => {
    throw new Error('Conflicting idempotency reuse was accepted.');
  })
  .catch((error) => {
    if (!String(error).includes('got 409')) throw error;
  });

const duplicateCsv = `${header}\n${runRows[0].replace('SYNTH-RECORD-FULL-001', 'SYNTH-RECORD-FRESH-KEY').replace('SYNTH-STUDENT-FULL-001', 'SYNTH-STUDENT-ALIAS-001')}\n`;
const duplicateBatch = await upload(duplicateCsv, caseKey('DUPLICATE-FRESH-KEY'));
let duplicateSummary;
for (let attempt = 0; attempt < 80; attempt += 1) {
  duplicateSummary = await request(`/v1/admission-batches/${duplicateBatch.batchId}`, operator);
  if (!['RECEIVED', 'SCANNING', 'VALIDATING', 'PROCESSING'].includes(duplicateSummary.status))
    break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const duplicateRows = await request(
  `/v1/admission-batches/${duplicateBatch.batchId}/rows`,
  operator,
);
if (
  duplicateSummary.totals.accepted !== 0 ||
  duplicateSummary.totals.rejected !== 1 ||
  !duplicateRows.items[0]?.findings.some(
    (finding) => finding.code === 'STUDENT_ADMISSION_DUPLICATE',
  )
) {
  throw new Error(
    'Fresh-key duplicate student admission was not rejected with a stable rule code.',
  );
}

const oversight = await request(
  '/v1/oversight/capacity?academicYear=2026-27',
  tokens.AICTE_REVIEWER,
);
if (
  !Array.isArray(oversight.rows) ||
  oversight.rows.length === 0 ||
  oversight.rows.some((row) => row.drift !== 0)
)
  throw new Error('Capacity oversight did not reconcile with its reservation ledger.');
await request('/v1/oversight/capacity?academicYear=2026-27', tokens.AUTHORIZED_VERIFIER, {}, 403);
const oversightExport = await request(
  '/v1/oversight/capacity.csv?academicYear=2026-27',
  tokens.AICTE_REVIEWER,
);
if (!oversightExport.includes('approvedCapacity'))
  throw new Error('The scoped capacity export was unavailable.');
const printable = await request(
  `/v1/admissions/${accepted.admissionReference}/record.html`,
  operator,
);
if (!printable.includes('not a degree') || !printable.includes('Not supplied by institution'))
  throw new Error(
    'The independent printable record did not explain its provenance or missing student ID.',
  );

const admission = await request(`/v1/admissions/${accepted.admissionReference}`, operator);
const casePage = await request('/v1/institutions/SYNTH-INSTITUTION-001/cases?limit=100', operator);
let caseRecord = casePage.items.find(
  (item) => item.admissionId === admission.id && item.caseType === 'ADMISSION_CANCELLATION',
);
if (caseRecord === undefined) {
  caseRecord = await command(
    '/v1/institutions/SYNTH-INSTITUTION-001/cases',
    operator,
    {
      admissionId: admission.id,
      caseId: caseKey('CASE'),
      caseReference: caseKey('CASE-REFERENCE'),
      caseType: 'ADMISSION_CANCELLATION',
      policyAuthority: 'AUTHORITY_CONFIGURED',
      policyVersion: 'SYNTH-POLICY-2026-01',
      priority: 'NORMAL',
    },
    caseKey('CASE-CREATE'),
    201,
  );
}
const caseId = caseRecord.caseId;
if (caseRecord.state === 'DRAFT') {
  caseRecord = await command(
    `/v1/cases/${caseId}/submit`,
    operator,
    { expectedVersion: caseRecord.version },
    caseKey('CASE-SUBMIT'),
  );
}
if (caseRecord.state === 'SUBMITTED') {
  caseRecord = await command(
    `/v1/cases/${caseId}/assignments`,
    tokens.AICTE_CHECKER,
    {
      assignmentId: caseKey('ASSIGNMENT'),
      expectedVersion: caseRecord.version,
      reviewerReference: 'SYNTH-REVIEWER-001',
    },
    caseKey('CASE-ASSIGN'),
  );
  caseRecord = await command(
    `/v1/cases/${caseId}/review-start`,
    tokens.AICTE_REVIEWER,
    { expectedVersion: caseRecord.version },
    caseKey('CASE-START'),
  );
}
if (caseRecord.state === 'UNDER_REVIEW') {
  caseRecord = await command(
    `/v1/cases/${caseId}/conflict-declarations`,
    tokens.AICTE_REVIEWER,
    { declarationId: caseKey('CONFLICT'), expectedVersion: caseRecord.version, hasConflict: false },
    caseKey('CASE-CONFLICT'),
  );
  if ((await request(`/v1/cases/${caseId}`, tokens.AICTE_REVIEWER)).conflictStatus !== 'CLEAR')
    throw new Error('Stored reviewer conflict declaration was lost in the read model.');
  caseRecord = await command(
    `/v1/cases/${caseId}/recommendations`,
    tokens.AICTE_REVIEWER,
    {
      expectedVersion: caseRecord.version,
      explanation: 'Synthetic evidence supports cancellation.',
      policyVersion: 'SYNTH-POLICY-2026-01',
      reasonCode: 'SYNTH-CANCELLATION',
      recommendation: 'APPROVE',
      recommendationId: caseKey('RECOMMENDATION'),
    },
    caseKey('CASE-RECOMMEND'),
  );
}
if (caseRecord.state === 'RECOMMENDED') {
  caseRecord = await command(
    `/v1/cases/${caseId}/decisions`,
    tokens.AICTE_CHECKER,
    {
      decisionId: caseKey('CASE-DECISION'),
      expectedVersion: caseRecord.version,
      explanation: 'Independent synthetic checker approval.',
      outcome: 'APPROVED',
      policyVersion: 'SYNTH-POLICY-2026-01',
      reasonCode: 'SYNTH-CANCELLATION',
    },
    caseKey('CASE-DECIDE'),
  );
}
const implementation =
  caseRecord.state === 'IMPLEMENTED'
    ? { state: 'IMPLEMENTED' }
    : await command(
        `/v1/cases/${caseId}/implement-cancellation`,
        tokens.AICTE_CHECKER,
        {
          expectedVersion: caseRecord.version,
          implementationId: caseKey('IMPLEMENTATION'),
          receiptReference: caseKey('IMPLEMENTATION-RECEIPT'),
          sourceAdmissionVersionId: caseKey('ADMISSION-VERSION'),
        },
        caseKey('CASE-IMPLEMENT'),
      );
if (implementation.state !== 'IMPLEMENTED') throw new Error('Approved case was not implemented.');

const readmissionCsv = `${header}\n${runRows[0].replace('SYNTH-RECORD-FULL-001', 'SYNTH-RECORD-READMISSION')}\n`;
const readmissionBatch = await upload(readmissionCsv, caseKey('READMISSION'));
let readmission;
for (let attempt = 0; attempt < 80; attempt++) {
  readmission = await request(`/v1/admission-batches/${readmissionBatch.batchId}`, operator);
  if (!['RECEIVED', 'SCANNING', 'VALIDATING', 'PROCESSING'].includes(readmission.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (readmission.totals.accepted !== 1)
  throw new Error('A completed cancellation continued to block legitimate readmission.');

const verification = await command(
  '/v1/verifications',
  tokens.AUTHORIZED_VERIFIER,
  {
    admissionReference: accepted.admissionReference,
    consentReference: null,
    legalBasisReference: 'SYNTH-LEGAL-BASIS-FULL-001',
    purpose: 'SYNTH-FULL-SYSTEM',
    requestedClaims: ['ADMISSION_EXISTS', 'CURRENT_STATUS'],
  },
  caseKey('VERIFICATION'),
);
if (Object.keys(verification.claims).some((claim) => claim.includes('APAAR')))
  throw new Error('Verification disclosed an unrequested identifier.');

const pilot = await request('/v1/institutions/SYNTH-INSTITUTION-001/pilot-readiness', operator);
const execution = await request(
  '/v1/pilot-executions/SYNTH-EXECUTION-REFERENCE-001',
  tokens.AICTE_REVIEWER,
);
if (pilot.readiness_outcome !== 'PASS' || execution.state !== 'COMPLETED')
  throw new Error('Seeded pilot evidence was not connected.');

const events = await request('/v1/events?after=0&limit=100', tokens.AICTE_REVIEWER);
if (!Array.isArray(events.items) || events.items.length === 0)
  throw new Error('Tenant-authorised operational events were unavailable.');

docker([
  ...compose,
  'restart',
  'gateway',
  'batch-worker',
  'outbox-worker',
  'notification-worker',
  'pilot-worker',
]);
await waitReady();
const verifiedAfterRestart = await request(
  `/v1/verifications/${verification.verificationReference}`,
  tokens.AUTHORIZED_VERIFIER,
);
const signingPayload = JSON.stringify({
  claims: Object.fromEntries(
    Object.entries(verifiedAfterRestart.claims).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ),
  expiresAt: verifiedAfterRestart.expiresAt,
  issuedAt: verifiedAfterRestart.issuedAt,
  legalBasisReference: verifiedAfterRestart.legalBasisReference,
  purpose: verifiedAfterRestart.purpose,
  requesterOrganisation: verifiedAfterRestart.requesterOrganisation,
  status: 'ACTIVE',
  verificationReference: verifiedAfterRestart.verificationReference,
});
const publicIssuer = await request('/v1/verification-key', tokens.AUTHORIZED_VERIFIER);
const issuerPublicKey = createPublicKey(publicIssuer.pem);
if (publicIssuer.keyId !== verifiedAfterRestart.keyId)
  throw new Error('Receipt issuer key does not match the advertised key.');
if (
  verifiedAfterRestart.algorithm !== 'Ed25519' ||
  !verify(
    null,
    Buffer.from(signingPayload),
    issuerPublicKey,
    Buffer.from(verifiedAfterRestart.signature, 'base64url'),
  )
) {
  throw new Error('Independent public-key verification failed after gateway restart.');
}
const afterRestart = await request(`/v1/admission-batches/${receipt.batchId}`, operator);
if (afterRestart.totals.accepted !== 1) throw new Error('Accepted state did not survive restart.');

process.stdout.write(
  JSON.stringify(
    {
      admissionReference: accepted.admissionReference,
      batchId: receipt.batchId,
      caseState: implementation.state,
      eventCount: events.items.length,
      manualReview: summary.totals.manualReview,
      pilotState: execution.state,
      restartPersistence: 'passed',
      freshKeyDuplicateRejected: true,
      readmissionAfterCancellation: 'passed',
      capacityReconciliation: 'passed',
      printableRecord: 'passed',
      publicKeyVerificationAfterRestart: 'passed',
      rolesExercised: roles.length,
    },
    null,
    2,
  ) + '\n',
);
