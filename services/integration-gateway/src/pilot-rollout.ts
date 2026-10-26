import { createHash } from 'node:crypto';
import type { Principal } from './model.js';
import { GatewayProblem } from './model.js';

export const PILOT_CAPABILITIES = [
  'BATCH_UPLOAD',
  'CASEWORK',
  'PURPOSE_LIMITED_VERIFICATION',
  'NOTIFICATIONS',
] as const;
export type PilotCapability = (typeof PILOT_CAPABILITIES)[number];
export type PilotState = 'DRAFT' | 'READY' | 'ACTIVE' | 'PAUSED' | 'INCIDENT' | 'EXITED';
export type ReadinessResult = 'PASS' | 'FAIL' | 'MANUAL_REVIEW';

export interface PilotConfiguration {
  readonly apiVersion: string;
  readonly campusIds: readonly string[];
  readonly checkerReference: string | null;
  readonly cohortReference: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly enabledCapabilities: readonly PilotCapability[];
  readonly globalKillSwitch: boolean;
  readonly institutionId: string;
  readonly institutionKillSwitch: boolean;
  readonly makerReference: string;
  readonly maximumBatchRows: number;
  readonly maximumDailySubmissions: number;
  readonly pilotReference: string;
  readonly state: PilotState;
  readonly templateVersion: string;
  readonly version: number;
}

export interface PilotReadinessInput {
  readonly approvalDataAvailable: boolean;
  readonly configurationComplete: boolean;
  readonly dependencyReady: boolean;
  readonly policyBlockers: readonly string[];
  readonly reconciliationDrift: number;
  readonly recoveryReady: boolean;
  readonly rolesReady: boolean;
  readonly securityReady: boolean;
  readonly versionsCompatible: boolean;
}

export interface PilotReadinessAssessment {
  readonly assessedAt: string;
  readonly checks: readonly {
    readonly code: string;
    readonly explanation: string;
    readonly result: ReadinessResult;
  }[];
  readonly outcome: ReadinessResult;
  readonly pilotReference: string;
}

export interface PilotReconciliation {
  readonly acceptedRows: number;
  readonly assessedAt: string;
  readonly drift: number;
  readonly outcome: 'PASS' | 'FAIL';
  readonly pilotReference: string;
  readonly rejectedRows: number;
  readonly sourceRows: number;
  readonly unresolvedCorrections: number;
}

export interface LegacyMigrationRow {
  readonly academicIdentityReference: string;
  readonly recordKey: string;
  readonly regulatoryReference: string;
  readonly schemaVersion: string;
  readonly studentReference: string;
}

export interface MigrationReceipt {
  readonly acceptedRows: number;
  readonly correctionCsv: string;
  readonly digestSha256: string;
  readonly drift: number;
  readonly duplicateRows: number;
  readonly idempotencyKey: string;
  readonly migrationReference: string;
  readonly mode: 'DRY_RUN' | 'STAGED';
  readonly pilotReference: string;
  readonly rejectedRows: number;
  readonly replayed: boolean;
  readonly state: 'DRY_RUN_COMPLETED' | 'STAGED' | 'ROLLED_BACK';
  readonly totalRows: number;
}

export interface PilotRepositoryPort {
  find(pilotReference: string): Promise<PilotConfiguration | null>;
  save(configuration: PilotConfiguration, eventCode: string, actor: string): Promise<void>;
  saveReadiness(assessment: PilotReadinessAssessment, actor: string): Promise<void>;
  saveReconciliation(reconciliation: PilotReconciliation, actor: string): Promise<void>;
  findMigration(
    idempotencyKey: string,
  ): Promise<{ readonly hash: string; readonly receipt: MigrationReceipt } | null>;
  saveMigration(receipt: MigrationReceipt, requestHash: string, actor: string): Promise<void>;
  rollbackMigration(migrationReference: string, actor: string): Promise<MigrationReceipt>;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireSynthetic(value: string, code: string): void {
  if (!/^SYNTH-[A-Z0-9-]+$/.test(value)) {
    throw new GatewayProblem(code, 422, 'A synthetic reference is required for local pilot work.');
  }
}

export function evaluatePilotCapability(
  configuration: PilotConfiguration | null,
  capability: PilotCapability,
): boolean {
  return (
    configuration !== null &&
    configuration.state === 'ACTIVE' &&
    !configuration.globalKillSwitch &&
    !configuration.institutionKillSwitch &&
    configuration.enabledCapabilities.includes(capability)
  );
}

export class PilotRolloutService {
  public constructor(
    private readonly repository: PilotRepositoryPort,
    private readonly now: () => string,
    private readonly nextMigrationReference: () => string,
  ) {}

