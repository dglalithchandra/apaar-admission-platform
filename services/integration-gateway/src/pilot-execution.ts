import { createHash } from 'node:crypto';
import type { Principal } from './model.js';
import { GatewayProblem } from './model.js';
import type { PilotCapability, ReadinessResult } from './pilot-rollout.js';

export const PILOT_EXECUTION_STATES = [
  'PLANNED',
  'GO_LIVE_REVIEW',
  'APPROVED',
  'RUNNING',
  'PAUSED',
  'INCIDENT',
  'COMPLETED',
  'TERMINATED',
] as const;
export type PilotExecutionState = (typeof PILOT_EXECUTION_STATES)[number];

export const PILOT_WORK_TYPES = [
  'ONBOARDING_CHECK',
  'MIGRATION_RECONCILIATION',
  'SUBMISSION_MONITORING',
  'NOTIFICATION_PROCESSING',
  'CASEWORK_SNAPSHOT',
  'EXIT_RECONCILIATION',
] as const;
export type PilotWorkType = (typeof PILOT_WORK_TYPES)[number];
export type PilotWorkState = 'PENDING' | 'IN_FLIGHT' | 'RETRYABLE' | 'COMPLETED' | 'DEAD_LETTER';

export interface PilotStopControls {
  readonly cohort: boolean;
  readonly global: boolean;
  readonly institutionIds: readonly string[];
}

export interface PilotExecution {
  readonly authorityMode: 'SYNTHETIC_ONLY';
  readonly checkerReference: string | null;
  readonly cohortReference: string;
  readonly executionReference: string;
  readonly makerReference: string;
  readonly operationalOwnerReferences: readonly string[];
  readonly pilotReference: string;
  readonly pilotVersion: number;
  readonly scheduledEnd: string;
  readonly scheduledStart: string;
  readonly state: PilotExecutionState;
  readonly stopControls: PilotStopControls;
  readonly version: number;
}

export interface GoNoGoInput {
  readonly accessibilityReady: boolean;
  readonly approvalDataFresh: boolean;
  readonly authenticationAndRolesReady: boolean;
  readonly backupAndRecoveryReady: boolean;
  readonly configurationReady: boolean;
  readonly identityProviderReady: boolean;
  readonly incidentOwnershipReady: boolean;
  readonly membershipValid: boolean;
  readonly migrationReconciled: boolean;
  readonly observabilityAndAlertsReady: boolean;
  readonly policyBlockersResolved: boolean | null;
  readonly productionAuthorityGranted: boolean | null;
  readonly rollbackReady: boolean;
  readonly securityReady: boolean;
  readonly supportReady: boolean;
  readonly syntheticExecutionApproved: boolean;
  readonly trainingComplete: boolean;
}

export interface GoNoGoCheck {
  readonly blocking: boolean;
  readonly code: string;
  readonly explanation: string;
  readonly result: ReadinessResult;
}

export interface GoNoGoAssessment {
  readonly assessedAt: string;
  readonly assessmentReference: string;
  readonly checks: readonly GoNoGoCheck[];
  readonly executionReference: string;
  readonly executionVersion: number;
  readonly outcome: ReadinessResult;
  readonly startable: boolean;
}

export interface PilotParticipation {
  readonly approvalDataFresh: boolean;
  readonly campusIds: readonly string[];
  readonly executionReference: string;
  readonly identityDependency: 'READY' | 'DEGRADED' | 'OUTAGE';
  readonly institutionId: string;
  readonly readiness: 'READY' | 'BLOCKED' | 'DEGRADED' | 'PAUSED';
}

export interface PilotIncident {
  readonly affectedCapabilities: readonly PilotCapability[];
  readonly cohortReference: string;
  readonly declaredAt: string;
  readonly evidenceReferences: readonly string[];
  readonly executionReference: string;
  readonly incidentReference: string;
  readonly ownerReference: string;
  readonly severity: 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';
  readonly stopAction: 'AUTOMATIC' | 'MANUAL';
}

export interface PilotEvidence {
  readonly accessibilityFindings: number;
  readonly capacityAnomalies: number;
  readonly caseworkBacklog: number;
  readonly caseworkOldestAgeHours: number;
  readonly capturedAt: string;
  readonly evidenceReference: string;
  readonly executionReference: string;
  readonly identityOutageRate: number;
  readonly identityPendingRate: number;
  readonly incidentCount: number;
  readonly institutionId: string | null;
  readonly migrationDrift: number;
  readonly notificationDeadLetters: number;
  readonly onboardingCompletionRate: number;
  readonly processingLatencyP95Ms: number;
  readonly recoveryDurationMinutes: number;
  readonly rejectionRate: number;
  readonly submissionSuccessRate: number;
  readonly taskCompletionRate: number;
  readonly validationRuleTrends: Readonly<Record<string, number>>;
}

