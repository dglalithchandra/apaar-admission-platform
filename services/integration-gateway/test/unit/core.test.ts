import { describe, expect, it, vi } from 'vitest';
import {
  AcademicIdentitySimulator,
  ApprovalImportService,
  AuthorizedAcademicIdentityAdapter,
  InMemoryAdmissionFacts,
  InMemoryApprovalManifestRepository,
  InMemoryNotificationRepository,
  InMemoryVerificationReceiptRepository,
  NotificationWorker,
  OidcBearerAuthenticator,
  SyntheticNotificationGateway,
  SyntheticManifestIntegrityAdapter,
  SyntheticSigningAdapter,
  SyntheticTokenAuthenticator,
  VerificationService,
  VerificationStatusService,
  authorize,
  loadGatewayConfig,
  manifestDigest,
  redactSecurityValue,
  redactSecurityObject,
  type ApprovalImportManifest,
  type ApprovalManifestRepository,
  type GatewayClock,
  type Principal,
} from '../../src/index.js';

const clock: GatewayClock = { now: () => '2026-10-26T12:00:00.000Z' };
const institution: Principal = {
  actorReference: 'SYNTH-ACTOR-INSTITUTION',
  institutionId: 'SYNTH-INSTITUTION-001',
  organisationReference: 'SYNTH-ORG-INSTITUTION',
  roles: ['INSTITUTION_OPERATOR'],
};
const verifier: Principal = {
  actorReference: 'SYNTH-ACTOR-VERIFIER',
  institutionId: null,
  organisationReference: 'SYNTH-ORG-VERIFIER',
  roles: ['AUTHORIZED_VERIFIER'],
};
const integrator: Principal = {
  actorReference: 'SYNTH-ACTOR-INTEGRATOR',
  institutionId: null,
  organisationReference: 'SYNTH-ORG-AICTE',
  roles: ['SERVICE_INTEGRATION_CLIENT'],
};

function manifest(overrides: Partial<ApprovalImportManifest> = {}): ApprovalImportManifest {
  const payload = overrides.payload ?? { approvedIntake: 60, academicYear: '2026-27' };
  const provisional: ApprovalImportManifest = {
    authority: 'SOURCE_CONFIRMED',
    campusId: 'SYNTH-CAMPUS-001',
    courseId: 'SYNTH-COURSE-001',
    digestSha256: manifestDigest(payload),
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-06-30',
    importReference: 'SYNTH-APPROVAL-IMPORT-001',
    integrity: { algorithm: 'SYNTH-PENDING', keyId: 'SYNTH-PENDING', signature: 'SYNTH-PENDING' },
    institutionId: 'SYNTH-INSTITUTION-001',
    payload,
    programmeId: 'SYNTH-PROGRAMME-001',
    sourceSystem: 'SYNTH-AICTE-FEED',
    sourceVersion: 'SYNTH-VERSION-001',
    supersedesImportReference: null,
    ...overrides,
  };
  if (overrides.integrity !== undefined) return provisional;
  const { integrity: _integrity, ...unsigned } = provisional;
  return { ...unsigned, integrity: new SyntheticManifestIntegrityAdapter('test').sign(unsigned) };
}

