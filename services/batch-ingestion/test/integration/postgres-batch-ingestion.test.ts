import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ImportApprovalSnapshotService,
  PostgresAdmissionStore,
  SubmitAdmissionService,
  migrate,
  type ReferenceGenerator,
} from '@apaar-platform/admission-application';
import {
  asAcademicYear,
  asApprovalSnapshotId,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asIsoDateTime,
  asProgrammeId,
  type ApprovalSnapshot,
} from '@apaar-platform/admission-domain';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BatchWorker, CreateBatchService } from '../../src/batch-service.js';
import { BatchIdempotencyConflictError } from '../../src/errors.js';
import { CURRENT_TEMPLATE_VERSION } from '../../src/model.js';
import { PostgresBatchRepository } from '../../src/postgres/postgres-batch-repository.js';
import {
  DeterministicAcademicIdentityVerifier,
  DeterministicMalwareScanner,
  InMemoryObjectStorage,
} from '../../src/simulators.js';
import { csvFile, csvRow, SyntheticBatchReferences } from '../fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const admissionMigrations = resolve(here, '../../../admission-application/migrations');
const batchMigrations = resolve(here, '../../migrations');
const clock = { now: () => asIsoDateTime('2026-08-01T09:00:00.000Z') };
let container: StartedPostgreSqlContainer;
let pool: Pool;
let batchRepository: PostgresBatchRepository;
let createBatch: CreateBatchService;
let worker: BatchWorker;
let admissionReferences: SyntheticAdmissionReferences;
let initiallyApplied: readonly string[];

class SyntheticAdmissionReferences implements ReferenceGenerator {
  private count = 0;

  public next(kind: Parameters<ReferenceGenerator['next']>[0]): string {
    this.count += 1;
    return `SYNTH-${kind}-BATCH-${String(this.count).padStart(5, '0')}`;
  }
}

function approval(): ApprovalSnapshot {
  const institutionId = asInstitutionId('SYNTH-INST-0001');
  const campusId = asCampusId('SYNTH-CAMPUS-0001');
  const programmeId = asProgrammeId('SYNTH-PROG-0001');
  return {
    academicYear: asAcademicYear('2026-27'),
    approvedBy: 'SYNTH-AUTHORITY-0001',
    campus: { id: campusId, institutionId, name: 'Synthetic Main Campus' },
    course: {
      campusId,
      id: asCourseId('SYNTH-COURSE-0001'),
      mode: 'REGULAR',
      name: 'Synthetic Engineering Course',
      programmeId,
    },
    effectiveFrom: asIsoDate('2026-04-01'),
    effectiveTo: asIsoDate('2027-03-31'),
    fnOciGulf: {
      approved: true,
      combinedTotalCapacity: 9,
      foreignAndOciCapacity: 6,
      foreignNationalAcrossRoutesMaximum: 9,
      gulfCapacity: 3,
    },
    id: asApprovalSnapshotId('SYNTH-APPROVAL-0001'),
    importBatchReference: 'SYNTH-IMPORT-0001',
    institution: { id: institutionId, name: 'Synthetic Institute of Technology' },
    lateral: { approved: true, firstYearVacancyCapacity: 2, supernumeraryCapacity: 6 },
    nri: { approved: true, maximumWithinOrdinary: 3 },
    ordinaryIntake: 60,
    pmUspy: { approved: true, courseCapacity: 2, institutionCapacity: 10 },
    policyVersion: 'SYNTH-POLICY-2026',
    programme: { id: programmeId, level: 'UNDERGRADUATE', name: 'Synthetic Programme' },
    receivedAt: asIsoDateTime('2026-04-02T09:00:00.000Z'),
    sourceHash: 'SYNTH-SOURCE-HASH-0001',
    sourceRecordId: 'SYNTH-SOURCE-RECORD-0001',
    sourceSystem: 'SYNTHETIC-SOURCE',
    supersededBy: null,
    tfw: { approved: true, capacity: 3, precedingYearMinimumFillSatisfied: true },
  };
}

function uploadCommand(suffix: string, csv: string, idempotencyKey = `SYNTH-UPLOAD-${suffix}`) {
  return {
    actorReference: 'SYNTH-ACTOR-0001',
    content: (async function* (): AsyncGenerator<string> {
      yield csv;
    })(),
    contentType: 'text/csv',
    idempotencyKey,
    institutionId: 'SYNTH-INST-0001',
    originalFilename: `synthetic-${suffix.toLowerCase()}.csv`,
    reason: 'SYNTHETIC_BATCH_UPLOAD',
    requestReference: `SYNTH-REQUEST-${suffix}`,
    templateVersion: CURRENT_TEMPLATE_VERSION,
  };
}

