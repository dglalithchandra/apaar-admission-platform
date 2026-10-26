import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AcademicIdentitySimulator,
  ApprovalImportService,
  GatewayHttpApplication,
  InMemoryAdmissionFacts,
  InMemoryApprovalManifestRepository,
  InMemoryNotificationRepository,
  InMemoryVerificationReceiptRepository,
  NotificationWorker,
  SyntheticNotificationGateway,
  SyntheticSigningAdapter,
  SyntheticTokenAuthenticator,
  VerificationService,
  manifestDigest,
  type ExistingServiceTransportPort,
  type GatewayClock,
  type Principal,
} from '../../src/index.js';

const clock: GatewayClock = { now: () => '2026-10-26T12:00:00.000Z' };
const principals: Readonly<Record<string, Principal>> = {
  'SYNTH-TOKEN-CHECKER': {
    actorReference: 'SYNTH-CHECKER-001',
    institutionId: null,
    organisationReference: 'SYNTH-AICTE',
    roles: ['AICTE_CHECKER'],
  },
  'SYNTH-TOKEN-INSTITUTION': {
    actorReference: 'SYNTH-OPERATOR-001',
    institutionId: 'SYNTH-INSTITUTION-001',
    organisationReference: 'SYNTH-INSTITUTION-001',
    roles: ['INSTITUTION_OPERATOR'],
  },
  'SYNTH-TOKEN-INTEGRATOR': {
    actorReference: 'SYNTH-INTEGRATOR-001',
    institutionId: null,
    organisationReference: 'SYNTH-AICTE',
    roles: ['SERVICE_INTEGRATION_CLIENT'],
  },
  'SYNTH-TOKEN-REVIEWER': {
    actorReference: 'SYNTH-REVIEWER-001',
    institutionId: null,
    organisationReference: 'SYNTH-AICTE',
    roles: ['AICTE_REVIEWER'],
  },
  'SYNTH-TOKEN-VERIFIER': {
    actorReference: 'SYNTH-VERIFIER-001',
    institutionId: null,
    organisationReference: 'SYNTH-EMPLOYER',
    roles: ['AUTHORIZED_VERIFIER'],
  },
  'SYNTH-TOKEN-AUDITOR': {
    actorReference: 'SYNTH-AUDITOR-001',
    institutionId: null,
    organisationReference: 'SYNTH-AICTE',
    roles: ['AUDITOR'],
  },
};

