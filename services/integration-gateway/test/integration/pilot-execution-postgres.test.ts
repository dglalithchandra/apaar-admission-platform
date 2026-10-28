import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '@apaar-platform/admission-application';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PilotExecutionService,
  PilotWorkerService,
  PostgresPilotExecutionRepository,
  PostgresPilotWorkerRepository,
  type GoNoGoInput,
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
  actorReference: 'SYNTH-EXECUTION-MAKER-001',
  institutionId: null,
  organisationReference: 'SYNTH-AICTE',
  roles: ['SERVICE_INTEGRATION_CLIENT'],
};
const checker: Principal = {
  actorReference: 'SYNTH-EXECUTION-CHECKER-001',
  institutionId: null,
  organisationReference: 'SYNTH-AICTE',
  roles: ['AICTE_CHECKER'],
};
const gates: GoNoGoInput = {
  accessibilityReady: true,
  approvalDataFresh: true,
  authenticationAndRolesReady: true,
  backupAndRecoveryReady: true,
  configurationReady: true,
  identityProviderReady: true,
  incidentOwnershipReady: true,
  membershipValid: true,
  migrationReconciled: true,
  observabilityAndAlertsReady: true,
  policyBlockersResolved: true,
  productionAuthorityGranted: null,
  rollbackReady: true,
  securityReady: true,
  supportReady: true,
  syntheticExecutionApproved: true,
  trainingComplete: true,
};

function service() {
  let assessment = 0;
  let report = 0;
  return new PilotExecutionService(
    new PostgresPilotExecutionRepository(pool),
    () => '2026-10-26T12:00:00.000Z',
    () => `SYNTH-ASSESSMENT-PG-${String(++assessment).padStart(3, '0')}`,
    () => `SYNTH-REPORT-PG-${String(++report).padStart(3, '0')}`,
  );
}

async function create(instance: PilotExecutionService) {
  return instance.create(
    {
      cohortReference: 'SYNTH-COHORT-EXECUTION-PG-001',
      executionReference: 'SYNTH-EXECUTION-PG-001',
      makerReference: maker.actorReference,
      operationalOwnerReferences: ['SYNTH-OWNER-PG-001'],
      pilotReference: 'SYNTH-PILOT-PG-001',
      pilotVersion: 1,
      scheduledEnd: '2026-10-27T00:00:00.000Z',
      scheduledStart: '2026-10-26T00:00:00.000Z',
    },
    maker,
    'SYNTH-CREATE-PG-001',
  );
}

async function approve(instance: PilotExecutionService) {
  await create(instance);
  await instance.assess('SYNTH-EXECUTION-PG-001', gates, maker);
  await instance.submitGoLiveReview('SYNTH-EXECUTION-PG-001', 1, maker, 'SYNTH-REVIEW-PG-001');
  return instance.approve('SYNTH-EXECUTION-PG-001', 2, checker, 'SYNTH-APPROVE-PG-001');
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
  await pool.query(`TRUNCATE
    pilot_completion_reports,pilot_expansion_decisions,pilot_incident_timeline,pilot_incidents,
    pilot_evidence_snapshots,pilot_worker_receipts,pilot_worker_jobs,pilot_execution_participation,
    pilot_go_no_go_assessments,pilot_execution_commands,pilot_executions,pilot_reconciliations,
    pilot_migration_state_history,pilot_migration_receipts,pilot_readiness_assessments,
    pilot_configurations,business_audit_events,outbox_events,courses,programmes,campuses,institutions
    CASCADE`);
  await pool.query(
    `INSERT INTO institutions(id,name) VALUES
      ('SYNTH-INSTITUTION-001','Synthetic Ready Institution'),
      ('SYNTH-INSTITUTION-002','Synthetic Freshness Blocked Institution'),
      ('SYNTH-INSTITUTION-003','Synthetic Degraded Institution'),
      ('SYNTH-INSTITUTION-004','Synthetic Paused Institution')`,
  );
  await pool.query(
    `INSERT INTO campuses(id,institution_id,name) VALUES
      ('SYNTH-CAMPUS-001','SYNTH-INSTITUTION-001','Synthetic Main Campus'),
      ('SYNTH-CAMPUS-002','SYNTH-INSTITUTION-002','Synthetic Expansion Campus'),
      ('SYNTH-CAMPUS-003','SYNTH-INSTITUTION-003','Synthetic Degraded Campus'),
      ('SYNTH-CAMPUS-004','SYNTH-INSTITUTION-004','Synthetic Paused Campus')`,
  );
  await pool.query(
    `INSERT INTO pilot_configurations(
      pilot_reference,version,cohort_reference,institution_id,campus_ids,effective_from,effective_to,
      enabled_capabilities,template_version,api_version,maximum_batch_rows,maximum_daily_submissions,
      global_kill_switch,institution_kill_switch,state,maker_reference,checker_reference
    ) VALUES
      ('SYNTH-PILOT-PG-001',1,'SYNTH-COHORT-EXECUTION-PG-001','SYNTH-INSTITUTION-001',
       '["SYNTH-CAMPUS-001"]','2026-10-01','2027-03-31','["BATCH_UPLOAD","CASEWORK"]',
       '1.0','v1',10000,100,false,false,'ACTIVE','SYNTH-PILOT-MAKER-001','SYNTH-PILOT-CHECKER-001'),
      ('SYNTH-PILOT-PG-001',2,'SYNTH-COHORT-EXECUTION-PG-001','SYNTH-INSTITUTION-001',
       '["SYNTH-CAMPUS-001"]','2026-10-01','2027-03-31','["BATCH_UPLOAD","CASEWORK"]',
       '1.0','v1',10000,200,false,false,'DRAFT','SYNTH-EXECUTION-MAKER-001',NULL)`,
  );
});

