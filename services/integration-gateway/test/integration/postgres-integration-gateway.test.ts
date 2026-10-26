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
  return {
    authority: 'SOURCE_CONFIRMED',
    campusId: 'SYNTH-CAMPUS-001',
    courseId: 'SYNTH-COURSE-001',
    digestSha256: manifestDigest(payload),
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-06-30',
    importReference: reference,
    institutionId: 'SYNTH-INSTITUTION-001',
    payload,
    programmeId: 'SYNTH-PROGRAMME-001',
    sourceSystem: 'SYNTH-AICTE-FEED',
    sourceVersion: reference,
    supersedesImportReference: null,
    ...overrides,
  };
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
  await pool.query(`TRUNCATE integration_notification_attempts,integration_notification_deliveries,
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
  it('migrates all four stages on an empty database and repeats without changing checksums', async () => {
    const applied = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(applied.rows.map((row) => row.version)).toEqual([
      '0001_admission_registry.sql',
      '0002_student_batch_ingestion.sql',
      '0003_admission_casework_governance.sql',
      '0004_authenticated_integrations.sql',
    ]);
    for (const directory of migrationDirectories)
      await expect(migrate(pool, directory)).resolves.toEqual([]);
  });

  it('imports an authoritative manifest atomically and returns an exact replay', async () => {
    const store = new PostgresIntegrationStore(pool);
    const service = new ApprovalImportService(store);
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
    const service = new ApprovalImportService(new PostgresIntegrationStore(pool));
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
    const service = new ApprovalImportService(new PostgresIntegrationStore(pool));
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
});
