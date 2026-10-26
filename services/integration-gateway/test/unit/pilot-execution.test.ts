import { describe, expect, it } from 'vitest';
import {
  InMemoryPilotExecutionRepository,
  PilotExecutionService,
  PilotWorkerService,
  assessGoNoGo,
  canExposePilot,
  type GoNoGoInput,
  type PilotEvidence,
  type PilotWorkerJob,
  type PilotWorkerRepositoryPort,
  type Principal,
} from '../../src/index.js';

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

function harness(now = '2026-10-26T12:00:00.000Z') {
  const repository = new InMemoryPilotExecutionRepository();
  let assessment = 0;
  let report = 0;
  return {
    repository,
    service: new PilotExecutionService(
      repository,
      () => now,
      () => `SYNTH-ASSESSMENT-${String(++assessment).padStart(3, '0')}`,
      () => `SYNTH-REPORT-${String(++report).padStart(3, '0')}`,
    ),
  };
}

async function planned(service: PilotExecutionService) {
  return service.create(
    {
      cohortReference: 'SYNTH-COHORT-EXECUTION-001',
      executionReference: 'SYNTH-EXECUTION-001',
      makerReference: maker.actorReference,
      operationalOwnerReferences: ['SYNTH-OWNER-001'],
      pilotReference: 'SYNTH-PILOT-001',
      pilotVersion: 3,
      scheduledEnd: '2026-10-27T00:00:00.000Z',
      scheduledStart: '2026-10-26T00:00:00.000Z',
    },
    maker,
    'SYNTH-CREATE-EXECUTION-001',
  );
}

async function running(service: PilotExecutionService) {
  await planned(service);
  await service.assess('SYNTH-EXECUTION-001', gates, maker);
  await service.submitGoLiveReview('SYNTH-EXECUTION-001', 1, maker, 'SYNTH-REVIEW-EXECUTION-001');
  await service.approve('SYNTH-EXECUTION-001', 2, checker, 'SYNTH-APPROVE-EXECUTION-001');
  return service.start('SYNTH-EXECUTION-001', 3, checker, 'SYNTH-START-EXECUTION-001');
}