export type PilotCompletionClassification =
  'EXPAND_READY' | 'EXTEND_PILOT' | 'REMEDIATE' | 'TERMINATE' | 'AUTHORITY_REVIEW_REQUIRED';

export interface PilotCompletionInput {
  readonly accepted: number;
  readonly auditOutboxConsistent: boolean;
  readonly capacityCountersValid: boolean;
  readonly casework: number;
  readonly pending: number;
  readonly policyBlockers: number;
  readonly rejected: number;
  readonly source: number;
  readonly terminationRecommended: boolean;
  readonly unresolvedIncidents: number;
  readonly workersDrained: boolean;
}

export interface PilotCompletionReport {
  readonly authorityDecisionRequired: true;
  readonly classification: PilotCompletionClassification;
  readonly completedAt: string;
  readonly executionReference: string;
  readonly executionVersion: number;
  readonly reconciliation: PilotCompletionInput & { readonly drift: number };
  readonly reportReference: string;
}

export interface PilotWorkerJob {
  readonly attemptCount: number;
  readonly availableAt: string;
  readonly batchLimit: number;
  readonly checkpoint: Readonly<Record<string, unknown>>;
  readonly executionReference: string;
  readonly institutionId: string | null;
  readonly jobReference: string;
  readonly maximumAttempts: number;
  readonly state: PilotWorkState;
  readonly type: PilotWorkType;
}

interface StoredCommand {
  readonly hash: string;
  readonly result: PilotExecution;
}