describe('authentication, authorization and configuration', () => {
  it('authenticates synthetic tokens only outside production and enforces scope', async () => {
    const auth = new SyntheticTokenAuthenticator('test', new Map([['SYNTH-TOKEN', institution]]));
    await expect(auth.authenticate('Bearer SYNTH-TOKEN')).resolves.toEqual(institution);
    await expect(auth.authenticate(undefined)).resolves.toBeNull();
    await expect(auth.authenticate('Basic SYNTH-TOKEN')).resolves.toBeNull();
    expect(() => authorize(institution, 'CASE_CREATE', 'SYNTH-INSTITUTION-001')).not.toThrow();
    expect(() => authorize(institution, 'CASE_CREATE', 'SYNTH-INSTITUTION-002')).toThrow(
      expect.objectContaining({ code: 'TENANT_SCOPE_DENIED', status: 404 }),
    );
    expect(() => authorize(institution, 'CASE_DECIDE')).toThrow(
      expect.objectContaining({ code: 'ACTION_FORBIDDEN' }),
    );
    expect(() => new SyntheticTokenAuthenticator('production', new Map())).toThrow(
      expect.objectContaining({ code: 'UNSAFE_PRODUCTION_CONFIGURATION' }),
    );
  });

  it('delegates bearer verification and rejects unsafe production configuration', async () => {
    const jwt = new OidcBearerAuthenticator({ verify: vi.fn().mockResolvedValue(integrator) });
    await expect(jwt.authenticate('Bearer SYNTH-JWT')).resolves.toEqual(integrator);
    await expect(jwt.authenticate(undefined)).resolves.toBeNull();
    expect(loadGatewayConfig({ NODE_ENV: 'test', APAAR_MODE: 'simulator' })).toMatchObject({
      apaarMode: 'simulator',
      environment: 'test',
      port: 8080,
    });
    expect(() =>
      loadGatewayConfig({ NODE_ENV: 'production', SYNTHETIC_AUTH_ENABLED: 'true' }),
    ).toThrow(expect.objectContaining({ code: 'UNSAFE_PRODUCTION_CONFIGURATION' }));
    expect(() =>
      loadGatewayConfig({ NODE_ENV: 'production', APAAR_MODE: 'authorized-http' }),
    ).toThrow(expect.objectContaining({ code: 'EXTERNAL_CONTRACT_UNAVAILABLE' }));
    expect(() => loadGatewayConfig({ NODE_ENV: 'unsupported' })).toThrow();
    expect(() => loadGatewayConfig({ APAAR_MODE: 'unsupported' })).toThrow();
    expect(() => loadGatewayConfig({ GATEWAY_PORT: '99999' })).toThrow();
    expect(
      loadGatewayConfig({
        ALLOWED_ORIGINS: 'https://one.example, https://two.example',
        APAAR_MODE: 'authorized-http',
        APAAR_OPERATION_URL: 'https://provider.example/operation',
      }),
    ).toMatchObject({
      allowedOrigins: ['https://one.example', 'https://two.example'],
      apaarMode: 'authorized-http',
    });
    expect(redactSecurityValue('accessToken', 'SYNTH-TOKEN')).toBe('[REDACTED]');
    expect(redactSecurityValue('status', 'UP')).toBe('UP');
    expect(
      redactSecurityObject({
        collection: [{ mobile: 'SYNTH-MOBILE' }, 'SYNTH-SAFE'],
        nested: { academicIdentity: 'SYNTH-SHOULD-NOT-APPEAR', status: 'UP' },
        token: 'SYNTH-TOKEN',
      }),
    ).toEqual({
      collection: [{ mobile: '[REDACTED]' }, 'SYNTH-SAFE'],
      nested: { academicIdentity: '[REDACTED]', status: 'UP' },
      token: '[REDACTED]',
    });
  });
});

