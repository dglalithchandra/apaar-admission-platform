import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://host.docker.internal:8080';

export const options = {
  scenarios: {
    mixed_gateway_workload: {
      executor: 'per-vu-iterations',
      vus: Number(__ENV.VUS || 4),
      iterations: Number(__ENV.ITERATIONS || 10),
      maxDuration: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const json = { 'content-type': 'application/json' };

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function verified(response, expected, label) {
  check(response, { [`${label} returns ${expected}`]: (item) => item.status === expected });
}

export default function () {
  const suffix = `${String(__VU)}-${String(__ITER)}`;
  verified(http.get(`${baseUrl}/health`), 200, 'health');
  verified(
    http.post(
      `${baseUrl}/v1/institutions/SYNTH-INSTITUTION-001/admissions`,
      JSON.stringify({ requestReference: `SYNTH-LOAD-ADMISSION-${suffix}` }),
      {
        headers: {
          ...json,
          authorization: 'Bearer SYNTH-TOKEN-INSTITUTION-ADMIN',
          'idempotency-key': `SYNTH-LOAD-ADMISSION-${suffix}`,
        },
      },
    ),
    201,
    'admission transport',
  );
  verified(
    http.get(`${baseUrl}/v1/institutions/SYNTH-INSTITUTION-001/cases`, {
      headers: { authorization: 'Bearer SYNTH-TOKEN-REVIEWER' },
    }),
    200,
    'case list transport',
  );
  verified(
    http.post(
      `${baseUrl}/v1/academic-identity/verifications`,
      JSON.stringify({ academicIdentity: 'SYNTH-OUTAGE', purpose: 'ADMISSION_LINKING' }),
      { headers: { ...json, authorization: 'Bearer SYNTH-TOKEN-INSTITUTION-OPERATOR' } },
    ),
    200,
    'dependency degradation',
  );
  verified(
    http.post(
      `${baseUrl}/v1/verifications`,
      JSON.stringify({
        admissionReference: 'SYNTH-REGISTRATION-001',
        consentReference: 'SYNTH-CONSENT-LOAD-001',
        legalBasisReference: null,
        purpose: 'SYNTH-LOAD-VERIFICATION',
        requestedClaims: ['ADMISSION_EXISTS'],
      }),
      {
        headers: {
          ...json,
          authorization: 'Bearer SYNTH-TOKEN-VERIFIER',
          'idempotency-key': `SYNTH-LOAD-VERIFY-${suffix}`,
        },
      },
    ),
    200,
    'verification receipt',
  );
  const payload = { academicYear: '2026-27', approvedIntake: 60 };
  const unsigned = {
    authority: 'PROPOSED',
    campusId: 'SYNTH-CAMPUS-001',
    courseId: 'SYNTH-COURSE-001',
    digestSha256: crypto.sha256(canonical(payload), 'hex'),
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-06-30',
    importReference: `SYNTH-LOAD-IMPORT-${suffix}`,
    institutionId: 'SYNTH-INSTITUTION-001',
    payload,
    programmeId: 'SYNTH-PROGRAMME-001',
    sourceSystem: 'SYNTH-LOAD',
    sourceVersion: `SYNTH-LOAD-${suffix}`,
    supersedesImportReference: null,
  };
  verified(
    http.post(
      `${baseUrl}/v1/integration/approval-imports`,
      JSON.stringify({
        ...unsigned,
        integrity: {
          algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
          keyId: 'SYNTH-MANIFEST-KEY-001',
          signature: crypto.sha256(`SYNTHETIC:${canonical(unsigned)}`, 'hex'),
        },
      }),
      { headers: { ...json, authorization: 'Bearer SYNTH-TOKEN-INTEGRATION' } },
    ),
    201,
    'approval import',
  );
  verified(
    http.post(`${baseUrl}/v1/notifications/process`, null, {
      headers: { authorization: 'Bearer SYNTH-TOKEN-INTEGRATION' },
    }),
    200,
    'notification worker',
  );
}