export interface PilotExecutionRepositoryPort {
  append(
    execution: PilotExecution,
    expectedVersion: number,
    eventCode: string,
    actor: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<PilotExecution>;
  appendIncident(
    execution: PilotExecution,
    expectedVersion: number,
    incident: PilotIncident,
    actor: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<PilotExecution>;
  appendCompletion(
    execution: PilotExecution,
    expectedVersion: number,
    report: PilotCompletionReport,
    actor: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<PilotExecution>;
  find(reference: string): Promise<PilotExecution | null>;
  findCompletion(
    reference: string,
    executionVersion: number,
  ): Promise<PilotCompletionReport | null>;
  findCommand(idempotencyKey: string): Promise<StoredCommand | null>;
  latestAssessment(reference: string): Promise<GoNoGoAssessment | null>;
  recordAssessment(assessment: GoNoGoAssessment, actor: string): Promise<void>;
  recordEvidence(evidence: PilotEvidence, actor: string): Promise<void>;
  recordExpansion(
    expansionReference: string,
    prior: PilotExecution,
    next: PilotExecution,
    institutionIds: readonly string[],
    campusIds: readonly string[],
    checker: string,
  ): Promise<void>;
  recordIncidentTimeline(
    incidentReference: string,
    eventCode: string,
    explanation: string,
    evidenceReferences: readonly string[],
    recoveryChecks: readonly GoNoGoCheck[],
    actor: string,
    at: string,
  ): Promise<void>;
  saveParticipation(participation: PilotParticipation, executionVersion: number): Promise<void>;
}

export interface PilotWorkerRepositoryPort {
  claim(now: string, workerReference: string, leaseSeconds: number): Promise<PilotWorkerJob | null>;
  complete(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
    now: string,
  ): Promise<PilotWorkerJob>;
  enqueue(job: PilotWorkerJob): Promise<void>;
  fail(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
    problemCode: string,
    retryAt: string,
    now: string,
  ): Promise<PilotWorkerJob>;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireSynthetic(value: string, code = 'SYNTHETIC_REFERENCE_REQUIRED'): void {
  if (!/^SYNTH-[A-Z0-9-]+$/.test(value)) {
    throw new GatewayProblem(code, 422, 'A SYNTH-prefixed reference is required.');
  }
}

function requireKey(key: string): void {
  if (key.length < 8 || key.length > 128) {
    throw new GatewayProblem(
      'IDEMPOTENCY_KEY_REQUIRED',
      422,
      'A valid idempotency key is required.',
    );
  }
}

function gate(
  code: string,
  value: boolean | null,
  explanation: string,
  blocking = true,
): GoNoGoCheck {
  return {
    blocking,
    code,
    explanation:
      value === true
        ? explanation
        : value === null
          ? `${explanation} Accountable evidence has not been supplied.`
          : `${explanation} The check did not pass.`,
    result: value === true ? 'PASS' : value === null ? 'MANUAL_REVIEW' : 'FAIL',
  };
}

export function assessGoNoGo(
  execution: PilotExecution,
  input: GoNoGoInput,
  assessmentReference: string,
  at: string,
): GoNoGoAssessment {
  requireSynthetic(assessmentReference);
  const checks: readonly GoNoGoCheck[] = [
    gate('CONFIGURATION_READY', input.configurationReady, 'Configuration readiness was checked.'),
    gate(
      'MEMBERSHIP_VALID',
      input.membershipValid,
      'Institution and campus membership was checked.',
    ),
    gate('APPROVAL_DATA_FRESH', input.approvalDataFresh, 'Approval-data freshness was checked.'),
    gate(
      'MIGRATION_RECONCILED',
      input.migrationReconciled,
      'Migration reconciliation was checked.',
    ),
    gate('POLICY_BLOCKERS_RESOLVED', input.policyBlockersResolved, 'Policy blockers were checked.'),
    gate(
      'IDENTITY_PROVIDER_READY',
      input.identityProviderReady,
      'Identity-provider readiness was checked.',
    ),
    gate(
      'AUTHENTICATION_ROLES_READY',
      input.authenticationAndRolesReady,
      'Authentication and roles were checked.',
    ),
    gate('SECURITY_READY', input.securityReady, 'Security readiness was checked.'),
    gate(
      'BACKUP_RECOVERY_READY',
      input.backupAndRecoveryReady,
      'Backup and recovery were checked.',
    ),
    gate('INCIDENT_OWNER_READY', input.incidentOwnershipReady, 'Incident ownership was checked.'),
    gate('SUPPORT_READY', input.supportReady, 'Support readiness was checked.'),
    gate('ACCESSIBILITY_READY', input.accessibilityReady, 'Accessibility readiness was checked.'),
    gate('TRAINING_COMPLETE', input.trainingComplete, 'Training completion was checked.'),
    gate(
      'OBSERVABILITY_ALERTS_READY',
      input.observabilityAndAlertsReady,
      'Observability and alerts were checked.',
    ),
    gate('ROLLBACK_READY', input.rollbackReady, 'Rollback readiness was checked.'),
    gate(
      'SYNTHETIC_EXECUTION_APPROVED',
      input.syntheticExecutionApproved,
      'Synthetic execution approval was checked.',
    ),
    gate(
      'PRODUCTION_AUTHORITY_GRANTED',
      input.productionAuthorityGranted,
      'Production authority was checked.',
      false,
    ),
  ];
  const blockingChecks = checks.filter((item) => item.blocking);
  const startable = blockingChecks.every((item) => item.result === 'PASS');
  const outcome: ReadinessResult = checks.some((item) => item.result === 'FAIL')
    ? 'FAIL'
    : checks.some((item) => item.result === 'MANUAL_REVIEW')
      ? 'MANUAL_REVIEW'
      : 'PASS';
  return {
    assessedAt: at,
    assessmentReference,
    checks,
    executionReference: execution.executionReference,
    executionVersion: execution.version,
    outcome,
    startable,
  };
}

export function canExposePilot(execution: PilotExecution, institutionId: string): boolean {
  return (
    execution.state === 'RUNNING' &&
    !execution.stopControls.global &&
    !execution.stopControls.cohort &&
    !execution.stopControls.institutionIds.includes(institutionId)
  );
}

export class PilotExecutionService {
  public constructor(
    private readonly repository: PilotExecutionRepositoryPort,
    private readonly now: () => string,
    private readonly nextAssessmentReference: () => string,
    private readonly nextReportReference: () => string,
  ) {}

  public async create(
    input: Omit<
      PilotExecution,
      'authorityMode' | 'checkerReference' | 'state' | 'stopControls' | 'version'
    >,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    requireKey(idempotencyKey);
    [
      input.executionReference,
      input.cohortReference,
      input.pilotReference,
      input.makerReference,
    ].forEach((value) => {
      requireSynthetic(value);
    });
    input.operationalOwnerReferences.forEach((value) => {
      requireSynthetic(value);
    });
    if (input.makerReference !== principal.actorReference) {
      throw new GatewayProblem(
        'EXECUTION_MAKER_MISMATCH',
        403,
        'The authenticated actor must be the maker.',
      );
    }
    if (
      input.operationalOwnerReferences.length === 0 ||
      new Set(input.operationalOwnerReferences).size !== input.operationalOwnerReferences.length
    ) {
      throw new GatewayProblem(
        'EXECUTION_OWNERS_INVALID',
        422,
        'Unique synthetic operational owners are required.',
      );
    }
    if (input.scheduledEnd < input.scheduledStart) {
      throw new GatewayProblem('EXECUTION_WINDOW_INVALID', 422, 'The execution window is invalid.');
    }
    const execution: PilotExecution = {
      ...input,
      authorityMode: 'SYNTHETIC_ONLY',
      checkerReference: null,
      state: 'PLANNED',
      stopControls: { cohort: false, global: false, institutionIds: [] },
      version: 1,
    };
    return this.append(execution, 0, 'PILOT_EXECUTION_PLANNED', principal, idempotencyKey, {
      input,
    });
  }

  public async assess(
    reference: string,
    input: GoNoGoInput,
    principal: Principal,
  ): Promise<GoNoGoAssessment> {
    const execution = await this.requireExecution(reference);
    const assessment = assessGoNoGo(execution, input, this.nextAssessmentReference(), this.now());
    await this.repository.recordAssessment(assessment, principal.actorReference);
    return assessment;
  }

  public async submitGoLiveReview(
    reference: string,
    expectedVersion: number,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const replay = await this.replayTransition(
      idempotencyKey,
      'GO_LIVE_REVIEW_REQUESTED',
      expectedVersion,
      'GO_LIVE_REVIEW',
    );
    if (replay !== null) return replay;
    const execution = await this.requireState(reference, expectedVersion, ['PLANNED']);
    const assessment = await this.repository.latestAssessment(reference);
    if (
      assessment === null ||
      !assessment.startable ||
      assessment.executionVersion !== expectedVersion
    ) {
      throw new GatewayProblem(
        'GO_NO_GO_BLOCKED',
        409,
        'A current startable go/no-go package is required.',
      );
    }
    return this.transition(
      execution,
      'GO_LIVE_REVIEW',
      'GO_LIVE_REVIEW_REQUESTED',
      principal,
      idempotencyKey,
    );
  }

  public async approve(
    reference: string,
    expectedVersion: number,
    checker: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const details = { checkerReference: checker.actorReference };
    const replay = await this.replayTransition(
      idempotencyKey,
      'GO_LIVE_APPROVED',
      expectedVersion,
      'APPROVED',
      details,
    );
    if (replay !== null) return replay;
    const execution = await this.requireState(reference, expectedVersion, ['GO_LIVE_REVIEW']);
    if (checker.actorReference === execution.makerReference) {
      throw new GatewayProblem(
        'MAKER_CHECKER_SEPARATION_REQUIRED',
        409,
        'An independent checker is required.',
      );
    }
    return this.transition(
      { ...execution, checkerReference: checker.actorReference },
      'APPROVED',
      'GO_LIVE_APPROVED',
      checker,
      idempotencyKey,
      details,
    );
  }

  public async start(
    reference: string,
    expectedVersion: number,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const replay = await this.replayTransition(
      idempotencyKey,
      'PILOT_EXECUTION_STARTED',
      expectedVersion,
      'RUNNING',
    );
    if (replay !== null) return replay;
    const execution = await this.requireState(reference, expectedVersion, ['APPROVED']);
    const now = this.now();
    if (now < execution.scheduledStart || now > execution.scheduledEnd) {
      throw new GatewayProblem(
        'EXECUTION_WINDOW_INACTIVE',
        409,
        'The scheduled execution window is inactive.',
      );
    }
    if (execution.checkerReference === null || !canStart(execution)) {
      throw new GatewayProblem(
        'EXECUTION_START_BLOCKED',
        409,
        'Approval or a stop control blocks execution start.',
      );
    }
    return this.transition(
      execution,
      'RUNNING',
      'PILOT_EXECUTION_STARTED',
      principal,
      idempotencyKey,
    );
  }

  public async pause(
    reference: string,
    expectedVersion: number,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const replay = await this.replayTransition(
      idempotencyKey,
      'PILOT_EXECUTION_PAUSED',
      expectedVersion,
      'PAUSED',
    );
    if (replay !== null) return replay;
    const execution = await this.requireState(reference, expectedVersion, ['RUNNING']);
    return this.transition(
      { ...execution, stopControls: { ...execution.stopControls, cohort: true } },
      'PAUSED',
      'PILOT_EXECUTION_PAUSED',
      principal,
      idempotencyKey,
    );
  }

  public async declareIncident(
    reference: string,
    expectedVersion: number,
    input: Omit<PilotIncident, 'cohortReference' | 'declaredAt' | 'executionReference'>,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    requireKey(idempotencyKey);
    const requestHash = digest({ expectedVersion, input });
    const previous = await this.repository.findCommand(idempotencyKey);
    if (previous !== null) {
      if (previous.hash !== requestHash)
        throw new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, 'The idempotency key was reused.');
      return previous.result;
    }
    const execution = await this.requireState(reference, expectedVersion, ['RUNNING', 'PAUSED']);
    requireSynthetic(input.incidentReference);
    requireSynthetic(input.ownerReference);
    input.evidenceReferences.forEach((item) => {
      requireSynthetic(item);
    });
    const incident: PilotIncident = {
      ...input,
      cohortReference: execution.cohortReference,
      declaredAt: this.now(),
      executionReference: reference,
    };
    const next = {
      ...execution,
      state: 'INCIDENT' as const,
      stopControls: { ...execution.stopControls, cohort: true },
      version: execution.version + 1,
    };
    return this.repository.appendIncident(
      next,
      execution.version,
      incident,
      principal.actorReference,
      idempotencyKey,
      requestHash,
    );
  }

  public async resume(
    reference: string,
    expectedVersion: number,
    incidentReference: string,
    recovery: GoNoGoInput,
    checker: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const details = { incidentReference, recovery };
    const replay = await this.replayTransition(
      idempotencyKey,
      'PILOT_EXECUTION_RESUMED',
      expectedVersion,
      'RUNNING',
      details,
    );
    if (replay !== null) return replay;
    const execution = await this.requireState(reference, expectedVersion, ['PAUSED', 'INCIDENT']);
    requireSynthetic(incidentReference);
    if (checker.actorReference === execution.makerReference) {
      throw new GatewayProblem(
        'RESUME_CHECKER_NOT_INDEPENDENT',
        409,
        'An independent resume checker is required.',
      );
    }
    const assessment = assessGoNoGo(
      execution,
      recovery,
      this.nextAssessmentReference(),
      this.now(),
    );
    if (!assessment.startable) {
      throw new GatewayProblem(
        'RECOVERY_NOT_READY',
        409,
        'Every blocking recovery check must pass.',
      );
    }
    await this.repository.recordAssessment(assessment, checker.actorReference);
    await this.repository.recordIncidentTimeline(
      incidentReference,
      'RECOVERY_APPROVED',
      'Synthetic recovery checks passed and an independent checker approved resume.',
      [],
      assessment.checks,
      checker.actorReference,
      this.now(),
    );
    return this.transition(
      {
        ...execution,
        checkerReference: checker.actorReference,
        stopControls: { ...execution.stopControls, cohort: false },
      },
      'RUNNING',
      'PILOT_EXECUTION_RESUMED',
      checker,
      idempotencyKey,
      details,
    );
  }

  public async setStopControls(
    reference: string,
    expectedVersion: number,
    controls: PilotStopControls,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const details = { controls };
    const targetState: PilotExecutionState =
      controls.global || controls.cohort
        ? 'PAUSED'
        : (await this.requireExecution(reference)).state;
    const replay = await this.replayTransition(
      idempotencyKey,
      'PILOT_STOP_CONTROLS_CHANGED',
      expectedVersion,
      targetState,
      details,
    );
    if (replay !== null) return replay;
    const execution = await this.requireExecution(reference);
    this.requireVersion(execution, expectedVersion);
    controls.institutionIds.forEach((item) => {
      requireSynthetic(item);
    });
    if (['COMPLETED', 'TERMINATED'].includes(execution.state)) {
      throw new GatewayProblem(
        'EXECUTION_TRANSITION_INVALID',
        409,
        'A terminal execution cannot change stop controls.',
      );
    }
    const mustStop = controls.global || controls.cohort;
    const state = mustStop && execution.state === 'RUNNING' ? 'PAUSED' : execution.state;
    return this.transition(
      { ...execution, stopControls: controls },
      state,
      'PILOT_STOP_CONTROLS_CHANGED',
      principal,
      idempotencyKey,
      details,
    );
  }

  public async addParticipation(
    participation: PilotParticipation,
    principal: Principal,
  ): Promise<void> {
    const execution = await this.requireExecution(participation.executionReference);
    requireSynthetic(participation.institutionId);
    participation.campusIds.forEach((item) => {
      requireSynthetic(item);
    });
    if (
      principal.institutionId !== null &&
      principal.institutionId !== participation.institutionId
    ) {
      throw new GatewayProblem(
        'TENANT_SCOPE_DENIED',
        403,
        'Institution evidence is tenant scoped.',
      );
    }
    await this.repository.saveParticipation(participation, execution.version);
  }

  public async recordEvidence(evidence: PilotEvidence, principal: Principal): Promise<void> {
    requireSynthetic(evidence.evidenceReference);
    await this.requireExecution(evidence.executionReference);
    if (evidence.institutionId !== null) requireSynthetic(evidence.institutionId);
    if (principal.institutionId !== null && principal.institutionId !== evidence.institutionId) {
      throw new GatewayProblem(
        'TENANT_SCOPE_DENIED',
        403,
        'Institution evidence is tenant scoped.',
      );
    }
    const rates = [
      evidence.identityOutageRate,
      evidence.identityPendingRate,
      evidence.onboardingCompletionRate,
      evidence.rejectionRate,
      evidence.submissionSuccessRate,
      evidence.taskCompletionRate,
    ];
    if (rates.some((value) => value < 0 || value > 1)) {
      throw new GatewayProblem(
        'EVIDENCE_RATE_INVALID',
        422,
        'Evidence rates must be between zero and one.',
      );
    }
    await this.repository.recordEvidence(evidence, principal.actorReference);
  }

  public async expand(
    reference: string,
    expectedVersion: number,
    input: {
      readonly campusIds: readonly string[];
      readonly checkerReference: string;
      readonly dryRunPassed: boolean;
      readonly expansionReference: string;
      readonly institutionIds: readonly string[];
      readonly newPilotVersion: number;
      readonly proposalMakerReference: string;
      readonly readinessPassed: boolean;
      readonly reconciliationDrift: number;
    },
    checker: Principal,
  ): Promise<PilotExecution> {
    const execution = await this.requireState(reference, expectedVersion, ['PAUSED']);
    [input.expansionReference, input.checkerReference, input.proposalMakerReference].forEach(
      (item) => {
        requireSynthetic(item);
      },
    );
    [...input.campusIds, ...input.institutionIds].forEach((item) => {
      requireSynthetic(item);
    });
    if (
      input.checkerReference !== checker.actorReference ||
      input.proposalMakerReference === checker.actorReference
    ) {
      throw new GatewayProblem(
        'EXPANSION_CHECKER_NOT_INDEPENDENT',
        409,
        'An independent expansion checker is required.',
      );
    }
    if (!input.dryRunPassed || !input.readinessPassed || input.reconciliationDrift !== 0) {
      throw new GatewayProblem(
        'EXPANSION_GATES_BLOCKED',
        409,
        'Expansion requires readiness, dry run and zero drift.',
      );
    }
    const next: PilotExecution = {
      ...execution,
      checkerReference: null,
      makerReference: input.proposalMakerReference,
      pilotVersion: input.newPilotVersion,
      state: 'PLANNED',
      stopControls: { ...execution.stopControls, cohort: true },
      version: execution.version + 1,
    };
    await this.repository.recordExpansion(
      input.expansionReference,
      execution,
      next,
      input.institutionIds,
      input.campusIds,
      checker.actorReference,
    );
    return next;
  }

  public async complete(
    reference: string,
    expectedVersion: number,
    input: PilotCompletionInput,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<{ readonly execution: PilotExecution; readonly report: PilotCompletionReport }> {
    const replay = await this.replayTransition(
      idempotencyKey,
      'PILOT_EXECUTION_COMPLETED',
      expectedVersion,
      'COMPLETED',
      { input },
    );
    if (replay !== null) {
      const replayReport = await this.repository.findCompletion(reference, replay.version);
      if (replayReport === null) {
        throw new GatewayProblem(
          'COMPLETION_REPORT_MISSING',
          500,
          'The immutable completion report is missing.',
        );
      }
      return { execution: replay, report: replayReport };
    }
    const execution = await this.requireState(reference, expectedVersion, ['RUNNING', 'PAUSED']);
    const counts = [
      input.source,
      input.accepted,
      input.rejected,
      input.pending,
      input.casework,
      input.policyBlockers,
      input.unresolvedIncidents,
    ];
    if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new GatewayProblem(
        'COMPLETION_COUNTS_INVALID',
        422,
        'Completion counts must be non-negative integers.',
      );
    }
    const drift = Math.abs(
      input.source - input.accepted - input.rejected - input.pending - input.casework,
    );
    if (
      !input.workersDrained ||
      !input.capacityCountersValid ||
      !input.auditOutboxConsistent ||
      drift !== 0
    ) {
      throw new GatewayProblem(
        'COMPLETION_BLOCKED',
        409,
        'Drain, reconciliation, capacity and audit checks must pass.',
      );
    }
    const classification: PilotCompletionClassification = input.terminationRecommended
      ? 'TERMINATE'
      : input.unresolvedIncidents > 0
        ? 'REMEDIATE'
        : input.policyBlockers > 0
          ? 'AUTHORITY_REVIEW_REQUIRED'
          : input.pending > 0 || input.casework > 0
            ? 'EXTEND_PILOT'
            : 'EXPAND_READY';
    const next: PilotExecution = {
      ...execution,
      state: 'COMPLETED',
      version: execution.version + 1,
    };
    const report: PilotCompletionReport = {
      authorityDecisionRequired: true,
      classification,
      completedAt: this.now(),
      executionReference: reference,
      executionVersion: next.version,
      reconciliation: { ...input, drift },
      reportReference: this.nextReportReference(),
    };
    const saved = await this.repository.appendCompletion(
      next,
      execution.version,
      report,
      principal.actorReference,
      idempotencyKey,
      digest({
        eventCode: 'PILOT_EXECUTION_COMPLETED',
        request: { input, expectedVersion, state: 'COMPLETED' },
      }),
    );
    return { execution: saved, report };
  }

  public async terminate(
    reference: string,
    expectedVersion: number,
    principal: Principal,
    idempotencyKey: string,
  ): Promise<PilotExecution> {
    const replay = await this.replayTransition(
      idempotencyKey,
      'PILOT_EXECUTION_TERMINATED',
      expectedVersion,
      'TERMINATED',
    );
    if (replay !== null) return replay;
    const execution = await this.requireState(reference, expectedVersion, [
      'RUNNING',
      'PAUSED',
      'INCIDENT',
    ]);
    return this.transition(
      execution,
      'TERMINATED',
      'PILOT_EXECUTION_TERMINATED',
      principal,
      idempotencyKey,
    );
  }

  private async append(
    execution: PilotExecution,
    expectedVersion: number,
    eventCode: string,
    principal: Principal,
    idempotencyKey: string,
    request: unknown,
  ): Promise<PilotExecution> {
    requireKey(idempotencyKey);
    const requestHash = digest({ eventCode, request });
    const previous = await this.repository.findCommand(idempotencyKey);
    if (previous !== null) {
      if (previous.hash !== requestHash)
        throw new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, 'The idempotency key was reused.');
      return previous.result;
    }
    return this.repository.append(
      execution,
      expectedVersion,
      eventCode,
      principal.actorReference,
      idempotencyKey,
      requestHash,
    );
  }

  private transition(
    execution: PilotExecution,
    state: PilotExecutionState,
    eventCode: string,
    principal: Principal,
    idempotencyKey: string,
    requestDetails: Readonly<Record<string, unknown>> = {},
  ): Promise<PilotExecution> {
    const next = { ...execution, state, version: execution.version + 1 };
    return this.append(next, execution.version, eventCode, principal, idempotencyKey, {
      ...requestDetails,
      expectedVersion: execution.version,
      state,
    });
  }

  private async replayTransition(
    idempotencyKey: string,
    eventCode: string,
    expectedVersion: number,
    state: PilotExecutionState,
    requestDetails: Readonly<Record<string, unknown>> = {},
  ): Promise<PilotExecution | null> {
    requireKey(idempotencyKey);
    const prior = await this.repository.findCommand(idempotencyKey);
    if (prior === null) return null;
    const requestHash = digest({
      eventCode,
      request: { ...requestDetails, expectedVersion, state },
    });
    if (prior.hash !== requestHash) {
      throw new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, 'The idempotency key was reused.');
    }
    return prior.result;
  }

  private async requireExecution(reference: string): Promise<PilotExecution> {
    const execution = await this.repository.find(reference);
    if (execution === null)
      throw new GatewayProblem('EXECUTION_NOT_FOUND', 404, 'The pilot execution was not found.');
    return execution;
  }

  private async requireState(
    reference: string,
    version: number,
    states: readonly PilotExecutionState[],
  ): Promise<PilotExecution> {
    const execution = await this.requireExecution(reference);
    this.requireVersion(execution, version);
    if (!states.includes(execution.state)) {
      throw new GatewayProblem(
        'EXECUTION_TRANSITION_INVALID',
        409,
        `The ${execution.state} execution cannot perform this transition.`,
      );
    }
    return execution;
  }

  private requireVersion(execution: PilotExecution, version: number): void {
    if (execution.version !== version)
      throw new GatewayProblem(
        'EXECUTION_VERSION_CONFLICT',
        409,
        'The execution version is stale.',
      );
  }
}

function canStart(execution: PilotExecution): boolean {
  return !execution.stopControls.global && !execution.stopControls.cohort;
}

export class PilotWorkerService {
  public constructor(
    private readonly repository: PilotWorkerRepositoryPort,
    private readonly now: () => string,
  ) {}

