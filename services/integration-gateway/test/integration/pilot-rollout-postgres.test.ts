import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '@apaar-platform/admission-application';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PilotRolloutService,
  PostgresPilotRepository,
  type PilotReadinessInput,
  type Principal,
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
const maker: Principal = {
  actorReference: 'SYNTH-PILOT-MAKER-001',
  institutionId: null,
  organisationReference: 'SYNTH-AICTE',
  roles: ['SERVICE_INTEGRATION_CLIENT'],
};
const checker: Principal = {
  actorReference: 'SYNTH-PILOT-CHECKER-001',
  institutionId: null,
  organisationReference: 'SYNTH-AICTE',
  roles: ['AICTE_CHECKER'],
};
const readiness: PilotReadinessInput = {
  approvalDataAvailable: true,
  configurationComplete: true,
  dependencyReady: true,
  policyBlockers: [],
  reconciliationDrift: 0,
  recoveryReady: true,
  rolesReady: true,
  securityReady: true,
  versionsCompatible: true,
};

function service(): PilotRolloutService {
  let sequence = 0;
  return new PilotRolloutService(
    new PostgresPilotRepository(pool),
    () => '2026-10-26T12:00:00.000Z',
    () => `SYNTH-MIGRATION-PG-${String(++sequence).padStart(3, '0')}`,
  );
}

async function configure(instance: PilotRolloutService): Promise<void> {
  await instance.configure(
    {
      apiVersion: 'v1',
      campusIds: ['SYNTH-CAMPUS-001'],
      cohortReference: 'SYNTH-COHORT-001',
      effectiveFrom: '2026-10-01',
      effectiveTo: '2027-03-31',
      enabledCapabilities: ['BATCH_UPLOAD', 'CASEWORK'],
      globalKillSwitch: false,
      institutionId: 'SYNTH-INSTITUTION-001',
      institutionKillSwitch: false,
      makerReference: maker.actorReference,
      maximumBatchRows: 10_000,
      maximumDailySubmissions: 100,
      pilotReference: 'SYNTH-PILOT-PG-001',
      templateVersion: '1.0',
    },
    maker,
  );
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
  await pool.query(`TRUNCATE pilot_reconciliations,pilot_migration_state_history,pilot_migration_receipts,
    pilot_readiness_assessments,pilot_configurations,business_audit_events,outbox_events,
    courses,programmes,campuses,institutions CASCADE`);
  await pool.query(
    `INSERT INTO institutions(id,name) VALUES('SYNTH-INSTITUTION-001','Synthetic Pilot Institution')`,
  );
  await pool.query(
    `INSERT INTO campuses(id,institution_id,name)
     VALUES('SYNTH-CAMPUS-001','SYNTH-INSTITUTION-001','Synthetic Pilot Campus')`,
  );
});

