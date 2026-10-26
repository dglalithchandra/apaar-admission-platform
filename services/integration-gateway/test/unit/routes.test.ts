import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DELEGATED_ROUTES,
  InMemoryGatewayTelemetry,
  NATIVE_OPERATIONS,
  StructuralContractValidator,
  authorize,
  delegatedSuccessStatus,
  matchDelegatedRoute,
  type GatewayTransportResponse,
  type Principal,
} from '../../src/index.js';

const operator: Principal = {
  actorReference: 'SYNTH-OPERATOR-001',
  institutionId: 'SYNTH-INSTITUTION-001',
  organisationReference: 'SYNTH-INSTITUTION-001',
  roles: ['INSTITUTION_OPERATOR'],
};

describe('OpenAPI transport inventory', () => {
  it('maps every recorded operation exactly once', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../../contracts/openapi/apaar-platform.yaml'),
      'utf8',
    );
    const operations = [...source.matchAll(/^\s+operationId:\s+([^\s]+)$/gm)].map(
      (match) => match[1]!,
    );
    const mapped = [...NATIVE_OPERATIONS, ...DELEGATED_ROUTES.map((item) => item.operationId)];
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual([...operations].sort());
  });

  it('matches path parameters and denies cross-institution access', () => {
    const matched = matchDelegatedRoute('POST', '/v1/institutions/SYNTH-INSTITUTION-002/cases');
    expect(matched).not.toBeNull();
    expect(matched?.path).toEqual({ institutionId: 'SYNTH-INSTITUTION-002' });
    expect(() => authorize(operator, 'CASE_CREATE', matched?.path['institutionId'])).toThrow(
      expect.objectContaining({ code: 'TENANT_SCOPE_DENIED' }),
    );
  });

  it('rejects unexpected downstream response shapes', () => {
    const validator = new StructuralContractValidator();
    const invalid: GatewayTransportResponse = {
      body: { should: 'be csv' },
      status: 200,
    };
    expect(() => validator.validateResponse('downloadAdmissionBatchCorrections', invalid)).toThrow(
      expect.objectContaining({ code: 'RESPONSE_CONTRACT_VIOLATION' }),
    );
  });

  it('enforces recorded success statuses and emits identifier-safe metrics', () => {
    expect(delegatedSuccessStatus('submitAdmission')).toBe(201);
    expect(() => delegatedSuccessStatus('SYNTH-UNKNOWN')).toThrow('Unknown delegated operation');
    const telemetry = new InMemoryGatewayTelemetry();
    telemetry.record({
      durationMilliseconds: 12.345,
      method: 'GET',
      route: '/v1/institutions/SYNTH-INSTITUTION-SECRET/cases/SYNTH-CASE-SECRET',
      status: 200,
    });
    telemetry.record({
      durationMilliseconds: 0.655,
      method: 'GET',
      route: '/v1/institutions/SYNTH-INSTITUTION-SECRET/cases/SYNTH-CASE-SECRET',
      status: 200,
    });
    const metrics = telemetry.prometheus();
    expect(metrics).toContain(
      'apaar_gateway_requests_total{method="GET",route="/v1/institutions/:reference/cases/:reference",status="200"} 2',
    );
    expect(metrics).toContain(' 13.000');
    expect(metrics).not.toContain('SYNTH-INSTITUTION-SECRET');
    expect(metrics).not.toContain('SYNTH-CASE-SECRET');
  });
});