  public enqueue(job: PilotWorkerJob): Promise<void> {
    requireSynthetic(job.jobReference);
    requireSynthetic(job.executionReference);
    if (job.institutionId !== null) requireSynthetic(job.institutionId);
    return this.repository.enqueue(job);
  }

  public claim(workerReference: string, leaseSeconds = 30): Promise<PilotWorkerJob | null> {
    requireSynthetic(workerReference);
    if (leaseSeconds < 1 || leaseSeconds > 300)
      throw new GatewayProblem('WORKER_LEASE_INVALID', 422, 'Worker lease is outside safe bounds.');
    return this.repository.claim(this.now(), workerReference, leaseSeconds);
  }

  public complete(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
  ): Promise<PilotWorkerJob> {
    return this.repository.complete(jobReference, workerReference, checkpoint, this.now());
  }

  public fail(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
    problemCode: string,
    retryDelaySeconds: number,
  ): Promise<PilotWorkerJob> {
    const now = this.now();
    const retryAt = new Date(Date.parse(now) + retryDelaySeconds * 1000).toISOString();
    return this.repository.fail(
      jobReference,
      workerReference,
      checkpoint,
      problemCode,
      retryAt,
      now,
    );
  }
}

export class InMemoryPilotExecutionRepository implements PilotExecutionRepositoryPort {
  private readonly commands = new Map<string, StoredCommand>();
  private readonly executions = new Map<string, PilotExecution>();
  private readonly assessments = new Map<string, GoNoGoAssessment>();
  public readonly completions: PilotCompletionReport[] = [];
  public readonly evidence: PilotEvidence[] = [];
  public readonly incidents: PilotIncident[] = [];
  public readonly participation: PilotParticipation[] = [];
  public readonly timeline: string[] = [];

