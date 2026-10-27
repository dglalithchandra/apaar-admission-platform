import http from 'k6/http';
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

function verified(response, expected, label) {
  check(response, { [`${label} returns ${expected}`]: (item) => item.status === expected });
}

export default function () {
  verified(http.get(`${baseUrl}/health`), 200, 'health');
  verified(
    http.get(`${baseUrl}/v1/admission-batches/templates`, {
      headers: { authorization: 'Bearer SYNTH-TOKEN-INSTITUTION-ADMIN' },
    }),
    200,
    'batch metadata',
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
    http.get(`${baseUrl}/v1/pilot-executions/SYNTH-EXECUTION-REFERENCE-001`, {
      headers: { authorization: 'Bearer SYNTH-TOKEN-REVIEWER' },
    }),
    200,
    'pilot execution read',
  );
  verified(
    http.get(`${baseUrl}/metrics`, {
      headers: { authorization: 'Bearer SYNTH-TOKEN-AUDITOR' },
    }),
    200,
    'authorised metrics',
  );
  verified(http.get(`${baseUrl}/ready`), 200, 'readiness');
}