describe('academic identity anti-corruption layer', () => {
  it('returns every deterministic simulator class without exposing an external contract', async () => {
    const simulator = new AcademicIdentitySimulator(clock);
    for (const [identity, status] of [
      ['SYNTH-VERIFIED', 'VERIFIED'],
      ['SYNTH-NOT-FOUND', 'NOT_FOUND'],
      ['SYNTH-MISMATCH', 'MISMATCH'],
      ['SYNTH-OUTAGE', 'TEMPORARILY_UNAVAILABLE'],
      ['SYNTH-RATE-LIMITED', 'RATE_LIMITED'],
      ['SYNTH-NOT-ELIGIBLE', 'NOT_ELIGIBLE_FOR_APAAR'],
      ['SYNTH-REVIEW', 'MANUAL_REVIEW'],
      ['SYNTH-UNKNOWN', 'UNVERIFIED'],
    ] as const) {
      await expect(
        simulator.verify({
          academicIdentity: identity,
          correlationReference: 'SYNTH-CORRELATION-001',
          purpose: 'ADMISSION_LINKING',
        }),
      ).resolves.toMatchObject({ status });
    }
  });

  it('normalises authorized HTTP success, retry exhaustion, rate limiting and an open circuit', async () => {
    const successFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"state":"ok"}', { status: 200 }));
    const translator = {
      decode: (_status: number, _body: unknown, checkedAt: string) => ({
        checkedAt,
        providerContractVersion: 'SYNTH-CONTRACT-001',
        providerRequestReference: 'SYNTH-PROVIDER-001',
        status: 'VERIFIED' as const,
      }),
      encode: () => ({ opaque: 'SYNTH-OPAQUE' }),
      validate: () => undefined,
    };
    const adapter = new AuthorizedAcademicIdentityAdapter({
      clock,
      fetch: successFetch,
      maximumAttempts: 2,
      openDurationMs: 30_000,
      openAfterFailures: 2,
      operationUrl: 'https://provider.example.invalid/authorized-operation',
      random: () => 0.5,
      retryBaseDelayMs: 1,
      retryJitterRatio: 0.2,
      timeoutMs: 100,
      translator,
      wait: () => Promise.resolve(),
    });
    await expect(
      adapter.verify({
        academicIdentity: 'SYNTH-VERIFIED',
        correlationReference: 'SYNTH-CORRELATION-001',
        purpose: 'ADMISSION_LINKING',
      }),
    ).resolves.toMatchObject({ status: 'VERIFIED' });
    expect(successFetch).toHaveBeenCalledTimes(1);

    const unavailable = new AuthorizedAcademicIdentityAdapter({
      clock,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })),
      maximumAttempts: 2,
      openDurationMs: 30_000,
      openAfterFailures: 2,
      operationUrl: 'https://provider.example.invalid/authorized-operation',
      random: () => 0.5,
      retryBaseDelayMs: 1,
      retryJitterRatio: 0.2,
      timeoutMs: 100,
      translator,
      wait: () => Promise.resolve(),
    });
    await expect(
      unavailable.verify({
        academicIdentity: 'SYNTH-OUTAGE',
        correlationReference: 'SYNTH-CORRELATION-002',
        purpose: 'CORRECTION_REVIEW',
      }),
    ).resolves.toMatchObject({ status: 'TEMPORARILY_UNAVAILABLE' });
    await expect(
      unavailable.verify({
        academicIdentity: 'SYNTH-OUTAGE',
        correlationReference: 'SYNTH-CORRELATION-003',
        purpose: 'CORRECTION_REVIEW',
      }),
    ).resolves.toMatchObject({ status: 'TEMPORARILY_UNAVAILABLE' });

    const limited = new AuthorizedAcademicIdentityAdapter({
      clock,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 })),
      maximumAttempts: 1,
      openDurationMs: 30_000,
      openAfterFailures: 5,
      operationUrl: 'https://provider.example.invalid/authorized-operation',
      random: () => 0.5,
      retryBaseDelayMs: 1,
      retryJitterRatio: 0.2,
      timeoutMs: 100,
      translator,
      wait: () => Promise.resolve(),
    });
    await expect(
      limited.verify({
        academicIdentity: 'SYNTH-RATE-LIMITED',
        correlationReference: 'SYNTH-CORRELATION-004',
        purpose: 'ADMISSION_LINKING',
      }),
    ).resolves.toMatchObject({ status: 'RATE_LIMITED' });
    expect(
      () =>
        new AuthorizedAcademicIdentityAdapter({
          clock,
          fetch: successFetch,
          maximumAttempts: 1,
          openDurationMs: 30_000,
          openAfterFailures: 1,
          operationUrl: 'http://unsafe.invalid',
          random: () => 0.5,
          retryBaseDelayMs: 1,
          retryJitterRatio: 0.2,
          timeoutMs: 100,
          translator,
          wait: () => Promise.resolve(),
        }),
    ).toThrow();
  });
});