describe('authenticated HTTP gateway', () => {
  let app: GatewayHttpApplication;
  let baseUrl: string;
  let dependencyState: 'UP' | 'DEGRADED' = 'UP';
  const execute = vi.fn<ExistingServiceTransportPort['execute']>();

  beforeEach(async () => {
    execute.mockImplementation(async (operation) => ({ operation, state: 'SYNTH-SUCCESS' }));
    const auth = new SyntheticTokenAuthenticator('test', new Map(Object.entries(principals)));
    const verification = new VerificationService(
      new InMemoryAdmissionFacts(
        new Map([
          [
            'SYNTH-REGISTRATION-001',
            {
              academicYear: '2026-27',
              admissionReference: 'SYNTH-REGISTRATION-001',
              currentStatus: 'ACCEPTED',
              institutionReference: 'SYNTH-INSTITUTION-001',
              programmeReference: 'SYNTH-PROGRAMME-001',
            },
          ],
        ]),
      ),
      new InMemoryVerificationReceiptRepository(),
      new SyntheticSigningAdapter(),
      clock,
      () => 'SYNTH-VERIFICATION-HTTP-001',
    );
    app = new GatewayHttpApplication(
      {
        approvalImporter: new ApprovalImportService(new InMemoryApprovalManifestRepository()),
        authenticator: auth,
        clock,
        dependencies: () => ({ apaar: dependencyState, database: 'UP', notifications: 'DISABLED' }),
        existingServices: { execute },
        identityVerifier: new AcademicIdentitySimulator(clock),
        nextCorrelationReference: () => 'SYNTH-CORRELATION-GENERATED',
        notificationWorker: new NotificationWorker(
          new InMemoryNotificationRepository([]),
          new SyntheticNotificationGateway(),
        ),
        verificationService: verification,
      },
      {
        host: '127.0.0.1',
        maximumJsonBytes: 1_024,
        port: 0,
        requestTimeoutMs: 5_000,
        requestsPerMinute: 20,
      },
    );
    baseUrl = `http://127.0.0.1:${String(await app.start())}`;
  });

  afterEach(async () => {
    await app.stop();
  });

  async function request(
    path: string,
    token?: string,
    body?: unknown,
    method = 'POST',
  ): Promise<Response> {
    const init: RequestInit = {
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        'x-correlation-id': 'SYNTH-CORRELATION-HTTP-001',
      },
      method,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(`${baseUrl}${path}`, init);
  }

  it('serves public health and readiness without leaking details', async () => {
    const health = await request('/health', undefined, undefined, 'GET');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'UP' });
    dependencyState = 'DEGRADED';
    const readiness = await request('/ready', undefined, undefined, 'GET');
    expect(readiness.status).toBe(503);
    expect(await readiness.json()).toMatchObject({ status: 'DEGRADED' });
  });

  it('returns RFC-style unauthenticated, forbidden and tenant-scoped problems', async () => {
    const missing = await request('/v1/dependencies', undefined, undefined, 'GET');
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({
      errors: [{ code: 'UNAUTHENTICATED' }],
      traceId: 'SYNTH-CORRELATION-HTTP-001',
    });
    const forbidden = await request(
      '/v1/dependencies',
      'SYNTH-TOKEN-INSTITUTION',
      undefined,
      'GET',
    );
    expect(forbidden.status).toBe(403);
    const hidden = await request(
      '/v1/institutions/SYNTH-INSTITUTION-002/cases',
      'SYNTH-TOKEN-INSTITUTION',
      { caseType: 'ADMISSION_CORRECTION' },
    );
    expect(hidden.status).toBe(404);
    const audit = await request('/v1/dependencies', 'SYNTH-TOKEN-AUDITOR', undefined, 'GET');
    expect(audit.status).toBe(200);
  });

  it('enforces institution, reviewer and checker roles before delegating existing services', async () => {
    const created = await request(
      '/v1/institutions/SYNTH-INSTITUTION-001/cases',
      'SYNTH-TOKEN-INSTITUTION',
      { caseType: 'ADMISSION_CORRECTION' },
    );
    expect(created.status).toBe(201);
    const recommended = await request(
      '/v1/cases/SYNTH-CASE-001/recommendations',
      'SYNTH-TOKEN-REVIEWER',
      { outcome: 'APPROVE' },
    );
    expect(recommended.status).toBe(200);
    const decided = await request('/v1/cases/SYNTH-CASE-001/decisions', 'SYNTH-TOKEN-CHECKER', {
      outcome: 'APPROVED',
    });
    expect(decided.status).toBe(200);
    expect(execute.mock.calls.map(([operation]) => operation)).toEqual([
      'CASE_CREATE',
      'CASE_RECOMMEND',
      'CASE_DECIDE',
    ]);
  });

  it('normalises identity verification and validates its purpose', async () => {
    const verified = await request(
      '/v1/academic-identity/verifications',
      'SYNTH-TOKEN-INSTITUTION',
      { academicIdentity: 'SYNTH-VERIFIED', purpose: 'ADMISSION_LINKING' },
    );
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ status: 'VERIFIED' });
    const invalid = await request(
      '/v1/academic-identity/verifications',
      'SYNTH-TOKEN-INSTITUTION',
      { academicIdentity: 'SYNTH-VERIFIED', purpose: 'SYNTH-UNKNOWN' },
    );
    expect(invalid.status).toBe(422);
  });

  it('imports a digest-verified manifest and returns an exact replay', async () => {
    const payload = { approvedIntake: 60 };
    const body = {
      authority: 'SOURCE_CONFIRMED',
      campusId: 'SYNTH-CAMPUS-001',
      courseId: 'SYNTH-COURSE-001',
      digestSha256: manifestDigest(payload),
      effectiveFrom: '2026-07-01',
      effectiveTo: '2027-06-30',
      importReference: 'SYNTH-IMPORT-HTTP-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      payload,
      programmeId: 'SYNTH-PROGRAMME-001',
      sourceSystem: 'SYNTH-AICTE',
      sourceVersion: 'SYNTH-V1',
      supersedesImportReference: null,
    };
    const imported = await request(
      '/v1/integration/approval-imports',
      'SYNTH-TOKEN-INTEGRATOR',
      body,
    );
    expect(imported.status).toBe(201);
    expect(await imported.json()).toMatchObject({ replayed: false, status: 'IMPORTED' });
    const replay = await request(
      '/v1/integration/approval-imports',
      'SYNTH-TOKEN-INTEGRATOR',
      body,
    );
    expect(await replay.json()).toMatchObject({ replayed: true });
  });

  it('issues a minimal verification receipt and rejects malformed or unknown routes', async () => {
    const receipt = await fetch(`${baseUrl}/v1/verifications`, {
      body: JSON.stringify({
        admissionReference: 'SYNTH-REGISTRATION-001',
        consentReference: null,
        legalBasisReference: 'SYNTH-LEGAL-BASIS-001',
        purpose: 'SYNTH-EMPLOYMENT-CHECK',
        requestedClaims: ['ADMISSION_EXISTS'],
      }),
      headers: {
        authorization: 'Bearer SYNTH-TOKEN-VERIFIER',
        'content-type': 'application/json',
        'idempotency-key': 'SYNTH-HTTP-IDEMPOTENCY-001',
      },
      method: 'POST',
    });
    expect(receipt.status).toBe(200);
    expect(await receipt.json()).toMatchObject({
      claims: { ADMISSION_EXISTS: true },
      verificationReference: 'SYNTH-VERIFICATION-HTTP-001',
    });
    const malformed = await fetch(`${baseUrl}/v1/verifications`, {
      body: '{',
      headers: { authorization: 'Bearer SYNTH-TOKEN-VERIFIER', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(malformed.status).toBe(422);
    const unsupported = await fetch(`${baseUrl}/v1/verifications`, {
      body: '{}',
      headers: { authorization: 'Bearer SYNTH-TOKEN-VERIFIER', 'content-type': 'text/plain' },
      method: 'POST',
    });
    expect(unsupported.status).toBe(415);
    const missing = await request('/v1/SYNTH-UNKNOWN', 'SYNTH-TOKEN-AUDITOR', undefined, 'GET');
    expect(missing.status).toBe(404);
  });
});