  public async configure(
    input: Omit<PilotConfiguration, 'checkerReference' | 'state' | 'version'>,
    principal: Principal,
  ): Promise<PilotConfiguration> {
    requireSynthetic(input.pilotReference, 'PILOT_REFERENCE_INVALID');
    requireSynthetic(input.cohortReference, 'COHORT_REFERENCE_INVALID');
    requireSynthetic(input.institutionId, 'PILOT_INSTITUTION_INVALID');
    requireSynthetic(input.makerReference, 'PILOT_MAKER_INVALID');
    if (input.makerReference !== principal.actorReference) {
      throw new GatewayProblem(
        'PILOT_MAKER_MISMATCH',
        403,
        'The authenticated actor must be recorded as the configuration maker.',
      );
    }
    input.campusIds.forEach((campus) => {
      requireSynthetic(campus, 'PILOT_CAMPUSES_INVALID');
    });
    if (input.campusIds.length === 0 || new Set(input.campusIds).size !== input.campusIds.length) {
      throw new GatewayProblem('PILOT_CAMPUSES_INVALID', 422, 'Pilot campuses must be unique.');
    }
    if (input.effectiveTo < input.effectiveFrom) {
      throw new GatewayProblem('PILOT_WINDOW_INVALID', 422, 'The pilot window is invalid.');
    }
    if (
      input.maximumBatchRows < 1 ||
      input.maximumBatchRows > 10_000 ||
      input.maximumDailySubmissions < 1 ||
      input.maximumDailySubmissions > 10_000
    ) {
      throw new GatewayProblem(
        'PILOT_LIMITS_INVALID',
        422,
        'Pilot limits are outside safe bounds.',
      );
    }
    const existing = await this.repository.find(input.pilotReference);
    if (existing !== null && existing.state !== 'DRAFT') {
      throw new GatewayProblem(
        'PILOT_CONFIGURATION_LOCKED',
        409,
        'Only draft pilots can be changed.',
      );
    }
    const configured: PilotConfiguration = {
      ...input,
      checkerReference: null,
      state: 'DRAFT',
      version: (existing?.version ?? 0) + 1,
    };
    await this.repository.save(configured, 'PILOT_CONFIGURED', principal.actorReference);
    return configured;
  }

  public async assess(
    pilotReference: string,
    input: PilotReadinessInput,
    principal: Principal,
  ): Promise<PilotReadinessAssessment> {
    const pilot = await this.requirePilot(pilotReference);
    const checks = [
      check(
        'CONFIGURATION_COMPLETE',
        input.configurationComplete,
        'Pilot configuration is complete.',
      ),
      check('APPROVAL_DATA_AVAILABLE', input.approvalDataAvailable, 'Approval data is available.'),
      check('ROLES_READY', input.rolesReady, 'Required pilot roles are ready.'),
      check(
        'VERSIONS_COMPATIBLE',
        input.versionsCompatible,
        'Template and API versions are compatible.',
      ),
      check('DEPENDENCIES_READY', input.dependencyReady, 'Required dependencies are ready.'),
      check('SECURITY_READY', input.securityReady, 'Security controls passed the local gate.'),
      check('RECOVERY_READY', input.recoveryReady, 'Recovery controls passed the local gate.'),
      {
        code: 'RECONCILIATION_DRIFT_ZERO',
        explanation:
          input.reconciliationDrift === 0
            ? 'Migration reconciliation has no drift.'
            : `Migration reconciliation has ${String(input.reconciliationDrift)} unresolved differences.`,
        result: input.reconciliationDrift === 0 ? ('PASS' as const) : ('FAIL' as const),
      },
      {
        code: 'POLICY_BLOCKERS_RESOLVED',
        explanation:
          input.policyBlockers.length === 0
            ? 'No unresolved policy blocker was declared.'
            : 'An accountable policy decision is still required.',
        result: input.policyBlockers.length === 0 ? ('PASS' as const) : ('MANUAL_REVIEW' as const),
      },
    ];
    const outcome: ReadinessResult = checks.some((item) => item.result === 'FAIL')
      ? 'FAIL'
      : checks.some((item) => item.result === 'MANUAL_REVIEW')
        ? 'MANUAL_REVIEW'
        : 'PASS';
    const assessment = { assessedAt: this.now(), checks, outcome, pilotReference };
    await this.repository.saveReadiness(assessment, principal.actorReference);
    if (outcome === 'PASS' && pilot.state === 'DRAFT') {
      await this.repository.save(
        { ...pilot, state: 'READY', version: pilot.version + 1 },
        'PILOT_READY',
        principal.actorReference,
      );
    }
    return assessment;
  }

