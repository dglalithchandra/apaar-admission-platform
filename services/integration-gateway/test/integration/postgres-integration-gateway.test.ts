import { PostgresOversightRepository, oversightCsv } from '../../src/oversight-postgres.js';
import {
  ImportApprovalSnapshotService,
  PostgresAdmissionStore,
  SubmitAdmissionService,
} from '@apaar-platform/admission-application';
import { asIsoDateTime } from '@apaar-platform/admission-domain';
import {
  syntheticApproval,
  syntheticCommand,
  SyntheticReferenceGenerator,
} from '../../../admission-application/test/fixtures.js';
import { PostgresVerificationGrantRepository } from '../../src/verification-authorization-postgres.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '@apaar-platform/admission-application';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApprovalImportService,
  NotificationWorker,
  PostgresIntegrationStore,
  SyntheticNotificationGateway,
  SyntheticManifestIntegrityAdapter,
  manifestDigest,
  type ApprovalImportManifest,
  type Principal,
  type VerificationReceipt,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationDirectories = [
  resolve(here, '../../../admission-application/migrations'),
  resolve(here, '../../../batch-ingestion/migrations'),
  resolve(here, '../../../admission-casework/migrations'),
  resolve(here, '../../migrations'),
];
let container: StartedPostgreSqlContainer;
let pool: Pool;

const integrator: Principal = {
  actorReference: 'SYNTH-INTEGRATOR-001',
  institutionId: null,
  organisationReference: 'SYNTH-AICTE',
  roles: ['SERVICE_INTEGRATION_CLIENT'],
};

function approval(
  reference: string,
  overrides: Partial<ApprovalImportManifest> = {},
): ApprovalImportManifest {
  const payload = overrides.payload ?? { approvedIntake: 60, academicYear: '2026-27' };
  const provisional: ApprovalImportManifest = {
    authority: 'SOURCE_CONFIRMED',
    campusId: 'SYNTH-CAMPUS-001',
    courseId: 'SYNTH-COURSE-001',
    digestSha256: manifestDigest(payload),
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-06-30',
    importReference: reference,
    integrity: { algorithm: 'SYNTH-PENDING', keyId: 'SYNTH-PENDING', signature: 'SYNTH-PENDING' },
    institutionId: 'SYNTH-INSTITUTION-001',
    payload,
    programmeId: 'SYNTH-PROGRAMME-001',
    sourceSystem: 'SYNTH-AICTE-FEED',
    sourceVersion: reference,
    supersedesImportReference: null,
    ...overrides,
  };
  if (overrides.integrity !== undefined) return provisional;
  const { integrity: _integrity, ...unsigned } = provisional;
  return { ...unsigned, integrity: new SyntheticManifestIntegrityAdapter('test').sign(unsigned) };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17.6-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri(), max: 10 });
  for (const directory of migrationDirectories) await migrate(pool, directory);
});

afterAll(async () => {
  await pool.end();
  await container.stop();
});

beforeEach(async () => {
  await pool.query(`TRUNCATE integration_security_events,integration_notification_attempts,integration_notification_deliveries,
    verification_receipt_revocations,verification_receipts,integration_approval_imports,
    business_audit_events,outbox_events,courses,programmes,campuses,institutions CASCADE`);
  await pool.query(
    `INSERT INTO institutions(id,name) VALUES('SYNTH-INSTITUTION-001','Synthetic Institute')`,
  );
  await pool.query(
    `INSERT INTO campuses(id,institution_id,name) VALUES('SYNTH-CAMPUS-001','SYNTH-INSTITUTION-001','Synthetic Campus')`,
  );
  await pool.query(
    `INSERT INTO programmes(id,name,level) VALUES('SYNTH-PROGRAMME-001','Synthetic Programme','UNDERGRADUATE')`,
  );
  await pool.query(
    `INSERT INTO courses(id,campus_id,programme_id,name,mode) VALUES('SYNTH-COURSE-001','SYNTH-CAMPUS-001','SYNTH-PROGRAMME-001','Synthetic Course','REGULAR')`,
  );
});