describe('Stage 7B synthetic pilot execution PostgreSQL', () => {
  it('migrates through the additive Stage 7B version repeatably', async () => {
    const versions = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    expect(versions.rows.at(-1)?.version).toBe('0016_synthetic_identity_binding_backfill.sql');
    for (const directory of migrationDirectories)
      await expect(migrate(pool, directory)).resolves.toEqual([]);
  });

  it('persists the lifecycle, exact replay, immutable history and atomic audit/outbox', async () => {
    const instance = service();
    await create(instance);
    await instance.assess('SYNTH-EXECUTION-PG-001', gates, maker);
    await instance.submitGoLiveReview('SYNTH-EXECUTION-PG-001', 1, maker, 'SYNTH-REVIEW-PG-001');
    await instance.approve('SYNTH-EXECUTION-PG-001', 2, checker, 'SYNTH-APPROVE-PG-001');
    const started = await instance.start(
      'SYNTH-EXECUTION-PG-001',
      3,
      checker,
      'SYNTH-START-PG-001',
    );
    await expect(
      instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-START-PG-001'),
    ).resolves.toEqual(started);
    await expect(
      instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-START-PG-001-CONFLICT'),
    ).rejects.toMatchObject({ code: 'EXECUTION_VERSION_CONFLICT' });
    await expect(
      instance.pause('SYNTH-EXECUTION-PG-001', 4, checker, 'SYNTH-START-PG-001'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const counts = await pool.query<{ audits: string; outbox: string; versions: string }>(
      `SELECT
        (SELECT count(*)::text FROM pilot_executions) versions,
        (SELECT count(*)::text FROM business_audit_events WHERE aggregate_type='PILOT_EXECUTION') audits,
        (SELECT count(*)::text FROM outbox_events WHERE aggregate_type='PILOT_EXECUTION') outbox`,
    );
    expect(counts.rows[0]).toEqual({ audits: '4', outbox: '4', versions: '4' });
    await expect(pool.query('DELETE FROM pilot_executions')).rejects.toMatchObject({
      code: '55000',
    });
  });

  it('allows exactly one concurrent start and rejects stale optimistic versions', async () => {
    const instance = service();
    await approve(instance);
    const outcomes = await Promise.allSettled([
      instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-CONCURRENT-START-001'),
      instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-CONCURRENT-START-002'),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(1);
    await expect(
      instance.pause('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-STALE-PAUSE-001'),
    ).rejects.toMatchObject({ code: 'EXECUTION_VERSION_CONFLICT' });
  });

  it('enforces participation membership and tenant-isolates institution evidence', async () => {
    const instance = service();
    await create(instance);
    await instance.addParticipation(
      {
        approvalDataFresh: true,
        campusIds: ['SYNTH-CAMPUS-001'],
        executionReference: 'SYNTH-EXECUTION-PG-001',
        identityDependency: 'READY',
        institutionId: 'SYNTH-INSTITUTION-001',
        readiness: 'READY',
      },
      maker,
    );
    await expect(
      instance.addParticipation(
        {
          approvalDataFresh: false,
          campusIds: ['SYNTH-CAMPUS-001'],
          executionReference: 'SYNTH-EXECUTION-PG-001',
          identityDependency: 'DEGRADED',
          institutionId: 'SYNTH-INSTITUTION-002',
          readiness: 'BLOCKED',
        },
        maker,
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_MEMBERSHIP_INVALID' });
    const evidence = {
      accessibilityFindings: 0,
      capacityAnomalies: 0,
      caseworkBacklog: 0,
      caseworkOldestAgeHours: 0,
      capturedAt: '2026-10-26T12:00:00.000Z',
      evidenceReference: 'SYNTH-EVIDENCE-PG-001',
      executionReference: 'SYNTH-EXECUTION-PG-001',
      identityOutageRate: 0,
      identityPendingRate: 0,
      incidentCount: 0,
      institutionId: 'SYNTH-INSTITUTION-001',
      migrationDrift: 0,
      notificationDeadLetters: 0,
      onboardingCompletionRate: 1,
      processingLatencyP95Ms: 120,
      recoveryDurationMinutes: 0,
      rejectionRate: 0,
      submissionSuccessRate: 1,
      taskCompletionRate: 1,
      validationRuleTrends: { ACCEPTED: 1 },
    } as const;
    await instance.recordEvidence(evidence, maker);
    const repository = new PostgresPilotExecutionRepository(pool);
    await expect(
      repository.listEvidenceForInstitution('SYNTH-EXECUTION-PG-001', 'SYNTH-INSTITUTION-002'),
    ).resolves.toEqual([]);
    await expect(
      repository.listEvidenceForInstitution('SYNTH-EXECUTION-PG-001', 'SYNTH-INSTITUTION-001'),
    ).resolves.toHaveLength(1);
  });

  it('atomically stops exposure for an incident and resumes after checked recovery', async () => {
    const instance = service();
    await approve(instance);
    await instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-START-INCIDENT-PG-001');
    await instance.declareIncident(
      'SYNTH-EXECUTION-PG-001',
      4,
      {
        affectedCapabilities: ['BATCH_UPLOAD'],
        evidenceReferences: ['SYNTH-EVIDENCE-OUTAGE-PG-001'],
        incidentReference: 'SYNTH-INCIDENT-PG-001',
        ownerReference: 'SYNTH-OWNER-PG-001',
        severity: 'SEV2',
        stopAction: 'AUTOMATIC',
      },
      maker,
      'SYNTH-DECLARE-INCIDENT-PG-001',
    );
    const atomic = await pool.query<{ incidents: string; timelines: string; versions: string }>(
      `SELECT
        (SELECT count(*)::text FROM pilot_incidents) incidents,
        (SELECT count(*)::text FROM pilot_incident_timeline) timelines,
        (SELECT count(*)::text FROM pilot_executions WHERE state='INCIDENT') versions`,
    );
    expect(atomic.rows[0]).toEqual({ incidents: '1', timelines: '1', versions: '1' });
    await expect(
      instance.resume(
        'SYNTH-EXECUTION-PG-001',
        5,
        'SYNTH-INCIDENT-PG-001',
        gates,
        checker,
        'SYNTH-RESUME-PG-001',
      ),
    ).resolves.toMatchObject({ state: 'RUNNING', version: 6 });
  });

  it('recovers durable checkpoints after lease expiry and dead-letters at the retry limit', async () => {
    let now = '2026-10-26T12:00:00.000Z';
    const worker = new PilotWorkerService(new PostgresPilotWorkerRepository(pool), () => now);
    await worker.enqueue({
      attemptCount: 0,
      availableAt: now,
      batchLimit: 50,
      checkpoint: { cursor: 0 },
      executionReference: 'SYNTH-EXECUTION-PG-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      jobReference: 'SYNTH-WORK-PG-001',
      maximumAttempts: 2,
      state: 'PENDING',
      type: 'SUBMISSION_MONITORING',
    });
    await expect(worker.claim('SYNTH-WORKER-001', 30)).resolves.toMatchObject({ attemptCount: 1 });
    await expect(worker.claim('SYNTH-WORKER-002', 30)).resolves.toBeNull();
    now = '2026-10-26T12:01:00.000Z';
    await expect(worker.claim('SYNTH-WORKER-002', 30)).resolves.toMatchObject({ attemptCount: 2 });
    await expect(
      worker.complete('SYNTH-WORK-PG-001', 'SYNTH-WORKER-001', { cursor: 50 }),
    ).rejects.toMatchObject({ code: 'WORKER_LEASE_LOST' });
    await expect(
      worker.fail(
        'SYNTH-WORK-PG-001',
        'SYNTH-WORKER-002',
        { cursor: 50 },
        'IDENTITY_PROVIDER_OUTAGE',
        60,
      ),
    ).resolves.toMatchObject({ checkpoint: { cursor: 50 }, state: 'DEAD_LETTER' });
    const receipts = await pool.query<{ outcome: string }>(
      'SELECT outcome FROM pilot_worker_receipts ORDER BY id',
    );
    expect(receipts.rows).toEqual([
      { outcome: 'CLAIMED' },
      { outcome: 'CLAIMED' },
      { outcome: 'DEAD_LETTER' },
    ]);
  });

  it('keeps provider outage retryable before the retry limit and completes exit reconciliation', async () => {
    const instance = service();
    await approve(instance);
    await instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-START-COMPLETE-PG-001');
    const now = '2026-10-26T12:00:00.000Z';
    const worker = new PilotWorkerService(new PostgresPilotWorkerRepository(pool), () => now);
    await worker.enqueue({
      attemptCount: 0,
      availableAt: now,
      batchLimit: 25,
      checkpoint: { cursor: 0 },
      executionReference: 'SYNTH-EXECUTION-PG-001',
      institutionId: 'SYNTH-INSTITUTION-003',
      jobReference: 'SYNTH-WORK-PG-RETRY-001',
      maximumAttempts: 3,
      state: 'PENDING',
      type: 'MIGRATION_RECONCILIATION',
    });
    await worker.claim('SYNTH-WORKER-RETRY-001');
    await expect(
      worker.fail(
        'SYNTH-WORK-PG-RETRY-001',
        'SYNTH-WORKER-RETRY-001',
        { cursor: 10, identityState: 'PENDING' },
        'IDENTITY_PROVIDER_OUTAGE',
        60,
      ),
    ).resolves.toMatchObject({ state: 'RETRYABLE' });
    await expect(
      instance.complete(
        'SYNTH-EXECUTION-PG-001',
        4,
        {
          accepted: 98,
          auditOutboxConsistent: true,
          capacityCountersValid: true,
          casework: 0,
          pending: 0,
          policyBlockers: 1,
          rejected: 2,
          source: 100,
          terminationRecommended: false,
          unresolvedIncidents: 0,
          workersDrained: true,
        },
        checker,
        'SYNTH-COMPLETE-PG-001',
      ),
    ).resolves.toMatchObject({
      execution: { state: 'COMPLETED' },
      report: { classification: 'AUTHORITY_REVIEW_REQUIRED' },
    });
  });

  it('rolls back conflicting expansion membership and appends a valid re-gated version', async () => {
    const instance = service();
    await approve(instance);
    await instance.start('SYNTH-EXECUTION-PG-001', 3, checker, 'SYNTH-START-EXPANSION-PG-001');
    await instance.pause('SYNTH-EXECUTION-PG-001', 4, checker, 'SYNTH-PAUSE-EXPANSION-PG-001');
    const expansion = {
      campusIds: ['SYNTH-CAMPUS-002'],
      checkerReference: checker.actorReference,
      dryRunPassed: true,
      expansionReference: 'SYNTH-EXPANSION-PG-001',
      institutionIds: ['SYNTH-INSTITUTION-002'],
      newPilotVersion: 2,
      proposalMakerReference: maker.actorReference,
      readinessPassed: true,
      reconciliationDrift: 0,
    } as const;
    await expect(
      instance.expand(
        'SYNTH-EXECUTION-PG-001',
        5,
        { ...expansion, campusIds: ['SYNTH-CAMPUS-003'] },
        checker,
      ),
    ).rejects.toMatchObject({ code: 'EXPANSION_MEMBERSHIP_INVALID' });
    const afterFailure = await pool.query<{ count: string }>(
      'SELECT count(*)::text count FROM pilot_executions',
    );
    expect(afterFailure.rows[0]?.count).toBe('5');
    await expect(
      instance.expand('SYNTH-EXECUTION-PG-001', 5, expansion, checker),
    ).resolves.toMatchObject({ pilotVersion: 2, state: 'PLANNED', version: 6 });
    const decision = await pool.query<{ count: string }>(
      'SELECT count(*)::text count FROM pilot_expansion_decisions',
    );
    expect(decision.rows[0]?.count).toBe('1');
  });
});