  public async reconcile(
    pilotReference: string,
    input: Omit<PilotReconciliation, 'assessedAt' | 'drift' | 'outcome' | 'pilotReference'>,
    principal: Principal,
  ): Promise<PilotReconciliation> {
    await this.requirePilot(pilotReference);
    if (
      [input.sourceRows, input.acceptedRows, input.rejectedRows, input.unresolvedCorrections].some(
        (value) => !Number.isInteger(value) || value < 0,
      )
    ) {
      throw new GatewayProblem(
        'RECONCILIATION_COUNTS_INVALID',
        422,
        'Reconciliation counts must be non-negative integers.',
      );
    }
    const drift = Math.abs(input.sourceRows - input.acceptedRows - input.rejectedRows);
    const reconciliation: PilotReconciliation = {
      ...input,
      assessedAt: this.now(),
      drift,
      outcome: drift === 0 && input.unresolvedCorrections === 0 ? 'PASS' : 'FAIL',
      pilotReference,
    };
    await this.repository.saveReconciliation(reconciliation, principal.actorReference);
    return reconciliation;
  }

  public async activate(
    pilotReference: string,
    expectedVersion: number,
    checker: Principal,
  ): Promise<PilotConfiguration> {
    const pilot = await this.requirePilot(pilotReference);
    this.requireVersion(pilot, expectedVersion);
    if (pilot.state !== 'READY') {
      throw new GatewayProblem(
        'PILOT_NOT_READY',
        409,
        'The pilot has not passed every rollout gate.',
      );
    }
    if (pilot.makerReference === checker.actorReference) {
      throw new GatewayProblem(
        'MAKER_CHECKER_SEPARATION_REQUIRED',
        409,
        'An independent checker is required.',
      );
    }
    if (pilot.globalKillSwitch || pilot.institutionKillSwitch) {
      throw new GatewayProblem('PILOT_KILL_SWITCH_ACTIVE', 409, 'A pilot kill switch is active.');
    }
    const today = this.now().slice(0, 10);
    if (today < pilot.effectiveFrom || today > pilot.effectiveTo) {
      throw new GatewayProblem(
        'PILOT_WINDOW_INACTIVE',
        409,
        'The pilot rollout window is not active.',
      );
    }
    return this.transition(pilot, 'ACTIVE', 'PILOT_ACTIVATED', checker, checker.actorReference);
  }

  public async expand(
    pilotReference: string,
    expectedVersion: number,
    campusIds: readonly string[],
    principal: Principal,
  ): Promise<PilotConfiguration> {
    const pilot = await this.requirePilot(pilotReference);
    this.requireVersion(pilot, expectedVersion);
    const expanded = [...new Set([...pilot.campusIds, ...campusIds])];
    if (
      pilot.state !== 'PAUSED' ||
      expanded.length === pilot.campusIds.length ||
      expanded.some((campus) => !/^SYNTH-[A-Z0-9-]+$/.test(campus))
    ) {
      throw new GatewayProblem(
        'PILOT_EXPANSION_INVALID',
        409,
        'Expansion requires a paused pilot and at least one new synthetic campus.',
      );
    }
    const next: PilotConfiguration = {
      ...pilot,
      campusIds: expanded,
      checkerReference: null,
      makerReference: principal.actorReference,
      state: 'DRAFT',
      version: pilot.version + 1,
    };
    await this.repository.save(next, 'PILOT_COHORT_EXPANSION_PROPOSED', principal.actorReference);
    return next;
  }

  public async setKillSwitches(
    pilotReference: string,
    expectedVersion: number,
    switches: {
      readonly globalKillSwitch: boolean;
      readonly institutionKillSwitch: boolean;
    },
    principal: Principal,
  ): Promise<PilotConfiguration> {
    const pilot = await this.requirePilot(pilotReference);
    this.requireVersion(pilot, expectedVersion);
    if (pilot.state === 'EXITED') {
      throw new GatewayProblem('PILOT_TRANSITION_INVALID', 409, 'An exited pilot cannot change.');
    }
    const mustStop = switches.globalKillSwitch || switches.institutionKillSwitch;
    const next: PilotConfiguration = {
      ...pilot,
      ...switches,
      state: mustStop && pilot.state === 'ACTIVE' ? 'INCIDENT' : pilot.state,
      version: pilot.version + 1,
    };
    await this.repository.save(next, 'PILOT_KILL_SWITCH_CHANGED', principal.actorReference);
    return next;
  }