describe('synthetic pilot execution control plane', () => {
  it('fails production authority closed while allowing an explicitly synthetic dress rehearsal', async () => {
    const { service } = harness();
    const execution = await planned(service);
    const assessment = await service.assess(execution.executionReference, gates, maker);
    expect(assessment).toMatchObject({ outcome: 'MANUAL_REVIEW', startable: true });
    expect(
      assessment.checks.find((check) => check.code === 'PRODUCTION_AUTHORITY_GRANTED'),
    ).toEqual(expect.objectContaining({ blocking: false, result: 'MANUAL_REVIEW' }));
    await expect(
      service.submitGoLiveReview(
        execution.executionReference,
        1,
        maker,
        'SYNTH-REVIEW-EXECUTION-001',
      ),
    ).resolves.toMatchObject({ state: 'GO_LIVE_REVIEW', version: 2 });
  });

  it('runs the approved lifecycle, exposes only unstopped institutions and completes immutably', async () => {
    const { repository, service } = harness();
    const active = await running(service);
    expect(active).toMatchObject({
      checkerReference: checker.actorReference,
      state: 'RUNNING',
      version: 4,
    });
    expect(canExposePilot(active, 'SYNTH-INSTITUTION-001')).toBe(true);
    const paused = await service.pause(
      active.executionReference,
      4,
      checker,
      'SYNTH-PAUSE-EXECUTION-001',
    );
    expect(canExposePilot(paused, 'SYNTH-INSTITUTION-001')).toBe(false);
    const resumed = await service.resume(
      active.executionReference,
      5,
      'SYNTH-INCIDENT-NONE-001',
      gates,
      checker,
      'SYNTH-RESUME-EXECUTION-001',
    );
    const result = await service.complete(
      active.executionReference,
      resumed.version,
      {
        accepted: 96,
        auditOutboxConsistent: true,
        capacityCountersValid: true,
        casework: 2,
        pending: 1,
        policyBlockers: 1,
        rejected: 1,
        source: 100,
        terminationRecommended: false,
        unresolvedIncidents: 0,
        workersDrained: true,
      },
      checker,
      'SYNTH-COMPLETE-EXECUTION-001',
    );
    expect(result.execution.state).toBe('COMPLETED');
    expect(result.report).toMatchObject({
      authorityDecisionRequired: true,
      classification: 'AUTHORITY_REVIEW_REQUIRED',
    });
    expect(repository.completions).toHaveLength(1);
  });

  it('blocks invalid transitions, stale versions, maker-checker reuse and unresolved blocking gates', async () => {
    const { service } = harness();
    await planned(service);
    await expect(
      service.start('SYNTH-EXECUTION-001', 1, maker, 'SYNTH-INVALID-START-001'),
    ).rejects.toMatchObject({ code: 'EXECUTION_TRANSITION_INVALID' });
    await service.assess('SYNTH-EXECUTION-001', { ...gates, approvalDataFresh: false }, maker);
    await expect(
      service.submitGoLiveReview('SYNTH-EXECUTION-001', 1, maker, 'SYNTH-BLOCKED-REVIEW-001'),
    ).rejects.toMatchObject({ code: 'GO_NO_GO_BLOCKED' });
    await service.assess('SYNTH-EXECUTION-001', gates, maker);
    await service.submitGoLiveReview('SYNTH-EXECUTION-001', 1, maker, 'SYNTH-VALID-REVIEW-001');
    await expect(
      service.approve('SYNTH-EXECUTION-001', 1, checker, 'SYNTH-STALE-APPROVAL-001'),
    ).rejects.toMatchObject({ code: 'EXECUTION_VERSION_CONFLICT' });
    await expect(
      service.approve('SYNTH-EXECUTION-001', 2, maker, 'SYNTH-MAKER-APPROVAL-001'),
    ).rejects.toMatchObject({ code: 'MAKER_CHECKER_SEPARATION_REQUIRED' });
  });

  it('declares a provider incident, stops exposure and requires independent recovery approval', async () => {
    const { repository, service } = harness();
    await running(service);
    const incident = await service.declareIncident(
      'SYNTH-EXECUTION-001',
      4,
      {
        affectedCapabilities: ['BATCH_UPLOAD'],
        evidenceReferences: ['SYNTH-EVIDENCE-OUTAGE-001'],
        incidentReference: 'SYNTH-INCIDENT-001',
        ownerReference: 'SYNTH-OWNER-001',
        severity: 'SEV2',
        stopAction: 'AUTOMATIC',
      },
      maker,
      'SYNTH-DECLARE-INCIDENT-001',
    );
    expect(incident).toMatchObject({ state: 'INCIDENT', stopControls: { cohort: true } });
    expect(canExposePilot(incident, 'SYNTH-INSTITUTION-001')).toBe(false);
    await expect(
      service.resume(
        'SYNTH-EXECUTION-001',
        5,
        'SYNTH-INCIDENT-001',
        { ...gates, identityProviderReady: false },
        maker,
        'SYNTH-UNSAFE-RESUME-001',
      ),
    ).rejects.toMatchObject({ code: 'RESUME_CHECKER_NOT_INDEPENDENT' });
    await expect(
      service.resume(
        'SYNTH-EXECUTION-001',
        5,
        'SYNTH-INCIDENT-001',
        gates,
        checker,
        'SYNTH-SAFE-RESUME-001',
      ),
    ).resolves.toMatchObject({ state: 'RUNNING', stopControls: { cohort: false } });
    expect(repository.incidents).toHaveLength(1);
    expect(repository.timeline).toContain('RECOVERY_APPROVED');
  });

  it('requires a paused, independently checked, zero-drift expansion', async () => {
    const { service } = harness();
    await running(service);
    await expect(
      service.expand(
        'SYNTH-EXECUTION-001',
        4,
        {
          campusIds: ['SYNTH-CAMPUS-002'],
          checkerReference: checker.actorReference,
          dryRunPassed: true,
          expansionReference: 'SYNTH-EXPANSION-001',
          institutionIds: ['SYNTH-INSTITUTION-002'],
          newPilotVersion: 4,
          proposalMakerReference: maker.actorReference,
          readinessPassed: true,
          reconciliationDrift: 0,
        },
        checker,
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_TRANSITION_INVALID' });
    await service.pause('SYNTH-EXECUTION-001', 4, checker, 'SYNTH-PAUSE-FOR-EXPANSION-001');
    await expect(
      service.expand(
        'SYNTH-EXECUTION-001',
        5,
        {
          campusIds: ['SYNTH-CAMPUS-002'],
          checkerReference: checker.actorReference,
          dryRunPassed: true,
          expansionReference: 'SYNTH-EXPANSION-001',
          institutionIds: ['SYNTH-INSTITUTION-002'],
          newPilotVersion: 4,
          proposalMakerReference: maker.actorReference,
          readinessPassed: true,
          reconciliationDrift: 0,
        },
        checker,
      ),
    ).resolves.toMatchObject({
      checkerReference: null,
      pilotVersion: 4,
      state: 'PLANNED',
      version: 6,
    });
  });

  it('protects institution evidence and rejects unsafe evidence rates and completion drift', async () => {
    const { service } = harness();
    await running(service);
    const institution: Principal = {
      actorReference: 'SYNTH-INSTITUTION-ACTOR-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      organisationReference: 'SYNTH-INSTITUTION-001',
      roles: ['INSTITUTION_ADMINISTRATOR'],
    };
    const evidence: PilotEvidence = {
      accessibilityFindings: 0,
      capacityAnomalies: 0,
      caseworkBacklog: 1,
      caseworkOldestAgeHours: 2,
      capturedAt: '2026-10-26T12:00:00.000Z',
      evidenceReference: 'SYNTH-EVIDENCE-001',
      executionReference: 'SYNTH-EXECUTION-001',
      identityOutageRate: 0,
      identityPendingRate: 0.01,
      incidentCount: 0,
      institutionId: 'SYNTH-INSTITUTION-001',
      migrationDrift: 0,
      notificationDeadLetters: 0,
      onboardingCompletionRate: 1,
      processingLatencyP95Ms: 120,
      recoveryDurationMinutes: 0,
      rejectionRate: 0.02,
      submissionSuccessRate: 0.98,
      taskCompletionRate: 1,
      validationRuleTrends: { APPROVED: 98, REJECTED: 2 },
    };
    await expect(service.recordEvidence(evidence, institution)).resolves.toBeUndefined();
    await expect(
      service.recordEvidence(
        {
          ...evidence,
          evidenceReference: 'SYNTH-EVIDENCE-002',
          institutionId: 'SYNTH-INSTITUTION-002',
        },
        institution,
      ),
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_DENIED' });
    await expect(
      service.recordEvidence(
        { ...evidence, evidenceReference: 'SYNTH-EVIDENCE-003', rejectionRate: 2 },
        checker,
      ),
    ).rejects.toMatchObject({ code: 'EVIDENCE_RATE_INVALID' });
    await expect(
      service.complete(
        'SYNTH-EXECUTION-001',
        4,
        {
          accepted: 9,
          auditOutboxConsistent: true,
          capacityCountersValid: true,
          casework: 0,
          pending: 0,
          policyBlockers: 0,
          rejected: 0,
          source: 10,
          terminationRecommended: false,
          unresolvedIncidents: 0,
          workersDrained: true,
        },
        checker,
        'SYNTH-DRIFT-COMPLETE-001',
      ),
    ).rejects.toMatchObject({ code: 'COMPLETION_BLOCKED' });
  });

  it('keeps assessment rules deterministic and validates synthetic execution inputs', async () => {
    const { service } = harness();
    await expect(
      service.create(
        {
          cohortReference: 'SYNTH-COHORT-001',
          executionReference: 'REAL-EXECUTION',
          makerReference: maker.actorReference,
          operationalOwnerReferences: [],
          pilotReference: 'SYNTH-PILOT-001',
          pilotVersion: 1,
          scheduledEnd: '2026-10-25T00:00:00.000Z',
          scheduledStart: '2026-10-26T00:00:00.000Z',
        },
        maker,
        'SYNTH-BAD-CREATE-001',
      ),
    ).rejects.toMatchObject({ code: 'SYNTHETIC_REFERENCE_REQUIRED' });
    const execution = await planned(service);
    const assessment = assessGoNoGo(
      execution,
      { ...gates, policyBlockersResolved: null, securityReady: false },
      'SYNTH-ASSESSMENT-DIRECT-001',
      '2026-10-26T12:00:00.000Z',
    );
    expect(assessment).toMatchObject({ outcome: 'FAIL', startable: false });
  });

  it('validates command keys, maker identity, owners and execution windows', async () => {
    const { service } = harness();
    const base = {
      cohortReference: 'SYNTH-COHORT-001',
      executionReference: 'SYNTH-EXECUTION-VALIDATION-001',
      makerReference: maker.actorReference,
      operationalOwnerReferences: ['SYNTH-OWNER-001'],
      pilotReference: 'SYNTH-PILOT-001',
      pilotVersion: 1,
      scheduledEnd: '2026-10-27T00:00:00.000Z',
      scheduledStart: '2026-10-26T00:00:00.000Z',
    } as const;
    await expect(service.create(base, maker, 'short')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    await expect(
      service.create(
        { ...base, makerReference: 'SYNTH-OTHER-MAKER' },
        maker,
        'SYNTH-KEY-VALIDATION-001',
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_MAKER_MISMATCH' });
    await expect(
      service.create(
        { ...base, operationalOwnerReferences: [] },
        maker,
        'SYNTH-KEY-VALIDATION-002',
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_OWNERS_INVALID' });
    await expect(
      service.create(
        { ...base, operationalOwnerReferences: ['SYNTH-OWNER-001', 'SYNTH-OWNER-001'] },
        maker,
        'SYNTH-KEY-VALIDATION-003',
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_OWNERS_INVALID' });
    await expect(
      service.create(
        { ...base, scheduledEnd: '2026-10-25T00:00:00.000Z' },
        maker,
        'SYNTH-KEY-VALIDATION-004',
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_WINDOW_INVALID' });
  });

  it('blocks inactive windows and active stop controls and replays lifecycle commands exactly', async () => {
    const inactive = harness('2026-10-28T12:00:00.000Z');
    await planned(inactive.service);
    await inactive.service.assess('SYNTH-EXECUTION-001', gates, maker);
    await inactive.service.submitGoLiveReview(
      'SYNTH-EXECUTION-001',
      1,
      maker,
      'SYNTH-REVIEW-INACTIVE-001',
    );
    await inactive.service.approve('SYNTH-EXECUTION-001', 2, checker, 'SYNTH-APPROVE-INACTIVE-001');
    await expect(
      inactive.service.start('SYNTH-EXECUTION-001', 3, checker, 'SYNTH-START-INACTIVE-001'),
    ).rejects.toMatchObject({ code: 'EXECUTION_WINDOW_INACTIVE' });

    const current = harness();
    await planned(current.service);
    await current.service.assess('SYNTH-EXECUTION-001', gates, maker);
    const review = await current.service.submitGoLiveReview(
      'SYNTH-EXECUTION-001',
      1,
      maker,
      'SYNTH-REVIEW-REPLAY-001',
    );
    await expect(
      current.service.submitGoLiveReview(
        'SYNTH-EXECUTION-001',
        1,
        maker,
        'SYNTH-REVIEW-REPLAY-001',
      ),
    ).resolves.toEqual(review);
    const approved = await current.service.approve(
      'SYNTH-EXECUTION-001',
      2,
      checker,
      'SYNTH-APPROVE-REPLAY-001',
    );
    await expect(
      current.service.approve('SYNTH-EXECUTION-001', 2, checker, 'SYNTH-APPROVE-REPLAY-001'),
    ).resolves.toEqual(approved);
    const stopped = await current.service.setStopControls(
      'SYNTH-EXECUTION-001',
      3,
      { cohort: false, global: true, institutionIds: [] },
      checker,
      'SYNTH-STOP-BEFORE-START-001',
    );
    await expect(
      current.service.start(
        'SYNTH-EXECUTION-001',
        stopped.version,
        checker,
        'SYNTH-START-STOPPED-001',
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_START_BLOCKED' });
  });

  it('validates tenant participation, expansion gates and terminal stop controls', async () => {
    const { service } = harness();
    await running(service);
    const institution: Principal = {
      actorReference: 'SYNTH-INSTITUTION-ACTOR-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      organisationReference: 'SYNTH-INSTITUTION-001',
      roles: ['INSTITUTION_ADMINISTRATOR'],
    };
    await expect(
      service.addParticipation(
        {
          approvalDataFresh: true,
          campusIds: ['SYNTH-CAMPUS-002'],
          executionReference: 'SYNTH-EXECUTION-001',
          identityDependency: 'READY',
          institutionId: 'SYNTH-INSTITUTION-002',
          readiness: 'READY',
        },
        institution,
      ),
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_DENIED' });
    await expect(
      service.addParticipation(
        {
          approvalDataFresh: true,
          campusIds: ['SYNTH-CAMPUS-001'],
          executionReference: 'SYNTH-EXECUTION-001',
          identityDependency: 'READY',
          institutionId: 'SYNTH-INSTITUTION-001',
          readiness: 'READY',
        },
        institution,
      ),
    ).resolves.toBeUndefined();
    await service.pause('SYNTH-EXECUTION-001', 4, checker, 'SYNTH-PAUSE-GATES-001');
    const expansion = {
      campusIds: ['SYNTH-CAMPUS-002'],
      checkerReference: checker.actorReference,
      dryRunPassed: true,
      expansionReference: 'SYNTH-EXPANSION-GATES-001',
      institutionIds: ['SYNTH-INSTITUTION-002'],
      newPilotVersion: 4,
      proposalMakerReference: maker.actorReference,
      readinessPassed: true,
      reconciliationDrift: 0,
    } as const;
    await expect(
      service.expand(
        'SYNTH-EXECUTION-001',
        5,
        { ...expansion, checkerReference: maker.actorReference },
        checker,
      ),
    ).rejects.toMatchObject({ code: 'EXPANSION_CHECKER_NOT_INDEPENDENT' });
    await expect(
      service.expand('SYNTH-EXECUTION-001', 5, { ...expansion, reconciliationDrift: 1 }, checker),
    ).rejects.toMatchObject({ code: 'EXPANSION_GATES_BLOCKED' });
    const terminated = await service.terminate(
      'SYNTH-EXECUTION-001',
      5,
      checker,
      'SYNTH-TERMINATE-001',
    );
    await expect(
      service.terminate('SYNTH-EXECUTION-001', 5, checker, 'SYNTH-TERMINATE-001'),
    ).resolves.toEqual(terminated);
    await expect(
      service.setStopControls(
        'SYNTH-EXECUTION-001',
        terminated.version,
        { cohort: false, global: false, institutionIds: [] },
        checker,
        'SYNTH-STOP-TERMINATED-001',
      ),
    ).rejects.toMatchObject({ code: 'EXECUTION_TRANSITION_INVALID' });
  });

  it('classifies completion evidence and replays its immutable report', async () => {
    const { service } = harness();
    await running(service);
    await expect(
      service.complete(
        'SYNTH-EXECUTION-001',
        4,
        {
          accepted: -1,
          auditOutboxConsistent: true,
          capacityCountersValid: true,
          casework: 0,
          pending: 0,
          policyBlockers: 0,
          rejected: 1,
          source: 0,
          terminationRecommended: false,
          unresolvedIncidents: 0,
          workersDrained: true,
        },
        checker,
        'SYNTH-COMPLETE-INVALID-001',
      ),
    ).rejects.toMatchObject({ code: 'COMPLETION_COUNTS_INVALID' });
    const input = {
      accepted: 10,
      auditOutboxConsistent: true,
      capacityCountersValid: true,
      casework: 0,
      pending: 0,
      policyBlockers: 0,
      rejected: 0,
      source: 10,
      terminationRecommended: false,
      unresolvedIncidents: 1,
      workersDrained: true,
    } as const;
    const completed = await service.complete(
      'SYNTH-EXECUTION-001',
      4,
      input,
      checker,
      'SYNTH-COMPLETE-REPLAY-001',
    );
    expect(completed.report.classification).toBe('REMEDIATE');
    await expect(
      service.complete('SYNTH-EXECUTION-001', 4, input, checker, 'SYNTH-COMPLETE-REPLAY-001'),
    ).resolves.toEqual(completed);
  });

  it('exercises bounded worker commands and validation without retaining sensitive labels', async () => {
    const job: PilotWorkerJob = {
      attemptCount: 0,
      availableAt: '2026-10-26T12:00:00.000Z',
      batchLimit: 10,
      checkpoint: {},
      executionReference: 'SYNTH-EXECUTION-001',
      institutionId: 'SYNTH-INSTITUTION-001',
      jobReference: 'SYNTH-WORK-001',
      maximumAttempts: 3,
      state: 'PENDING',
      type: 'ONBOARDING_CHECK',
    };
    const calls: string[] = [];
    const repository: PilotWorkerRepositoryPort = {
      claim: (_now, _worker, _lease) => {
        calls.push('claim');
        return Promise.resolve(job);
      },
      complete: (_job, _worker, _checkpoint, _now) => {
        calls.push('complete');
        return Promise.resolve({ ...job, state: 'COMPLETED' });
      },
      enqueue: (_job) => {
        calls.push('enqueue');
        return Promise.resolve();
      },
      fail: (_job, _worker, _checkpoint, _problem, retryAt) => {
        calls.push(retryAt);
        return Promise.resolve({ ...job, state: 'RETRYABLE' });
      },
    };
    const worker = new PilotWorkerService(repository, () => '2026-10-26T12:00:00.000Z');
    await worker.enqueue(job);
    await worker.claim('SYNTH-WORKER-001');
    await worker.complete(job.jobReference, 'SYNTH-WORKER-001', { cursor: 10 });
    await worker.fail(
      job.jobReference,
      'SYNTH-WORKER-001',
      { cursor: 10 },
      'SYNTHETIC_FAILURE',
      60,
    );
    expect(calls).toContain('2026-10-26T12:01:00.000Z');
    expect(() => worker.claim('SYNTH-WORKER-001', 301)).toThrow(
      expect.objectContaining({
        code: 'WORKER_LEASE_INVALID',
      }),
    );
    expect(() => worker.enqueue({ ...job, jobReference: 'INVALID' })).toThrow(
      expect.objectContaining({ code: 'SYNTHETIC_REFERENCE_REQUIRED' }),
    );
  });

  it('reports missing executions and conflicting idempotency reuse', async () => {
    const { service } = harness();
    await expect(service.assess('SYNTH-MISSING-EXECUTION', gates, maker)).rejects.toMatchObject({
      code: 'EXECUTION_NOT_FOUND',
    });
    await planned(service);
    await expect(
      service.create(
        {
          cohortReference: 'SYNTH-COHORT-OTHER-001',
          executionReference: 'SYNTH-EXECUTION-OTHER-001',
          makerReference: maker.actorReference,
          operationalOwnerReferences: ['SYNTH-OWNER-OTHER-001'],
          pilotReference: 'SYNTH-PILOT-OTHER-001',
          pilotVersion: 1,
          scheduledEnd: '2026-10-27T00:00:00.000Z',
          scheduledStart: '2026-10-26T00:00:00.000Z',
        },
        maker,
        'SYNTH-CREATE-EXECUTION-001',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
});
