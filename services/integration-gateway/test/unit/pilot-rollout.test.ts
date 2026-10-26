import { describe, expect, it } from 'vitest';
import {
  InMemoryPilotRepository,
  PilotRolloutService,
  evaluatePilotCapability,
  type LegacyMigrationRow,
  type PilotConfiguration,
  type PilotReadinessInput,
  type Principal,
} from '../../src/index.js';

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
const ready: PilotReadinessInput = {
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
const rows: readonly LegacyMigrationRow[] = [
  {
    academicIdentityReference: 'SYNTH-IDENTITY-001',
    recordKey: 'SYNTH-LEGACY-ROW-001',
    regulatoryReference: 'SYNTH-APPROVAL-001',
    schemaVersion: '1.0',
    studentReference: 'SYNTH-STUDENT-001',
  },
];

function harness(): {
  readonly repository: InMemoryPilotRepository;
  readonly service: PilotRolloutService;
} {
  const repository = new InMemoryPilotRepository();
  let sequence = 0;
  return {
    repository,
    service: new PilotRolloutService(
      repository,
      () => '2026-10-26T12:00:00.000Z',
      () => `SYNTH-MIGRATION-${String(++sequence).padStart(3, '0')}`,
    ),
  };
}

function configuration(
  overrides: Partial<Omit<PilotConfiguration, 'checkerReference' | 'state' | 'version'>> = {},
): Omit<PilotConfiguration, 'checkerReference' | 'state' | 'version'> {
  return {
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
    pilotReference: 'SYNTH-PILOT-001',
    templateVersion: '1.0',
    ...overrides,
  };
}

describe('controlled pilot rollout', () => {
  it('configures, assesses, activates, pauses, resumes and exits with immutable versions', async () => {
    const { repository, service } = harness();
    await expect(service.configure(configuration(), maker)).resolves.toMatchObject({
      state: 'DRAFT',
      version: 1,
    });
    await expect(service.assess('SYNTH-PILOT-001', ready, maker)).resolves.toMatchObject({
      outcome: 'PASS',
    });
    const active = await service.activate('SYNTH-PILOT-001', 2, checker);
    expect(active).toMatchObject({
      checkerReference: checker.actorReference,
      state: 'ACTIVE',
      version: 3,
    });
    expect(evaluatePilotCapability(active, 'BATCH_UPLOAD')).toBe(true);
    expect(evaluatePilotCapability(active, 'NOTIFICATIONS')).toBe(false);
    const paused = await service.pause('SYNTH-PILOT-001', 3, checker);
    expect(evaluatePilotCapability(paused, 'BATCH_UPLOAD')).toBe(false);
    const resumed = await service.resume('SYNTH-PILOT-001', 4, checker);
    const exited = await service.exit('SYNTH-PILOT-001', 5, 0, checker);
    expect(resumed.state).toBe('ACTIVE');
    expect(exited.state).toBe('EXITED');
    expect(repository.history.map((item) => item.event)).toEqual([
      'PILOT_CONFIGURED',
      'PILOT_READY',
      'PILOT_ACTIVATED',
      'PILOT_PAUSED',
      'PILOT_RESUMED',
      'PILOT_EXITED',
    ]);
  });

  it('blocks unresolved readiness, maker-checker reuse, stale versions and reconciliation drift', async () => {
    const { service } = harness();
    await service.configure(configuration(), maker);
    await expect(
      service.assess(
        'SYNTH-PILOT-001',
        { ...ready, dependencyReady: false, policyBlockers: ['SYNTH-POLICY-BLOCKER-001'] },
        maker,
      ),
    ).resolves.toMatchObject({ outcome: 'FAIL' });
    await expect(service.activate('SYNTH-PILOT-001', 1, checker)).rejects.toMatchObject({
      code: 'PILOT_NOT_READY',
    });
    await service.assess('SYNTH-PILOT-001', ready, maker);
    await expect(service.activate('SYNTH-PILOT-001', 1, checker)).rejects.toMatchObject({
      code: 'PILOT_VERSION_CONFLICT',
    });
    await expect(service.activate('SYNTH-PILOT-001', 2, maker)).rejects.toMatchObject({
      code: 'MAKER_CHECKER_SEPARATION_REQUIRED',
    });
    const active = await service.activate('SYNTH-PILOT-001', 2, checker);
    await expect(service.exit('SYNTH-PILOT-001', active.version, 1, checker)).rejects.toMatchObject(
      {
        code: 'PILOT_EXIT_BLOCKED',
      },
    );
  });

  it('fails closed for kill switches and handles incident recovery', async () => {
    const { service } = harness();
    await service.configure(configuration({ institutionKillSwitch: true }), maker);
    await service.assess('SYNTH-PILOT-001', ready, maker);
    await expect(service.activate('SYNTH-PILOT-001', 2, checker)).rejects.toMatchObject({
      code: 'PILOT_KILL_SWITCH_ACTIVE',
    });
    expect(evaluatePilotCapability(null, 'BATCH_UPLOAD')).toBe(false);

    const second = harness();
    await second.service.configure(configuration(), maker);
    await second.service.assess('SYNTH-PILOT-001', ready, maker);
    await second.service.activate('SYNTH-PILOT-001', 2, checker);
    const incident = await second.service.pause('SYNTH-PILOT-001', 3, checker, true);
    expect(incident.state).toBe('INCIDENT');
    await expect(second.service.resume('SYNTH-PILOT-001', 4, checker)).resolves.toMatchObject({
      state: 'ACTIVE',
    });
    const stopped = await second.service.setKillSwitches(
      'SYNTH-PILOT-001',
      5,
      { globalKillSwitch: true, institutionKillSwitch: false },
      maker,
    );
    expect(stopped).toMatchObject({ globalKillSwitch: true, state: 'INCIDENT', version: 6 });
  });

  it('re-gates controlled expansion and rejects unsafe expansion', async () => {
    const { service } = harness();
    await service.configure(configuration(), maker);
    await service.assess('SYNTH-PILOT-001', ready, maker);
    await service.activate('SYNTH-PILOT-001', 2, checker);
    await expect(
      service.expand('SYNTH-PILOT-001', 3, ['SYNTH-CAMPUS-002'], maker),
    ).rejects.toMatchObject({ code: 'PILOT_EXPANSION_INVALID' });
    await service.pause('SYNTH-PILOT-001', 3, checker);
    await expect(
      service.expand('SYNTH-PILOT-001', 4, ['SYNTH-CAMPUS-002'], maker),
    ).resolves.toMatchObject({
      campusIds: ['SYNTH-CAMPUS-001', 'SYNTH-CAMPUS-002'],
      checkerReference: null,
      state: 'DRAFT',
      version: 5,
    });
  });

  it('records deterministic reconciliation and blocks invalid counts', async () => {
    const { repository, service } = harness();
    await service.configure(configuration(), maker);
    await expect(
      service.reconcile(
        'SYNTH-PILOT-001',
        { acceptedRows: 98, rejectedRows: 2, sourceRows: 100, unresolvedCorrections: 0 },
        maker,
      ),
    ).resolves.toMatchObject({ drift: 0, outcome: 'PASS' });
    await expect(
      service.reconcile(
        'SYNTH-PILOT-001',
        { acceptedRows: 98, rejectedRows: 1, sourceRows: 100, unresolvedCorrections: 1 },
        maker,
      ),
    ).resolves.toMatchObject({ drift: 1, outcome: 'FAIL' });
    expect(repository.reconciliations).toHaveLength(2);
    await expect(
      service.reconcile(
        'SYNTH-PILOT-001',
        { acceptedRows: -1, rejectedRows: 0, sourceRows: 0, unresolvedCorrections: 0 },
        maker,
      ),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_COUNTS_INVALID' });
  });

  it('dry-runs, reconciles, replays, rejects conflicts and rolls back staged migrations', async () => {
    const { service } = harness();
    await service.configure(configuration(), maker);
    const dryRun = await service.migrate(
      'SYNTH-PILOT-001',
      'SYNTH-IDEMPOTENCY-MIGRATION-001',
      'DRY_RUN',
      [
        ...rows,
        { ...rows[0]!, schemaVersion: '9.0' },
        {
          ...rows[0]!,
          recordKey: 'SYNTH-LEGACY-ROW-002',
          studentReference: ' SYNTH-STUDENT-002',
        },
      ],
      maker,
    );
    expect(dryRun).toMatchObject({
      acceptedRows: 1,
      drift: 2,
      duplicateRows: 1,
      rejectedRows: 2,
      state: 'DRY_RUN_COMPLETED',
    });
    expect(dryRun.correctionCsv).toContain('VALUE_REQUIRES_EXPLICIT_CORRECTION');
    await expect(
      service.migrate(
        'SYNTH-PILOT-001',
        'SYNTH-IDEMPOTENCY-MIGRATION-001',
        'DRY_RUN',
        [
          ...rows,
          { ...rows[0]!, schemaVersion: '9.0' },
          {
            ...rows[0]!,
            recordKey: 'SYNTH-LEGACY-ROW-002',
            studentReference: ' SYNTH-STUDENT-002',
          },
        ],
        maker,
      ),
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      service.migrate('SYNTH-PILOT-001', 'SYNTH-IDEMPOTENCY-MIGRATION-001', 'DRY_RUN', rows, maker),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const staged = await service.migrate(
      'SYNTH-PILOT-001',
      'SYNTH-IDEMPOTENCY-MIGRATION-002',
      'STAGED',
      rows,
      maker,
    );
    await expect(
      service.rollbackMigration(staged.migrationReference, maker),
    ).resolves.toMatchObject({
      state: 'ROLLED_BACK',
    });
    await expect(service.rollbackMigration(staged.migrationReference, maker)).rejects.toMatchObject(
      {
        code: 'MIGRATION_ROLLBACK_INVALID',
      },
    );
  });

  it('rejects invalid membership, windows, locked configuration and missing resources', async () => {
    const { service } = harness();
    await expect(service.configure(configuration({ campusIds: [] }), maker)).rejects.toMatchObject({
      code: 'PILOT_CAMPUSES_INVALID',
    });
    await expect(
      service.configure(configuration({ effectiveTo: '2026-01-01' }), maker),
    ).rejects.toMatchObject({ code: 'PILOT_WINDOW_INVALID' });
    await expect(
      service.configure(configuration({ makerReference: 'SYNTH-DIFFERENT-MAKER' }), maker),
    ).rejects.toMatchObject({ code: 'PILOT_MAKER_MISMATCH' });
    await expect(
      service.configure(configuration({ maximumBatchRows: 10_001 }), maker),
    ).rejects.toMatchObject({ code: 'PILOT_LIMITS_INVALID' });
    await expect(service.assess('SYNTH-PILOT-MISSING', ready, maker)).rejects.toMatchObject({
      code: 'PILOT_NOT_FOUND',
    });
    await expect(service.rollbackMigration('SYNTH-MIGRATION-MISSING', maker)).rejects.toMatchObject(
      {
        code: 'MIGRATION_NOT_FOUND',
      },
    );
    await service.configure(configuration({ maximumBatchRows: 1 }), maker);
    await expect(
      service.migrate('SYNTH-PILOT-001', 'SYNTH-IDEMPOTENCY-EMPTY', 'DRY_RUN', [], maker),
    ).rejects.toMatchObject({ code: 'MIGRATION_SIZE_INVALID' });
    await expect(
      service.migrate(
        'SYNTH-PILOT-001',
        'SYNTH-IDEMPOTENCY-INVALID-RECORD',
        'DRY_RUN',
        [{ ...rows[0]!, recordKey: 'not-synthetic' }],
        maker,
      ),
    ).rejects.toMatchObject({ code: 'MIGRATION_RECORD_KEY_INVALID' });
  });
});