  public async pause(
    pilotReference: string,
    expectedVersion: number,
    principal: Principal,
    incident = false,
  ): Promise<PilotConfiguration> {
    const pilot = await this.requirePilot(pilotReference);
    this.requireVersion(pilot, expectedVersion);
    if (pilot.state !== 'ACTIVE') {
      throw new GatewayProblem(
        'PILOT_TRANSITION_INVALID',
        409,
        'Only an active pilot can be paused.',
      );
    }
    return this.transition(
      pilot,
      incident ? 'INCIDENT' : 'PAUSED',
      incident ? 'PILOT_INCIDENT_DECLARED' : 'PILOT_PAUSED',
      principal,
    );
  }

  public async resume(
    pilotReference: string,
    expectedVersion: number,
    principal: Principal,
  ): Promise<PilotConfiguration> {
    const pilot = await this.requirePilot(pilotReference);
    this.requireVersion(pilot, expectedVersion);
    if (!['PAUSED', 'INCIDENT'].includes(pilot.state)) {
      throw new GatewayProblem('PILOT_TRANSITION_INVALID', 409, 'Only a paused pilot can resume.');
    }
    if (pilot.globalKillSwitch || pilot.institutionKillSwitch) {
      throw new GatewayProblem('PILOT_KILL_SWITCH_ACTIVE', 409, 'A pilot kill switch is active.');
    }
    return this.transition(pilot, 'ACTIVE', 'PILOT_RESUMED', principal);
  }

  public async exit(
    pilotReference: string,
    expectedVersion: number,
    reconciliationDrift: number,
    principal: Principal,
  ): Promise<PilotConfiguration> {
    const pilot = await this.requirePilot(pilotReference);
    this.requireVersion(pilot, expectedVersion);
    if (!['ACTIVE', 'PAUSED'].includes(pilot.state) || reconciliationDrift !== 0) {
      throw new GatewayProblem(
        'PILOT_EXIT_BLOCKED',
        409,
        'Pilot exit requires an active or paused pilot with zero reconciliation drift.',
      );
    }
    return this.transition(pilot, 'EXITED', 'PILOT_EXITED', principal);
  }

  public async migrate(
    pilotReference: string,
    idempotencyKey: string,
    mode: 'DRY_RUN' | 'STAGED',
    rows: readonly LegacyMigrationRow[],
    principal: Principal,
  ): Promise<MigrationReceipt> {
    const pilot = await this.requirePilot(pilotReference);
    if (pilot.state === 'ACTIVE' || pilot.state === 'EXITED') {
      throw new GatewayProblem(
        'MIGRATION_WINDOW_CLOSED',
        409,
        'Migration is closed after activation.',
      );
    }
    if (rows.length === 0 || rows.length > pilot.maximumBatchRows) {
      throw new GatewayProblem(
        'MIGRATION_SIZE_INVALID',
        422,
        'Migration rows must be within the configured pilot limit.',
      );
    }
    const requestHash = hash({ mode, pilotReference, rows });
    const prior = await this.repository.findMigration(idempotencyKey);
    if (prior !== null) {
      if (prior.hash !== requestHash) {
        throw new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, 'The migration key was reused.');
      }
      return { ...prior.receipt, replayed: true };
    }
    const seen = new Set<string>();
    const findings: { readonly code: string; readonly recordKey: string }[] = [];
    for (const row of rows) {
      requireSynthetic(row.recordKey, 'MIGRATION_RECORD_KEY_INVALID');
      if (row.schemaVersion !== '1.0')
        findings.push({ code: 'SCHEMA_VERSION_UNSUPPORTED', recordKey: row.recordKey });
      if (seen.has(row.recordKey))
        findings.push({ code: 'DUPLICATE_RECORD_KEY', recordKey: row.recordKey });
      seen.add(row.recordKey);
      if (
        [row.studentReference, row.academicIdentityReference, row.regulatoryReference].some(
          (value) => value.trim() !== value || !value.startsWith('SYNTH-'),
        )
      ) {
        findings.push({ code: 'VALUE_REQUIRES_EXPLICIT_CORRECTION', recordKey: row.recordKey });
      }
    }
    const rejected = new Set(findings.map((item) => item.recordKey));
    const receipt: MigrationReceipt = {
      acceptedRows: rows.length - rejected.size,
      correctionCsv: [
        'record_key,code',
        ...findings.map((item) => `${item.recordKey},${item.code}`),
      ].join('\r\n'),
      digestSha256: requestHash,
      drift: rejected.size,
      duplicateRows: findings.filter((item) => item.code === 'DUPLICATE_RECORD_KEY').length,
      idempotencyKey,
      migrationReference: this.nextMigrationReference(),
      mode,
      pilotReference,
      rejectedRows: rejected.size,
      replayed: false,
      state: mode === 'DRY_RUN' ? 'DRY_RUN_COMPLETED' : 'STAGED',
      totalRows: rows.length,
    };
    await this.repository.saveMigration(receipt, requestHash, principal.actorReference);
    return receipt;
  }