describe('approval, notification and verification services', () => {
  it('checks approval digests and replays exact imports without granting proposed authority', async () => {
    const service = new ApprovalImportService(
      new InMemoryApprovalManifestRepository(),
      new SyntheticManifestIntegrityAdapter('test'),
    );
    await expect(service.import(manifest(), integrator)).resolves.toEqual({
      importReference: 'SYNTH-APPROVAL-IMPORT-001',
      replayed: false,
      status: 'IMPORTED',
    });
    await expect(service.import(manifest(), integrator)).resolves.toMatchObject({ replayed: true });
    const proposed = manifest({
      authority: 'PROPOSED',
      importReference: 'SYNTH-APPROVAL-IMPORT-002',
    });
    await expect(service.import(proposed, integrator)).resolves.toMatchObject({
      status: 'PROPOSED',
    });
    await expect(
      service.import(
        manifest({ digestSha256: '0'.repeat(64), importReference: 'SYNTH-APPROVAL-IMPORT-003' }),
        integrator,
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_DIGEST_MISMATCH' });
    await expect(
      service.import(
        manifest({
          effectiveFrom: '2027-01-01',
          effectiveTo: '2026-01-01',
          importReference: 'SYNTH-APPROVAL-IMPORT-004',
        }),
        integrator,
      ),
    ).rejects.toMatchObject({ code: 'EFFECTIVE_RANGE_INVALID' });
    await expect(
      service.import(
        manifest({
          importReference: 'SYNTH-APPROVAL-IMPORT-005',
          integrity: {
            algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
            keyId: 'SYNTH-MANIFEST-KEY-001',
            signature: '0'.repeat(64),
          },
        }),
        integrator,
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_INTEGRITY_INVALID' });
    expect(() => new SyntheticManifestIntegrityAdapter('production')).toThrow(
      expect.objectContaining({ code: 'UNSAFE_PRODUCTION_CONFIGURATION' }),
    );
  });

  it('validates approval references and resolves concurrent import races safely', async () => {
    const integrity = new SyntheticManifestIntegrityAdapter('test');
    const repository = new InMemoryApprovalManifestRepository();
    const service = new ApprovalImportService(repository, integrity);
    await expect(
      service.import(manifest({ importReference: 'not-valid' }), integrator),
    ).rejects.toMatchObject({ code: 'IMPORT_REFERENCE_INVALID' });
    await expect(
      service.import(
        manifest({
          importReference: 'SYNTH-APPROVAL-IMPORT-SUPERSESSION',
          supersedesImportReference: 'not-valid',
        }),
        integrator,
      ),
    ).rejects.toMatchObject({ code: 'SUPERSEDED_IMPORT_REFERENCE_INVALID' });

    const accepted = manifest({ importReference: 'SYNTH-APPROVAL-CONCURRENT-001' });
    const exactRace: ApprovalManifestRepository = {
      findApproval: () =>
        Promise.resolve({
          digest: accepted.digestSha256,
          result: {
            importReference: accepted.importReference,
            replayed: false,
            status: 'IMPORTED',
          },
        }),
      saveApproval: () =>
        Promise.reject(Object.assign(new Error('SYNTH-CONCURRENT-UNIQUE'), { code: '23505' })),
    };
    await expect(
      new ApprovalImportService(exactRace, integrity).import(accepted, integrator),
    ).resolves.toMatchObject({ replayed: true });

    const conflictingRace: ApprovalManifestRepository = {
      findApproval: () =>
        Promise.resolve({
          digest: '0'.repeat(64),
          result: {
            importReference: accepted.importReference,
            replayed: false,
            status: 'IMPORTED',
          },
        }),
      saveApproval: () =>
        Promise.reject(Object.assign(new Error('SYNTH-CONCURRENT-UNIQUE'), { code: '23505' })),
    };
    await expect(
      new ApprovalImportService(conflictingRace, integrity).import(accepted, integrator),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const unexpectedFailure: ApprovalManifestRepository = {
      findApproval: () => Promise.resolve(null),
      saveApproval: () => Promise.reject(new Error('SYNTH-STORAGE-FAILURE')),
    };
    await expect(
      new ApprovalImportService(unexpectedFailure, integrity).import(accepted, integrator),
    ).rejects.toThrow('SYNTH-STORAGE-FAILURE');
  });

  it('delivers, retries and dead-letters informational synthetic notifications', async () => {
    const repository = new InMemoryNotificationRepository([
      {
        attemptCount: 0,
        destinationReference: 'SYNTH-DESTINATION-OK',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-001',
        state: 'PENDING',
      },
      {
        attemptCount: 2,
        destinationReference: 'SYNTH-DESTINATION-RETRY',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-002',
        state: 'PENDING',
      },
    ]);
    const worker = new NotificationWorker(repository, new SyntheticNotificationGateway(), 3);
    await expect(worker.processOne(clock.now())).resolves.toMatchObject({ state: 'DELIVERED' });
    await expect(worker.processOne(clock.now())).resolves.toMatchObject({ state: 'DEAD_LETTER' });
    await expect(worker.processOne(clock.now())).resolves.toBeNull();
    expect(repository.get('SYNTH-NOTIFICATION-002')?.state).toBe('DEAD_LETTER');
  });

  it('schedules retryable notifications and dead-letters rejected destinations', async () => {
    const repository = new InMemoryNotificationRepository([
      {
        attemptCount: 0,
        destinationReference: 'SYNTH-DESTINATION-RETRY',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-RETRY',
        state: 'PENDING',
      },
      {
        attemptCount: 0,
        destinationReference: 'EXTERNAL-DESTINATION',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-REJECTED',
        state: 'PENDING',
      },
    ]);
    const worker = new NotificationWorker(
      repository,
      new SyntheticNotificationGateway(),
      3,
      () => 1,
    );
    await expect(worker.processOne(clock.now())).resolves.toMatchObject({ state: 'RETRYABLE' });
    expect(repository.get('SYNTH-NOTIFICATION-RETRY')?.state).toBe('RETRYABLE');
    await expect(worker.processOne(clock.now())).resolves.toMatchObject({ state: 'RETRYABLE' });
    await expect(worker.processOne(clock.now())).resolves.toMatchObject({ state: 'DEAD_LETTER' });
    await expect(worker.processOne(clock.now())).resolves.toMatchObject({ state: 'DEAD_LETTER' });
    expect(repository.get('SYNTH-NOTIFICATION-REJECTED')?.state).toBe('DEAD_LETTER');
  });

  it('issues minimal, expiring, idempotent synthetic verification receipts', async () => {
    const service = new VerificationService(
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
      () => 'SYNTH-VERIFICATION-001',
    );
    const input = {
      admissionReference: 'SYNTH-REGISTRATION-001',
      consentReference: 'SYNTH-CONSENT-001',
      idempotencyKey: 'SYNTH-IDEMPOTENCY-001',
      legalBasisReference: null,
      purpose: 'SYNTH-EMPLOYMENT-CHECK',
      requestedClaims: ['ADMISSION_EXISTS', 'CURRENT_STATUS'] as const,
    };
    const receipt = await service.create(input, verifier);
    expect(receipt).toMatchObject({
      claims: { ADMISSION_EXISTS: true, CURRENT_STATUS: 'ACCEPTED' },
      status: 'ACTIVE',
      verificationReference: 'SYNTH-VERIFICATION-001',
    });
    await expect(service.create(input, verifier)).resolves.toEqual(receipt);
    await expect(
      service.create({ ...input, purpose: 'SYNTH-CHANGED' }, verifier),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      service.create(
        { ...input, idempotencyKey: 'SYNTH-IDEMPOTENCY-002', consentReference: null },
        verifier,
      ),
    ).rejects.toMatchObject({ code: 'LEGAL_BASIS_REQUIRED' });
    await expect(
      service.create({ ...input, idempotencyKey: 'SYNTH-IDEMPOTENCY-003', purpose: '' }, verifier),
    ).rejects.toMatchObject({ code: 'VERIFICATION_PURPOSE_REQUIRED' });
    await expect(
      service.create(
        { ...input, admissionReference: 'SYNTH-MISSING', idempotencyKey: 'SYNTH-IDEMPOTENCY-004' },
        verifier,
      ),
    ).rejects.toMatchObject({ code: 'ADMISSION_NOT_FOUND' });
  });

  it('reports active, expired and append-only revoked verification status', async () => {
    let now = '2026-10-26T12:00:00.000Z';
    const mutableClock: GatewayClock = { now: () => now };
    const receipts = new InMemoryVerificationReceiptRepository();
    const service = new VerificationService(
      new InMemoryAdmissionFacts(
        new Map([
          [
            'SYNTH-REGISTRATION-STATUS-001',
            {
              academicYear: '2026-27',
              admissionReference: 'SYNTH-REGISTRATION-STATUS-001',
              currentStatus: 'ACCEPTED',
              institutionReference: 'SYNTH-INSTITUTION-001',
              programmeReference: 'SYNTH-PROGRAMME-001',
            },
          ],
        ]),
      ),
      receipts,
      new SyntheticSigningAdapter(),
      mutableClock,
      () => 'SYNTH-VERIFICATION-STATUS-001',
    );
    await service.create(
      {
        admissionReference: 'SYNTH-REGISTRATION-STATUS-001',
        consentReference: 'SYNTH-CONSENT-001',
        idempotencyKey: 'SYNTH-IDEMPOTENCY-STATUS-001',
        legalBasisReference: null,
        purpose: 'SYNTH-STATUS-CHECK',
        requestedClaims: ['ADMISSION_EXISTS'],
      },
      verifier,
    );
    const status = new VerificationStatusService(
      receipts,
      mutableClock,
      new SyntheticSigningAdapter(),
    );
    await expect(status.get('SYNTH-VERIFICATION-STATUS-001')).resolves.toMatchObject({
      status: 'ACTIVE',
    });
    now = '2026-10-26T12:16:00.000Z';
    await expect(status.get('SYNTH-VERIFICATION-STATUS-001')).resolves.toMatchObject({
      status: 'EXPIRED',
    });
    await status.revoke('SYNTH-VERIFICATION-STATUS-001', 'SYNTH-REASON', integrator);
    await expect(status.get('SYNTH-VERIFICATION-STATUS-001')).resolves.toMatchObject({
      status: 'REVOKED',
    });
    await expect(status.get('SYNTH-VERIFICATION-MISSING')).rejects.toMatchObject({
      code: 'VERIFICATION_NOT_FOUND',
    });
  });
});