  public find(reference: string): Promise<PilotExecution | null> {
    return Promise.resolve(this.executions.get(reference) ?? null);
  }

  public findCommand(key: string): Promise<StoredCommand | null> {
    return Promise.resolve(this.commands.get(key) ?? null);
  }

  public append(
    execution: PilotExecution,
    expectedVersion: number,
    eventCode: string,
    _actor: string,
    key: string,
    hash: string,
  ): Promise<PilotExecution> {
    const prior = this.commands.get(key);
    if (prior !== undefined) {
      if (prior.hash !== hash)
        return Promise.reject(
          new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, 'The idempotency key was reused.'),
        );
      return Promise.resolve(prior.result);
    }
    const current = this.executions.get(execution.executionReference);
    if ((current?.version ?? 0) !== expectedVersion)
      return Promise.reject(
        new GatewayProblem('EXECUTION_VERSION_CONFLICT', 409, 'The execution version is stale.'),
      );
    this.executions.set(execution.executionReference, execution);
    this.commands.set(key, { hash, result: execution });
    this.timeline.push(eventCode);
    return Promise.resolve(execution);
  }

  public async appendIncident(
    execution: PilotExecution,
    expectedVersion: number,
    incident: PilotIncident,
    actor: string,
    key: string,
    hash: string,
  ): Promise<PilotExecution> {
    const result = await this.append(
      execution,
      expectedVersion,
      'PILOT_INCIDENT_DECLARED',
      actor,
      key,
      hash,
    );
    this.incidents.push(incident);
    return result;
  }