  public rollbackMigration(
    migrationReference: string,
    principal: Principal,
  ): Promise<MigrationReceipt> {
    return this.repository.rollbackMigration(migrationReference, principal.actorReference);
  }

  private async requirePilot(reference: string): Promise<PilotConfiguration> {
    const pilot = await this.repository.find(reference);
    if (pilot === null)
      throw new GatewayProblem('PILOT_NOT_FOUND', 404, 'The pilot was not found.');
    return pilot;
  }

  private requireVersion(pilot: PilotConfiguration, expected: number): void {
    if (pilot.version !== expected) {
      throw new GatewayProblem('PILOT_VERSION_CONFLICT', 409, 'The pilot version is stale.');
    }
  }

  private async transition(
    pilot: PilotConfiguration,
    state: PilotState,
    event: string,
    principal: Principal,
    checkerReference: string | null = pilot.checkerReference,
  ): Promise<PilotConfiguration> {
    const next = { ...pilot, checkerReference, state, version: pilot.version + 1 };
    await this.repository.save(next, event, principal.actorReference);
    return next;
  }
}

function check(
  code: string,
  passed: boolean,
  explanation: string,
): PilotReadinessAssessment['checks'][number] {
  return {
    code,
    explanation: passed ? explanation : explanation.replace(' is ', ' is not '),
    result: passed ? 'PASS' : 'FAIL',
  };
}

export class InMemoryPilotRepository implements PilotRepositoryPort {
  private readonly pilots = new Map<string, PilotConfiguration>();
  private readonly migrations = new Map<string, { hash: string; receipt: MigrationReceipt }>();
  private readonly migrationByReference = new Map<string, string>();
  public readonly history: {
    readonly actor: string;
    readonly event: string;
    readonly version: number;
  }[] = [];
  public readonly assessments: PilotReadinessAssessment[] = [];
  public readonly reconciliations: PilotReconciliation[] = [];

  public find(reference: string): Promise<PilotConfiguration | null> {
    return Promise.resolve(this.pilots.get(reference) ?? null);
  }

  public save(configuration: PilotConfiguration, eventCode: string, actor: string): Promise<void> {
    this.pilots.set(configuration.pilotReference, configuration);
    this.history.push({ actor, event: eventCode, version: configuration.version });
    return Promise.resolve();
  }

  public saveReadiness(assessment: PilotReadinessAssessment): Promise<void> {
    this.assessments.push(assessment);
    return Promise.resolve();
  }

  public saveReconciliation(reconciliation: PilotReconciliation): Promise<void> {
    this.reconciliations.push(reconciliation);
    return Promise.resolve();
  }

  public findMigration(
    key: string,
  ): Promise<{ readonly hash: string; readonly receipt: MigrationReceipt } | null> {
    return Promise.resolve(this.migrations.get(key) ?? null);
  }

  public saveMigration(receipt: MigrationReceipt, requestHash: string): Promise<void> {
    this.migrations.set(receipt.idempotencyKey, { hash: requestHash, receipt });
    this.migrationByReference.set(receipt.migrationReference, receipt.idempotencyKey);
    return Promise.resolve();
  }

  public rollbackMigration(reference: string): Promise<MigrationReceipt> {
    return Promise.resolve().then(() => {
      const key = this.migrationByReference.get(reference);
      const stored = key === undefined ? undefined : this.migrations.get(key);
      if (stored === undefined)
        throw new GatewayProblem('MIGRATION_NOT_FOUND', 404, 'Migration not found.');
      if (stored.receipt.state !== 'STAGED') {
        throw new GatewayProblem(
          'MIGRATION_ROLLBACK_INVALID',
          409,
          'Only a staged migration can roll back.',
        );
      }
      const receipt: MigrationReceipt = { ...stored.receipt, state: 'ROLLED_BACK' };
      this.migrations.set(stored.receipt.idempotencyKey, { ...stored, receipt });
      return receipt;
    });
  }
}