async function tableCount(table: string): Promise<number> {
  if (!/^[a-z_]+$/.test(table)) throw new TypeError('Unsafe table.');
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table}`,
  );
  return Number(result.rows[0]?.count ?? -1);
}

async function makeBatch(suffix: string, csv: string): Promise<string> {
  const receipt = await createBatch.execute(uploadCommand(suffix, csv));
  return receipt.batchId;
}

describe('PostgreSQL batch ingestion journey', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('SYNTH_BATCH_TEST')
      .withUsername('SYNTH_USER')
      .withPassword('SYNTH_PASSWORD')
      .start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 16 });
    await migrate(pool, admissionMigrations);
    initiallyApplied = await migrate(pool, batchMigrations);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE business_audit_events, outbox_events, admission_batches, approval_import_batches, institutions CASCADE',
    );
    const admissionStore = new PostgresAdmissionStore(pool);
    await new ImportApprovalSnapshotService(admissionStore).execute({ snapshot: approval() });
    batchRepository = new PostgresBatchRepository(pool);
    createBatch = new CreateBatchService({
      clock,
      references: new SyntheticBatchReferences(),
      repository: batchRepository,
      scanner: new DeterministicMalwareScanner(),
      storage: new InMemoryObjectStorage(),
    });
    admissionReferences = new SyntheticAdmissionReferences();
    worker = new BatchWorker({
      admissions: new SubmitAdmissionService(
        { clock, unitOfWork: admissionStore },
        admissionReferences,
      ),
      clock,
      identity: new DeterministicAcademicIdentityVerifier(),
      repository: batchRepository,
    });
  });

  it('migrates over Stage 2 and repeats without reapplying', async () => {
    expect(initiallyApplied).toEqual(['0002_student_batch_ingestion.sql']);
    await expect(migrate(pool, batchMigrations)).resolves.toEqual([]);
    expect(await tableCount('schema_migrations')).toBe(2);
  });

  it('runs a valid upload through identity verification and the Stage 2 admission service', async () => {
    const batchId = await makeBatch('VALID', csvFile(csvRow('0001')));
    const result = await worker.processUntilSettled(batchId, 'SYNTH-WORKER-0001');
    const rows = await batchRepository.listRows(batchId);

    expect(result.status).toBe('COMPLETED');
    expect(result.totals).toMatchObject({ accepted: 1, pending: 0, total: 1 });
    expect(rows[0]).toMatchObject({
      admissionReference: expect.stringMatching(/^SYNTH-REGISTRATION-/),
      attemptCount: 1,
      decisionReference: expect.stringMatching(/^SYNTH-DECISION-/),
      status: 'ACCEPTED',
    });
    await expect(
      pool.query("UPDATE batch_rows SET decision_id='SYNTH-DECISION-TAMPERED' WHERE batch_id=$1", [
        batchId,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
    expect(await tableCount('admissions')).toBe(1);
  });

  it('reconciles accepted, rejected, manual-review and invalid rows', async () => {
    const csv = csvFile(
      csvRow('ACCEPTED', { category: 'TFW' }),
      csvRow('REJECTED', { category: 'NRI' }),
      csvRow('REVIEW', { category: 'OTHER_SUPERNUMERARY' }),
      csvRow('INVALID', { student_reference: '' }),
    );
    const batchId = await makeBatch('MIXED', csv);
    const result = await worker.processUntilSettled(batchId, 'SYNTH-WORKER-0001');

    expect(result.status).toBe('NEEDS_ACTION');
    expect(result.totals).toEqual({
      accepted: 1,
      failedFinal: 0,
      invalid: 1,
      manualReview: 1,
      pending: 0,
      rejected: 1,
      retryable: 0,
      total: 4,
    });
    expect(await tableCount('capacity_reservations')).toBe(1);
  });

  it('returns the original receipt for identical replay and duplicate digest', async () => {
    const csv = csvFile(csvRow('0001'));
    const first = await createBatch.execute(uploadCommand('REPLAY', csv));
    const replay = await createBatch.execute(uploadCommand('REPLAY', csv));
    const digestReplay = await createBatch.execute(
      uploadCommand('DIGEST', csv, 'SYNTH-DIFFERENT-UPLOAD-KEY'),
    );

    expect(replay).toEqual({ ...first, replayed: true });
    expect(digestReplay.batchId).toBe(first.batchId);
    expect(digestReplay.replayed).toBe(true);
    expect(await tableCount('admission_batches')).toBe(1);
    expect(await tableCount('batch_upload_requests')).toBe(2);
  });

  it('rejects conflicting idempotency-key reuse', async () => {
    const key = 'SYNTH-CONFLICTING-UPLOAD-KEY';
    await createBatch.execute(uploadCommand('CONFLICT-A', csvFile(csvRow('A')), key));
    await expect(
      createBatch.execute(uploadCommand('CONFLICT-B', csvFile(csvRow('B')), key)),
    ).rejects.toBeInstanceOf(BatchIdempotencyConflictError);
    expect(await tableCount('admission_batches')).toBe(1);
  });

  it('retries provider outage and converts the exhausted transient result to manual review', async () => {
    const batchId = await makeBatch(
      'OUTAGE',
      csvFile(csvRow('OUTAGE', { academic_identity_reference: 'SYNTH-IDENTITY-OUTAGE-0001' })),
    );
    const result = await worker.processUntilSettled(batchId, 'SYNTH-WORKER-0001');
    const rows = await batchRepository.listRows(batchId);

    expect(result.totals.manualReview).toBe(1);
    expect(rows[0]).toMatchObject({ attemptCount: 3, status: 'MANUAL_REVIEW' });
    expect(rows[0]?.findings.map(({ code }) => code)).toContain('IDENTITY_PROVIDER_UNAVAILABLE');
    expect(await tableCount('capacity_reservations')).toBe(0);
  });

  it('recovers an expired worker lease without processing a row twice', async () => {
    const batchId = await makeBatch('RESUME', csvFile(csvRow('RESUME')));
    const abandoned = await batchRepository.claimRows(
      batchId,
      'SYNTH-WORKER-ABANDONED',
      1,
      '2026-08-01T08:00:00.000Z',
    );
    expect(abandoned).toHaveLength(1);

    await worker.processUntilSettled(batchId, 'SYNTH-WORKER-RECOVERY');
    const rows = await batchRepository.listRows(batchId);
    expect(rows[0]).toMatchObject({ attemptCount: 2, status: 'ACCEPTED' });
    expect(await tableCount('admissions')).toBe(1);
  });

  it('lets concurrent workers claim distinct rows', async () => {
    const batchId = await makeBatch('WORKERS', csvFile(csvRow('WORKER-A'), csvRow('WORKER-B')));
    await Promise.all([
      worker.processNext(batchId, 'SYNTH-WORKER-A', 1),
      worker.processNext(batchId, 'SYNTH-WORKER-B', 1),
    ]);
    const summary = await batchRepository.reconcile(batchId);
    expect(summary.totals.accepted).toBe(2);
    expect(await tableCount('admissions')).toBe(2);
  });

  it('protects the final ordinary seat under concurrent batch workers', async () => {
    await pool.query(
      `UPDATE capacity_allocations SET used_quantity=capacity_quantity-1
       WHERE approval_snapshot_id='SYNTH-APPROVAL-0001' AND allocation_code='ORDINARY'`,
    );
    const batchId = await makeBatch('LAST-SEAT', csvFile(csvRow('LAST-A'), csvRow('LAST-B')));
    await Promise.all([
      worker.processNext(batchId, 'SYNTH-WORKER-A', 1),
      worker.processNext(batchId, 'SYNTH-WORKER-B', 1),
    ]);
    const summary = await batchRepository.reconcile(batchId);
    const overflow = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM capacity_allocations
       WHERE used_quantity > capacity_quantity`,
    );
    expect(summary.totals).toMatchObject({ accepted: 1, rejected: 1 });
    expect(Number(overflow.rows[0]?.count)).toBe(0);
  });

  it('rolls receipt, audit and outbox back together and permits a safe retry', async () => {
    await pool.query(
      `INSERT INTO outbox_events (
         id,event_type,aggregate_type,aggregate_reference,payload,created_at
       ) VALUES (
         'OUTBOX-SYNTH-BATCH-0001-RECEIVED','SYNTH_COLLISION','SYNTH','SYNTH',
         '{"synthetic":true}'::jsonb,transaction_timestamp()
       )`,
    );
    await expect(
      createBatch.execute(uploadCommand('ROLLBACK', csvFile(csvRow('ROLLBACK')))),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await tableCount('admission_batches')).toBe(0);
    expect(await tableCount('batch_upload_requests')).toBe(0);
    expect(await tableCount('business_audit_events')).toBe(0);

    await pool.query("DELETE FROM outbox_events WHERE event_type='SYNTH_COLLISION'");
    await expect(
      createBatch.execute(uploadCommand('ROLLBACK', csvFile(csvRow('ROLLBACK')))),
    ).resolves.toMatchObject({ replayed: false });
    expect(await tableCount('admission_batches')).toBe(1);
  });

  it('generates a formula-safe correction file from persisted invalid rows', async () => {
    const batchId = await makeBatch(
      'CORRECTION',
      csvFile(csvRow('INVALID', { student_reference: '=SYNTH-FORMULA' })),
    );
    const correctionRows = await batchRepository.correctionRows(batchId);
    const { correctionCsv } = await import('../../src/csv-template.js');
    const csv = correctionCsv(correctionRows);
    expect(csv).toContain('"\'=SYNTH-FORMULA"');
    expect(csv).toContain('FORMULA_PREFIX_REJECTED');
  });
});