describe('Stage 5 PostgreSQL integration foundation', () => {
  it('migrates all platform stages on an empty database and repeats without changing checksums', async () => {
    const applied = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(applied.rows.map((row) => row.version)).toEqual([
      '0001_admission_registry.sql',
      '0002_student_batch_ingestion.sql',
      '0003_admission_casework_governance.sql',
      '0004_authenticated_integrations.sql',
      '0005_operational_assurance.sql',
      '0006_controlled_pilot_rollout.sql',
      '0007_synthetic_pilot_execution.sql',
      '0008_integrated_reference_runtime.sql',
      '0009_operational_event_reference_compatibility.sql',
      '0010_student_identity_guards.sql',
      '0011_verification_authorization_grants.sql',
      '0012_verification_grant_withdrawal_atomicity.sql',
      '0013_oversight_read_indexes.sql',
      '0014_verification_receipt_grant_expiry.sql',
      '0015_verified_academic_identity_bindings.sql',
      '0016_synthetic_identity_binding_backfill.sql',
      '0017_category_evidence_provenance.sql',
    ]);
    for (const directory of migrationDirectories)
      await expect(migrate(pool, directory)).resolves.toEqual([]);
  });

  it('imports an authoritative manifest atomically and returns an exact replay', async () => {
    const store = new PostgresIntegrationStore(pool);
    const service = new ApprovalImportService(store, new SyntheticManifestIntegrityAdapter('test'));
    const input = approval('SYNTH-IMPORT-001');
    await expect(service.import(input, integrator)).resolves.toMatchObject({
      replayed: false,
      status: 'IMPORTED',
    });
    await expect(service.import(input, integrator)).resolves.toMatchObject({ replayed: true });
    const counts = await pool.query<{ audits: string; imports: string; outbox: string }>(
      `SELECT (SELECT count(*)::text FROM integration_approval_imports) imports,
       (SELECT count(*)::text FROM business_audit_events) audits,
       (SELECT count(*)::text FROM outbox_events) outbox`,
    );
    expect(counts.rows[0]).toEqual({ audits: '1', imports: '1', outbox: '1' });
  });

  it('rejects authoritative overlap and invalid institution scope without partial audit or outbox', async () => {
    const service = new ApprovalImportService(
      new PostgresIntegrationStore(pool),
      new SyntheticManifestIntegrityAdapter('test'),
    );
    await service.import(approval('SYNTH-IMPORT-OVERLAP-001'), integrator);
    await expect(
      service.import(approval('SYNTH-IMPORT-OVERLAP-002'), integrator),
    ).rejects.toMatchObject({ code: 'APPROVAL_IMPORT_OVERLAP' });
    await expect(
      service.import(
        approval('SYNTH-IMPORT-SCOPE-001', { institutionId: 'SYNTH-INSTITUTION-MISSING' }),
        integrator,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const counts = await pool.query<{ audits: string; imports: string; outbox: string }>(
      `SELECT (SELECT count(*)::text FROM integration_approval_imports) imports,
       (SELECT count(*)::text FROM business_audit_events) audits,
       (SELECT count(*)::text FROM outbox_events) outbox`,
    );
    expect(counts.rows[0]).toEqual({ audits: '1', imports: '1', outbox: '1' });
  });

  it('supersedes exactly one named overlapping authoritative import', async () => {
    const service = new ApprovalImportService(
      new PostgresIntegrationStore(pool),
      new SyntheticManifestIntegrityAdapter('test'),
    );
    await service.import(approval('SYNTH-IMPORT-OLD-001'), integrator);
    await expect(
      service.import(
        approval('SYNTH-IMPORT-NEW-001', {
          payload: { approvedIntake: 90, academicYear: '2026-27' },
          supersedesImportReference: 'SYNTH-IMPORT-OLD-001',
        }),
        integrator,
      ),
    ).resolves.toMatchObject({ status: 'IMPORTED' });
    const imports = await pool.query<{ id: string; superseded_by: string | null }>(
      'SELECT id,superseded_by FROM integration_approval_imports ORDER BY id',
    );
    expect(imports.rows).toEqual([
      { id: 'SYNTH-IMPORT-NEW-001', superseded_by: null },
      { id: 'SYNTH-IMPORT-OLD-001', superseded_by: 'SYNTH-IMPORT-NEW-001' },
    ]);
  });

  it('serializes concurrent exact replay and competing authoritative overlap', async () => {
    const service = new ApprovalImportService(
      new PostgresIntegrationStore(pool),
      new SyntheticManifestIntegrityAdapter('test'),
    );
    const exact = approval('SYNTH-IMPORT-CONCURRENT-001');
    const exactResults = await Promise.all([
      service.import(exact, integrator),
      service.import(exact, integrator),
    ]);
    expect(exactResults.filter((result) => result.replayed)).toHaveLength(1);
    await pool.query(
      `TRUNCATE integration_approval_imports,business_audit_events,outbox_events CASCADE`,
    );
    const competing = await Promise.allSettled([
      service.import(approval('SYNTH-IMPORT-COMPETING-001'), integrator),
      service.import(approval('SYNTH-IMPORT-COMPETING-002'), integrator),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const imports = await pool.query<{ count: string }>(
      'SELECT count(*)::text count FROM integration_approval_imports',
    );
    expect(imports.rows[0]?.count).toBe('1');
  });

  it('reconciles real reservations, isolates institution reports and exports safe paginated rows', async () => {
    const store = new PostgresAdmissionStore(pool);
    await new ImportApprovalSnapshotService(store).execute({ snapshot: syntheticApproval() });
    const command = syntheticCommand('SYNTH-OVERSIGHT-NRI', 'NRI');
    await new SubmitAdmissionService(
      { unitOfWork: store, clock: { now: () => asIsoDateTime('2026-08-01T09:00:00Z') } },
      new SyntheticReferenceGenerator(),
    ).execute(command);
    const repository = new PostgresOversightRepository(pool);
    const reviewer: Principal = { ...integrator, roles: ['AICTE_REVIEWER'] };
    const report = await repository.read(reviewer, '2026-27');
    const ordinary = report.rows.find((row) => row.bucket === 'ORDINARY');
    expect(ordinary).toMatchObject({
      approvedCapacity: 60,
      counterUsed: 1,
      ledgerUsed: 1,
      drift: 0,
      acceptedRecords: 1,
    });
    expect(report.nextOffset).toBeNull();
    expect(report.summary.activeAdmissionRecords).toBe(1);
    expect(report.institutionCapacities.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain(command.admission.studentKey);
    const own = await repository.read(
      {
        ...reviewer,
        roles: ['INSTITUTION_OPERATOR'],
        institutionId: command.admission.institutionId,
      },
      '2026-27',
    );
    expect(own.rows.length).toBeGreaterThan(0);
    const other = await repository.read(
      { ...reviewer, roles: ['INSTITUTION_OPERATOR'], institutionId: 'SYNTH-INSTITUTION-001' },
      '2026-27',
    );
    expect(other.rows).toHaveLength(0);
    await expect(
      repository.read({ ...reviewer, roles: ['AUTHORIZED_VERIFIER'] }, '2026-27'),
    ).rejects.toMatchObject({ code: 'ACTION_FORBIDDEN' });
    await expect(
      repository.read(
        { ...reviewer, roles: ['INSTITUTION_OPERATOR'], institutionId: null },
        '2026-27',
      ),
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_REQUIRED' });
    await expect(repository.read(reviewer, 'SYNTH-INVALID-YEAR')).rejects.toMatchObject({
      code: 'OVERSIGHT_FILTER_INVALID',
    });
    await expect(repository.read(reviewer, '2026-27', -1)).rejects.toMatchObject({
      code: 'OVERSIGHT_FILTER_INVALID',
    });
    await pool.query(
      "UPDATE capacity_allocations SET used_quantity=used_quantity+1 WHERE allocation_code='ORDINARY'",
    );
    expect(
      (await repository.read(reviewer, '2026-27')).rows.find((row) => row.bucket === 'ORDINARY')
        ?.drift,
    ).toBe(1);
    const csv = oversightCsv(report.rows);
    expect(csv).toContain('allocationReference');
    expect(csv).toContain('SYNTH-INST-0001');
    if (ordinary === undefined) throw new Error('Synthetic ordinary allocation was missing.');
    expect(
      oversightCsv([
        { ...ordinary, courseReference: '=SYNTH-FORMULA', approvalReference: 'SYNTH-QUOTE"VALUE' },
      ]),
    ).toContain("'=SYNTH-FORMULA");
    expect(oversightCsv([{ ...ordinary, approvalReference: 'SYNTH-QUOTE"VALUE' }])).toContain(
      'SYNTH-QUOTE""VALUE',
    );
  });

  it('persists grant withdrawal, revokes existing receipts and serializes competing issuance', async () => {
    const reference = 'SYNTH-GRANT-LIFECYCLE';
    const grants = new PostgresVerificationGrantRepository(pool);
    expect(await grants.find('SYNTH-GRANT-UNKNOWN')).toBeNull();
    await pool.query(
      `INSERT INTO verification_authorization_grants(reference,issuer_reference,payload)
      VALUES($1,'SYNTH-ISSUER',$2)`,
      [
        reference,
        {
          reference,
          kind: 'CONSENT',
          admissionReference: 'SYNTH-ADMISSION',
          institutionReference: 'SYNTH-INSTITUTION',
          recipientOrganisation: 'SYNTH-RECIPIENT',
          purpose: 'SYNTH-PURPOSE',
          claims: ['ADMISSION_EXISTS'],
          validFrom: '2026-01-01T00:00:00Z',
          expiresAt: '2027-01-01T00:00:00Z',
        },
      ],
    );
    expect(await grants.find(reference)).toMatchObject({ revoked: false });
    const store = new PostgresIntegrationStore(pool);
    const receipt: VerificationReceipt = {
      algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
      keyId: 'SYNTH-KEY',
      signature: 'a'.repeat(64),
      claims: { ADMISSION_EXISTS: true },
      purpose: 'SYNTH-PURPOSE',
      requesterOrganisation: 'SYNTH-RECIPIENT',
      legalBasisReference: reference,
      issuedAt: '2026-10-26T12:00:00Z',
      expiresAt: '2026-10-26T12:15:00Z',
      status: 'ACTIVE',
      verificationReference: 'SYNTH-GRANT-RECEIPT-FIRST',
    };
    await store.save('SYNTH-GRANT-IDEMPOTENCY-FIRST', 'a'.repeat(64), receipt);
    const results = await Promise.allSettled([
      store.save('SYNTH-GRANT-IDEMPOTENCY-RACE', 'b'.repeat(64), {
        ...receipt,
        verificationReference: 'SYNTH-GRANT-RECEIPT-RACE',
      }),
      pool.query(
        `INSERT INTO verification_grant_withdrawals(grant_reference,actor_reference,reason)
        VALUES($1,'SYNTH-SUBJECT','SYNTH-WITHDRAWAL')`,
        [reference],
      ),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(await grants.find(reference)).toMatchObject({ revoked: true });
    expect(await store.find('SYNTH-GRANT-IDEMPOTENCY-FIRST')).toMatchObject({
      receipt: { status: 'REVOKED' },
    });
    const active = await pool.query(
      `SELECT r.verification_reference FROM verification_receipts r
      WHERE r.legal_basis_reference=$1 AND NOT EXISTS(SELECT 1 FROM verification_receipt_revocations v WHERE v.verification_reference=r.verification_reference)`,
      [reference],
    );
    expect(active.rows).toHaveLength(0);
    await expect(
      store.save('SYNTH-GRANT-IDEMPOTENCY-AFTER', 'c'.repeat(64), {
        ...receipt,
        verificationReference: 'SYNTH-GRANT-RECEIPT-AFTER',
      }),
    ).rejects.toMatchObject({ constraint: 'verification_grant_active' });
    await expect(
      pool.query(
        `UPDATE verification_authorization_grants SET issuer_reference='SYNTH-OTHER' WHERE reference=$1`,
        [reference],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query('DELETE FROM verification_grant_withdrawals WHERE grant_reference=$1', [
        reference,
      ]),
    ).rejects.toThrow();
  });

  it('stores verification receipts immutably and exposes append-only revocation status', async () => {
    const store = new PostgresIntegrationStore(pool);
    const receipt: VerificationReceipt = {
      algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
      claims: { ADMISSION_EXISTS: true },
      expiresAt: '2026-10-26T12:15:00.000Z',
      issuedAt: '2026-10-26T12:00:00.000Z',
      keyId: 'SYNTH-KEY-001',
      legalBasisReference: 'SYNTH-LEGAL-001',
      purpose: 'SYNTH-EMPLOYMENT-CHECK',
      requesterOrganisation: 'SYNTH-EMPLOYER-001',
      signature: 'a'.repeat(64),
      status: 'ACTIVE',
      verificationReference: 'SYNTH-VERIFICATION-001',
    };
    await pool.query(
      `INSERT INTO verification_authorization_grants(reference,issuer_reference,payload)
      VALUES($1,'SYNTH-ISSUER',$2)`,
      [
        receipt.legalBasisReference,
        {
          reference: receipt.legalBasisReference,
          kind: 'LEGAL_BASIS',
          admissionReference: null,
          institutionReference: 'SYNTH-INSTITUTION-001',
          recipientOrganisation: receipt.requesterOrganisation,
          purpose: receipt.purpose,
          claims: ['ADMISSION_EXISTS'],
          validFrom: '2026-01-01T00:00:00Z',
          expiresAt: '2027-01-01T00:00:00Z',
        },
      ],
    );
    await store.save('SYNTH-IDEMPOTENCY-001', 'b'.repeat(64), receipt);
    await expect(store.find('SYNTH-IDEMPOTENCY-001')).resolves.toMatchObject({
      receipt: { status: 'ACTIVE' },
    });
    await store.revoke(
      receipt.verificationReference,
      'SYNTH-REVOKED',
      'SYNTH-AUDITOR-001',
      '2026-10-26T12:05:00.000Z',
    );
    await expect(store.find('SYNTH-IDEMPOTENCY-001')).resolves.toMatchObject({
      receipt: { status: 'REVOKED' },
    });
    await expect(
      pool.query(
        `UPDATE verification_receipts SET purpose='SYNTH-CHANGED' WHERE verification_reference=$1`,
        [receipt.verificationReference],
      ),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('claims a notification once, records delivery attempts and dead-letters exhausted retry', async () => {
    const store = new PostgresIntegrationStore(pool);
    await store.enqueue(
      {
        attemptCount: 0,
        destinationReference: 'SYNTH-DESTINATION-OK',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-001',
        state: 'PENDING',
      },
      '2026-10-26T11:59:00.000Z',
    );
    await store.enqueue(
      {
        attemptCount: 2,
        destinationReference: 'SYNTH-DESTINATION-RETRY',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-002',
        state: 'PENDING',
      },
      '2026-10-26T11:59:00.000Z',
    );
    const worker = new NotificationWorker(store, new SyntheticNotificationGateway(), 3);
    await expect(worker.processOne('2026-10-26T12:00:00.000Z')).resolves.toMatchObject({
      state: 'DELIVERED',
    });
    await expect(worker.processOne('2026-10-26T12:00:00.000Z')).resolves.toMatchObject({
      state: 'DEAD_LETTER',
    });
    const rows = await pool.query<{ id: string; state: string }>(
      'SELECT id,state FROM integration_notification_deliveries ORDER BY id',
    );
    expect(rows.rows).toEqual([
      { id: 'SYNTH-NOTIFICATION-001', state: 'DELIVERED' },
      { id: 'SYNTH-NOTIFICATION-002', state: 'DEAD_LETTER' },
    ]);
  });

  it('prevents concurrent duplicate claims and recovers an expired notification lease', async () => {
    const store = new PostgresIntegrationStore(pool);
    await store.enqueue(
      {
        attemptCount: 0,
        destinationReference: 'SYNTH-DESTINATION-LEASE',
        messageCode: 'SYNTH-CASE-UPDATED',
        notificationId: 'SYNTH-NOTIFICATION-LEASE-001',
        state: 'PENDING',
      },
      '2026-10-26T11:59:00.000Z',
    );
    const [first, competing] = await Promise.all([
      store.claim('2026-10-26T12:00:00.000Z'),
      store.claim('2026-10-26T12:00:00.000Z'),
    ]);
    expect([first, competing].filter((value) => value !== null)).toHaveLength(1);
    await expect(store.claim('2026-10-26T12:00:31.000Z')).resolves.toMatchObject({
      attemptCount: 2,
      state: 'IN_FLIGHT',
    });
  });

  it('persists immutable identifier-safe security events', async () => {
    const store = new PostgresIntegrationStore(pool);
    await store.record({
      actorReference: 'SYNTH-ACTOR-SECURITY-001',
      correlationReference: 'SYNTH-CORRELATION-SECURITY-001',
      details: { route: '/v1/cases/:reference', status: 403 },
      eventCode: 'ACTION_FORBIDDEN',
    });
    const event = await pool.query<{ details: Record<string, unknown>; event_code: string }>(
      'SELECT event_code,details FROM integration_security_events',
    );
    expect(event.rows).toEqual([
      {
        details: { route: '/v1/cases/:reference', status: 403 },
        event_code: 'ACTION_FORBIDDEN',
      },
    ]);
    await expect(
      pool.query(`UPDATE integration_security_events SET event_code='SYNTH-CHANGED'`),
    ).rejects.toMatchObject({ code: '55000' });
  });
});