  public async appendCompletion(
    execution: PilotExecution,
    expectedVersion: number,
    report: PilotCompletionReport,
    actor: string,
    key: string,
    hash: string,
  ): Promise<PilotExecution> {
    const result = await this.append(
      execution,
      expectedVersion,
      'PILOT_EXECUTION_COMPLETED',
      actor,
      key,
      hash,
    );
    this.completions.push(report);
    return result;
  }

  public findCompletion(
    reference: string,
    executionVersion: number,
  ): Promise<PilotCompletionReport | null> {
    return Promise.resolve(
      this.completions.find(
        (item) =>
          item.executionReference === reference && item.executionVersion === executionVersion,
      ) ?? null,
    );
  }

  public latestAssessment(reference: string): Promise<GoNoGoAssessment | null> {
    return Promise.resolve(this.assessments.get(reference) ?? null);
  }

  public recordAssessment(assessment: GoNoGoAssessment): Promise<void> {
    this.assessments.set(assessment.executionReference, assessment);
    return Promise.resolve();
  }

  public recordEvidence(evidence: PilotEvidence): Promise<void> {
    this.evidence.push(evidence);
    return Promise.resolve();
  }

  public recordExpansion(
    _reference: string,
    prior: PilotExecution,
    next: PilotExecution,
  ): Promise<void> {
    if (this.executions.get(prior.executionReference)?.version !== prior.version)
      return Promise.reject(
        new GatewayProblem('EXECUTION_VERSION_CONFLICT', 409, 'The execution version is stale.'),
      );
    this.executions.set(next.executionReference, next);
    this.timeline.push('PILOT_COHORT_EXPANDED');
    return Promise.resolve();
  }

  public recordIncidentTimeline(_reference: string, event: string): Promise<void> {
    this.timeline.push(event);
    return Promise.resolve();
  }

  public saveParticipation(participation: PilotParticipation): Promise<void> {
    this.participation.push(participation);
    return Promise.resolve();
  }
}