describe('Stage 7 controlled rollout PostgreSQL', () => {
  it('migrates all controlled-rollout versions repeatably', async () => {
    const applied = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(applied.rows.at(-1)?.version).toBe('0017_category_evidence_provenance.sql');
    for (const directory of migrationDirectories)
      await expect(migrate(pool, directory)).resolves.toEqual([]);
  });

  it('persists immutable configuration, readiness, audit and outbox atomically', async () => {
    const instance = service();
    await configure(instance);
    await instance.reconcile(
      'SYNTH-PILOT-PG-001',
      { acceptedRows: 99, rejectedRows: 1, sourceRows: 100, unresolvedCorrections: 0 },
      maker,
    );
    await instance.assess('SYNTH-PILOT-PG-001', readiness, maker);
    await instance.activate('SYNTH-PILOT-PG-001', 2, checker);
    const counts = await pool.query<{ audits: string; configurations: string; outbox: string }>(
      `SELECT (SELECT count(*)::text FROM pilot_configurations) configurations,
       (SELECT count(*)::text FROM business_audit_events) audits,
       (SELECT count(*)::text FROM outbox_events) outbox`,
    );
    expect(counts.rows[0]).toEqual({ audits: '3', configurations: '3', outbox: '3' });
    await expect(
      pool.query("UPDATE pilot_configurations SET state='PAUSED' WHERE version=3"),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(pool.query('DELETE FROM pilot_reconciliations')).rejects.toMatchObject({
      code: '55000',
    });
  });

  it('allows exactly one concurrent activation for the expected version', async () => {
    const instance = service();
    await configure(instance);
    await instance.assess('SYNTH-PILOT-PG-001', readiness, maker);
    const outcomes = await Promise.allSettled([
      instance.activate('SYNTH-PILOT-PG-001', 2, checker),
      instance.activate('SYNTH-PILOT-PG-001', 2, {
        ...checker,
        actorReference: 'SYNTH-PILOT-CHECKER-002',
      }),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const latest = await new PostgresPilotRepository(pool).find('SYNTH-PILOT-PG-001');
    expect(latest).toMatchObject({ state: 'ACTIVE', version: 3 });
  });

  it('rejects campus membership outside the configured institution', async () => {
    const instance = service();
    await expect(
      instance.configure(
        {
          apiVersion: 'v1',
          campusIds: ['SYNTH-CAMPUS-NOT-MEMBER'],
          cohortReference: 'SYNTH-COHORT-INVALID',
          effectiveFrom: '2026-10-01',
          effectiveTo: '2027-03-31',
          enabledCapabilities: ['BATCH_UPLOAD'],
          globalKillSwitch: false,
          institutionId: 'SYNTH-INSTITUTION-001',
          institutionKillSwitch: false,
          makerReference: maker.actorReference,
          maximumBatchRows: 100,
          maximumDailySubmissions: 10,
          pilotReference: 'SYNTH-PILOT-PG-INVALID',
          templateVersion: '1.0',
        },
        maker,
      ),
    ).rejects.toMatchObject({ code: 'PILOT_MEMBERSHIP_INVALID' });
  });

  it('replays migrations, rejects conflicting keys and records rollback append-only', async () => {
    const instance = service();
    await configure(instance);
    const input = [
      {
        academicIdentityReference: 'SYNTH-IDENTITY-001',
        recordKey: 'SYNTH-LEGACY-ROW-001',
        regulatoryReference: 'SYNTH-APPROVAL-001',
        schemaVersion: '1.0',
        studentReference: 'SYNTH-STUDENT-001',
      },
    ];
    const staged = await instance.migrate(
      'SYNTH-PILOT-PG-001',
      'SYNTH-IDEMPOTENCY-PG-001',
      'STAGED',
      input,
      maker,
    );
    await expect(
      instance.migrate('SYNTH-PILOT-PG-001', 'SYNTH-IDEMPOTENCY-PG-001', 'STAGED', input, maker),
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      instance.rollbackMigration(staged.migrationReference, maker),
    ).resolves.toMatchObject({
      state: 'ROLLED_BACK',
    });
    const history = await pool.query<{ state: string }>(
      'SELECT state FROM pilot_migration_state_history ORDER BY id',
    );
    expect(history.rows).toEqual([{ state: 'STAGED' }, { state: 'ROLLED_BACK' }]);
    await expect(
      pool.query('DELETE FROM pilot_migration_receipts WHERE migration_reference=$1', [
        staged.migrationReference,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('rolls back an atomic migration failure and safely retries', async () => {
    const instance = service();
    await configure(instance);
    const blockingId = 'SYNTH-OUTBOX-SYNTH-MIGRATION-PG-001-0-PILOT_MIGRATION_RECORDED';
    await pool.query(
      `INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_reference,payload,created_at)
       VALUES($1,'SYNTH-BLOCKER','PILOT','SYNTH-BLOCKER','{}',transaction_timestamp())`,
      [blockingId],
    );
    const input = [
      {
        academicIdentityReference: 'SYNTH-IDENTITY-RECOVERY-001',
        recordKey: 'SYNTH-LEGACY-RECOVERY-001',
        regulatoryReference: 'SYNTH-APPROVAL-RECOVERY-001',
        schemaVersion: '1.0',
        studentReference: 'SYNTH-STUDENT-RECOVERY-001',
      },
    ];
    await expect(
      instance.migrate(
        'SYNTH-PILOT-PG-001',
        'SYNTH-IDEMPOTENCY-RECOVERY-001',
        'STAGED',
        input,
        maker,
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const failedCounts = await pool.query<{ audits: string; receipts: string }>(
      `SELECT (SELECT count(*)::text FROM pilot_migration_receipts) receipts,
       (SELECT count(*)::text FROM business_audit_events WHERE event_type='PILOT_MIGRATION_RECORDED') audits`,
    );
    expect(failedCounts.rows[0]).toEqual({ audits: '0', receipts: '0' });
    await pool.query('DELETE FROM outbox_events WHERE id=$1', [blockingId]);
    await expect(
      instance.migrate(
        'SYNTH-PILOT-PG-001',
        'SYNTH-IDEMPOTENCY-RECOVERY-001',
        'STAGED',
        input,
        maker,
      ),
    ).resolves.toMatchObject({ state: 'STAGED' });
  });
});
