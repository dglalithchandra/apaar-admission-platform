import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  asApprovalSnapshotId,
  asIsoDate,
  asIsoDateTime,
  type Clock,
} from '@apaar-platform/admission-domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IdempotencyConflictError } from '../../src/errors.js';
import type { ReferenceGenerator } from '../../src/model.js';
import { assertNonProductionTestDatabase } from '../../src/postgres/config.js';
import { migrate } from '../../src/postgres/migrations.js';
import { PostgresAdmissionStore } from '../../src/postgres/postgres-admission-store.js';
import {
  ImportApprovalSnapshotService,
  SubmitAdmissionService,
} from '../../src/submit-admission.js';
import { SyntheticReferenceGenerator, syntheticApproval, syntheticCommand } from '../fixtures.js';

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');
const clock: Clock = { now: () => asIsoDateTime('2026-08-01T09:00:00.000Z') };
let container: StartedPostgreSqlContainer;
let pool: Pool;
let store: PostgresAdmissionStore;
let initiallyApplied: readonly string[];
let references: SyntheticReferenceGenerator;
let service: SubmitAdmissionService;
let cleanup: (() => Promise<void>) | undefined;

async function count(table: string, where = 'TRUE'): Promise<number> {
  if (!/^[a-z_]+$/.test(table) || !/^[A-Za-z_ =']+$/.test(where))
    throw new TypeError('Unsafe test query.');
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE ${where}`,
  );
  return Number(result.rows[0]?.count ?? -1);
}

async function allocation(code: string): Promise<number> {
  const result = await pool.query<{ used_quantity: number }>(
    'SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id = $1 AND allocation_code = $2',
    ['SYNTH-APPROVAL-0001', code],
  );
  return result.rows[0]?.used_quantity ?? -1;
}

async function capacityOverflowCount(): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM (
       SELECT used_quantity, capacity_quantity FROM capacity_allocations
       UNION ALL
       SELECT used_quantity, capacity_quantity FROM institution_capacity_allocations
     ) counters
     WHERE used_quantity > capacity_quantity`,
  );
  return Number(result.rows[0]?.count ?? -1);
}

describe('PostgreSQL admission persistence', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('SYNTH_APAAR_TEST')
      .withUsername('SYNTH_USER')
      .withPassword('SYNTH_PASSWORD')
      .start();
    const connectionString = container.getConnectionUri();
    assertNonProductionTestDatabase(connectionString);
    pool = new Pool({ connectionString, max: 12 });
    cleanup = async (): Promise<void> => {
      await pool.end();
      await container.stop();
    };
    initiallyApplied = await migrate(pool, migrationsDirectory);
  });

  afterAll(async () => {
    await cleanup?.();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE business_audit_events, outbox_events, approval_import_batches, institutions CASCADE',
    );
    store = new PostgresAdmissionStore(pool);
    references = new SyntheticReferenceGenerator();
    service = new SubmitAdmissionService({ clock, unitOfWork: store }, references);
    await new ImportApprovalSnapshotService(store).execute({ snapshot: syntheticApproval() });
  });

  it('migrates an empty PostgreSQL database and is repeatable', async () => {
    expect(initiallyApplied).toEqual(['0001_admission_registry.sql']);
    await expect(migrate(pool, migrationsDirectory)).resolves.toEqual([]);
    await expect(count('schema_migrations')).resolves.toBe(1);
  });

  it('persists an accepted ordinary admission, exact decision, audit and outbox atomically', async () => {
    const result = await service.execute(syntheticCommand('PG-ORDINARY'));

    expect(result.decision.outcome).toBe('ACCEPT');
    expect(result.decision.approvalSnapshotId).toBe('SYNTH-APPROVAL-0001');
    expect(await allocation('ORDINARY')).toBe(1);
    expect(await count('admissions', "lifecycle_status = 'ACCEPTED'")).toBe(1);
    expect(await count('capacity_reservations')).toBe(1);
    expect(await count('business_audit_events')).toBe(1);
    expect(await count('outbox_events')).toBe(1);
  });

  it('makes NRI consume both ordinary intake and the NRI sublimit', async () => {
    const result = await service.execute(syntheticCommand('PG-NRI', 'NRI'));

    expect(result.decision.outcome).toBe('ACCEPT');
    expect(await allocation('ORDINARY')).toBe(1);
    expect(await allocation('NRI_WITHIN_ORDINARY')).toBe(1);
    expect(await count('capacity_reservations')).toBe(2);
  });

  it('keeps TFW, PM-USPY and other supernumerary reservations separate from ordinary intake', async () => {
    await pool.query(
      `UPDATE capacity_allocations SET used_quantity = capacity_quantity
       WHERE approval_snapshot_id = $1 AND allocation_code = 'ORDINARY'`,
      ['SYNTH-APPROVAL-0001'],
    );

    const tfw = await service.execute(syntheticCommand('PG-TFW', 'TFW'));
    const pm = await service.execute(syntheticCommand('PG-PM', 'PM_USPY'));
    const foreignNational = await service.execute(
      syntheticCommand('PG-FOREIGN-NATIONAL', 'FOREIGN_NATIONAL'),
    );
    const gulf = await service.execute(syntheticCommand('PG-GULF', 'GULF_WORKER_CHILD'));
    const lateral = await service.execute(syntheticCommand('PG-LATERAL', 'LATERAL_ENTRY'));

    expect(tfw.decision.outcome).toBe('ACCEPT');
    expect(pm.decision.outcome).toBe('ACCEPT');
    expect(foreignNational.decision.outcome).toBe('ACCEPT');
    expect(gulf.decision.outcome).toBe('ACCEPT');
    expect(lateral.decision.outcome).toBe('ACCEPT');
    expect(await allocation('TFW')).toBe(1);
    expect(await allocation('PM_USPY_COURSE')).toBe(1);
    expect(await allocation('FN_OCI_GULF_COMBINED')).toBe(2);
    expect(await allocation('FN_OCI_SUBGROUP')).toBe(1);
    expect(await allocation('FOREIGN_NATIONAL_ACROSS_ROUTES')).toBe(1);
    expect(await allocation('GULF_SUBGROUP')).toBe(1);
    expect(await allocation('LATERAL_SUPERNUMERARY')).toBe(1);
    expect(await count('capacity_reservations')).toBe(9);
    const institution = await pool.query<{ used_quantity: number }>(
      'SELECT used_quantity FROM institution_capacity_allocations',
    );
    expect(institution.rows[0]?.used_quantity).toBe(1);
  });

  it('persists rejected and manual-review decisions without capacity consumption', async () => {
    await pool.query(
      `UPDATE capacity_allocations SET used_quantity = capacity_quantity
       WHERE approval_snapshot_id = $1 AND allocation_code = 'ORDINARY'`,
      ['SYNTH-APPROVAL-0001'],
    );
    const rejected = await service.execute(syntheticCommand('PG-REJECT'));
    const review = await service.execute(
      syntheticCommand('PG-REVIEW', 'TFW', 'TEMPORARILY_UNAVAILABLE'),
    );
    const unresolved = await service.execute(
      syntheticCommand('PG-UNRESOLVED', 'OTHER_SUPERNUMERARY'),
    );

    expect(rejected.decision.findings.map(({ code }) => code)).toContain(
      'ORDINARY_CAPACITY_EXCEEDED',
    );
    expect(review.decision.outcome).toBe('MANUAL_REVIEW');
    expect(unresolved.decision.outcome).toBe('MANUAL_REVIEW');
    expect(unresolved.decision.findings.map(({ code }) => code)).toContain(
      'POLICY_CATEGORY_UNCONFIGURED',
    );
    expect(await count('capacity_reservations')).toBe(0);
    expect(await allocation('TFW')).toBe(0);
    expect(await count('admission_decisions')).toBe(3);
  });

  it('returns the original result for replay and does not consume a second seat', async () => {
    const command = syntheticCommand('PG-REPLAY');
    const first = await service.execute(command);
    const replay = await service.execute(command);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await allocation('ORDINARY')).toBe(1);
    expect(await count('admissions')).toBe(1);
    expect(await count('admission_decisions')).toBe(1);
  });

  it('rejects reuse of an idempotency key with a different request hash', async () => {
    const first = syntheticCommand('PG-CONFLICT-A');
    await service.execute(first);
    const second = syntheticCommand('PG-CONFLICT-B');

    await expect(
      service.execute({
        ...second,
        context: { ...second.context, idempotencyKey: first.context.idempotencyKey },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(await count('admissions')).toBe(1);
  });

  it('coalesces concurrent identical retries into one admission', async () => {
    const command = syntheticCommand('PG-CONCURRENT-REPLAY');
    const results = await Promise.all([service.execute(command), service.execute(command)]);

    expect(results.filter(({ replayed }) => !replayed)).toHaveLength(1);
    expect(results[0].admissionId).toBe(results[1].admissionId);
    expect(await count('admissions')).toBe(1);
    expect(await allocation('ORDINARY')).toBe(1);
  });

  it('allows a safe retry after a transaction rolls back part-way through persistence', async () => {
    const first = await service.execute(syntheticCommand('PG-ROLLBACK-SEED'));
    const duplicateRegistration = first.admissionReference;
    const command = syntheticCommand('PG-ROLLBACK-TARGET');
    let sequence = 0;
    const colliding: ReferenceGenerator = {
      next: (kind) => {
        sequence += 1;
        return kind === 'REGISTRATION'
          ? (duplicateRegistration ?? 'SYNTH-REGISTRATION-COLLISION')
          : `SYNTH-${kind}-COLLISION-${String(sequence)}`;
      },
    };

    await expect(
      new SubmitAdmissionService({ clock, unitOfWork: store }, colliding).execute(command),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await count('admission_commands')).toBe(1);
    expect(await count('identity_verifications')).toBe(1);
    expect(await count('idempotency_records')).toBe(1);
    expect(await count('business_audit_events')).toBe(1);
    expect(await count('outbox_events')).toBe(1);

    await expect(service.execute(command)).resolves.toMatchObject({ replayed: false });
    expect(await count('admissions')).toBe(2);
    expect(await count('business_audit_events')).toBe(2);
    expect(await count('outbox_events')).toBe(2);
  });

  it('selects the effective replacement while preserving historical decision references', async () => {
    const historical = await service.execute(syntheticCommand('PG-HISTORICAL'));
    const prior = syntheticApproval();
    const replacement = syntheticApproval({
      id: asApprovalSnapshotId('SYNTH-APPROVAL-0002'),
      importBatchReference: 'SYNTH-IMPORT-0002',
      receivedAt: asIsoDateTime('2026-07-02T09:00:00.000Z'),
      sourceHash: 'SYNTH-SOURCE-HASH-0002',
      sourceRecordId: 'SYNTH-SOURCE-RECORD-0002',
      effectiveFrom: asIsoDate('2026-07-01'),
    });
    await new ImportApprovalSnapshotService(store).execute({
      snapshot: replacement,
      supersedesSnapshotId: prior.id,
      supersessionReason: 'SYNTHETIC_CORRECTION',
    });

    const current = await service.execute(syntheticCommand('PG-CURRENT'));
    expect(current.decision.approvalSnapshotId).toBe('SYNTH-APPROVAL-0002');
    const saved = await pool.query<{ approval_snapshot_id: string }>(
      'SELECT approval_snapshot_id FROM admission_decisions WHERE id = $1',
      [historical.decisionId],
    );
    expect(saved.rows[0]?.approval_snapshot_id).toBe('SYNTH-APPROVAL-0001');
    await expect(
      pool.query('UPDATE admission_decisions SET approval_snapshot_id = $1 WHERE id = $2', [
        replacement.id,
        historical.decisionId,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('admits exactly one of two competitors for the last ordinary seat', async () => {
    await pool.query(
      `UPDATE capacity_allocations SET used_quantity = capacity_quantity - 1
       WHERE approval_snapshot_id = $1 AND allocation_code = 'ORDINARY'`,
      ['SYNTH-APPROVAL-0001'],
    );
    const [first, second] = await Promise.all([
      service.execute(syntheticCommand('PG-LAST-SEAT-A')),
      service.execute(syntheticCommand('PG-LAST-SEAT-B')),
    ]);
    const decisions = [first, second];

    expect(decisions.filter(({ decision }) => decision.outcome === 'ACCEPT')).toHaveLength(1);
    const loser = decisions.find(({ decision }) => decision.outcome === 'REJECT');
    expect(loser?.decision.findings.map(({ code }) => code)).toContain(
      'ORDINARY_CAPACITY_EXCEEDED',
    );
    expect(await allocation('ORDINARY')).toBe(60);
    expect(await count('capacity_reservations')).toBe(1);
    expect(await count('admissions', "lifecycle_status = 'ACCEPTED'")).toBe(1);
    expect(await count('business_audit_events')).toBe(2);
    expect(await count('outbox_events')).toBe(2);
    expect(await capacityOverflowCount()).toBe(0);
  });
});
