import {
  PostgresAdmissionClientUnitOfWork,
  SubmitAdmissionService,
  type ReferenceGenerator,
} from '@apaar-platform/admission-application';
import type { Pool, PoolClient } from 'pg';
import { CaseworkConflictError } from '../errors.js';
import type {
  ActorContext,
  CaseActionCommand,
  CaseListQuery,
  CasePage,
  CaseRecord,
  CaseImplementationResult,
  CaseState,
  CreateAppealCommand,
  CreateCaseCommand,
  ImplementCancellationCommand,
  ImplementTransferCommand,
  TransferAdmissionReferences,
  TransitionCaseCommand,
} from '../model.js';
import type { CaseRepositoryPort } from '../ports.js';
import { actionStateFinding, correctionImpact, transitionFinding } from '../policy.js';

interface CaseRow {
  readonly admission_id: string;
  readonly case_reference: string;
  readonly case_type: CaseRecord['caseType'];
  readonly id: string;
  readonly institution_id: string;
  readonly maker_reference: string;
  readonly policy_version: string;
  readonly priority: CaseRecord['priority'];
  readonly state: CaseRecord['state'];
  readonly version: number;
}

interface ReplayRow {
  readonly request_hash: string;
  readonly result: unknown;
}

interface AdmissionRow {
  readonly academic_year_code: string;
  readonly campus_id: string;
  readonly course_id: string;
  readonly id: string;
  readonly institution_id: string;
  readonly programme_id: string;
  readonly student_key: string;
}

interface AdmissionVersionRow {
  readonly decision_id: string | null;
  readonly id: string;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly version: number;
}

interface ReservationRow {
  readonly capacity_allocation_id: string | null;
  readonly id: string;
  readonly institution_capacity_allocation_id: string | null;
  readonly units: number;
}

interface TargetApprovalLock {
  readonly approvalId: string;
  readonly institutionAllocationId: string | null;
}

interface DatabaseError {
  readonly code?: string;
}

function record(row: CaseRow): CaseRecord {
  return {
    admissionId: row.admission_id,
    caseId: row.id,
    caseReference: row.case_reference,
    caseType: row.case_type,
    institutionId: row.institution_id,
    makerReference: row.maker_reference,
    policyVersion: row.policy_version,
    priority: row.priority,
    state: row.state,
    version: row.version,
  };
}

function commandId(institutionId: string, idempotencyKey: string): string {
  return `CASE-COMMAND-${institutionId}-${idempotencyKey}`;
}

function databaseCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as DatabaseError).code : undefined;
}

function nextState(command: CaseActionCommand, current: CaseState): CaseState {
  switch (command.action) {
    case 'SUBMIT':
      return 'SUBMITTED';
    case 'START_REVIEW':
      return 'UNDER_REVIEW';
    case 'REQUEST_MORE_INFORMATION':
      return 'MORE_INFORMATION_REQUIRED';
    case 'RECOMMEND':
      return command.recommendation === 'MORE_INFORMATION_REQUIRED'
        ? 'MORE_INFORMATION_REQUIRED'
        : 'RECOMMENDED';
    case 'DECIDE':
      return command.outcome;
    case 'DECIDE_APPEAL':
      return command.appealOutcome === 'DISMISSED' ? 'REJECTED' : 'APPROVED';
    case 'WITHDRAW':
      return 'WITHDRAWN';
    default:
      return current;
  }
}

class FixedTransferReferences implements ReferenceGenerator {
  public constructor(private readonly references: TransferAdmissionReferences) {}

  public next(kind: Parameters<ReferenceGenerator['next']>[0]): string {
    switch (kind) {
      case 'ADMISSION':
        return this.references.admissionId;
      case 'DECISION':
        return this.references.decisionId;
      case 'IDENTITY':
        return this.references.identityVerificationId;
      case 'AUDIT':
        return this.references.auditEventId;
      case 'OUTBOX':
        return this.references.outboxEventId;
      case 'REGISTRATION':
        return this.references.registrationReference;
    }
  }
}

export class PostgresCaseworkRepository implements CaseRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public create(command: CreateCaseCommand, requestHash: string): Promise<CaseRecord> {
    return this.inTransaction(async (client) => {
      const replay = await this.findReplay(
        client,
        command.institutionId,
        command.idempotencyKey,
        requestHash,
      );
      if (replay !== null) return replay;
      if (command.caseType === 'APPEAL') {
        throw new CaseworkConflictError('Appeals require an explicit governed appeal target.');
      }
      const admission = await client.query(
        'SELECT id FROM admissions WHERE id=$1 AND institution_id=$2 FOR SHARE',
        [command.admissionId, command.institutionId],
      );
      if (admission.rowCount !== 1) {
        throw new CaseworkConflictError('Admission is not in scope.');
      }
      const inserted = await client.query<CaseRow>(
        `INSERT INTO admission_cases (
          id,case_reference,case_type,institution_id,admission_id,policy_version,
          policy_authority,priority,state,maker_reference
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9) RETURNING *`,
        [
          command.caseId,
          command.caseReference,
          command.caseType,
          command.institutionId,
          command.admissionId,
          command.policyVersion,
          command.policyAuthority,
          command.priority,
          command.actor.actorReference,
        ],
      );
      const created = inserted.rows[0];
      if (created === undefined) throw new CaseworkConflictError('Case was not created.');
      const result = record(created);
      await this.history(client, command.caseId, null, 'DRAFT', command.actor, 'CASE_CREATED');
      await this.finishCommand(
        client,
        command.institutionId,
        command.idempotencyKey,
        requestHash,
        command.caseId,
        'CREATE_CASE',
        result,
      );
      await this.audit(
        client,
        command.caseId,
        command.actor,
        command.idempotencyKey,
        'CASE_CREATED',
        'DRAFT',
      );
      return result;
    });
  }

  public createAppeal(command: CreateAppealCommand, requestHash: string): Promise<CaseRecord> {
    return this.inTransaction(async (client) => {
      const replay = await this.findReplay(
        client,
        command.institutionId,
        command.idempotencyKey,
        requestHash,
      );
      if (replay !== null) return replay;
      const target =
        command.appealedCaseId !== null
          ? await client.query<{ admission_id: string; institution_id: string }>(
              'SELECT admission_id,institution_id FROM admission_cases WHERE id=$1 FOR SHARE',
              [command.appealedCaseId],
            )
          : await client.query<{ admission_id: string; institution_id: string }>(
              `SELECT d.admission_id,a.institution_id FROM admission_decisions d
               JOIN admissions a ON a.id=d.admission_id WHERE d.id=$1 FOR SHARE OF a`,
              [command.appealedDecisionId],
            );
      const targetRow = target.rows[0];
      if (targetRow?.institution_id !== command.institutionId) {
        throw new CaseworkConflictError('Appeal target was not found in the institution scope.');
      }
      const inserted = await client.query<CaseRow>(
        `INSERT INTO admission_cases (
          id,case_reference,case_type,institution_id,admission_id,policy_version,
          policy_authority,priority,state,maker_reference
        ) VALUES ($1,$2,'APPEAL',$3,$4,$5,$6,$7,'DRAFT',$8) RETURNING *`,
        [
          command.appealCaseId,
          command.caseReference,
          command.institutionId,
          targetRow.admission_id,
          command.policyVersion,
          command.policyAuthority,
          command.priority,
          command.actor.actorReference,
        ],
      );
      await client.query(
        `INSERT INTO case_appeals (
          id,case_id,appealed_case_id,appealed_decision_id,appellant_reference,appellant_role
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          command.appealId,
          command.appealCaseId,
          command.appealedCaseId,
          command.appealedDecisionId,
          command.actor.actorReference,
          command.actor.role,
        ],
      );
      const created = inserted.rows[0];
      if (created === undefined) throw new CaseworkConflictError('Appeal was not created.');
      const result = record(created);
      await this.history(
        client,
        command.appealCaseId,
        null,
        'DRAFT',
        command.actor,
        'APPEAL_CREATED',
      );
      await this.finishCommand(
        client,
        command.institutionId,
        command.idempotencyKey,
        requestHash,
        command.appealCaseId,
        'CREATE_APPEAL',
        result,
      );
      await this.audit(
        client,
        command.appealCaseId,
        command.actor,
        command.idempotencyKey,
        'APPEAL_CREATED',
        'DRAFT',
      );
      return result;
    });
  }

  public act(command: CaseActionCommand, requestHash: string): Promise<CaseRecord> {
    return this.inTransaction(async (client) => {
      const currentResult = await client.query<CaseRow>(
        `SELECT * FROM admission_cases WHERE id=$1
         AND ($2::text IS NULL OR institution_id=$2) FOR UPDATE`,
        [command.caseId, command.actor.institutionId],
      );
      const current = currentResult.rows[0];
      if (current === undefined) throw new CaseworkConflictError('Case was not found.');
      const replay = await this.findReplay(
        client,
        current.institution_id,
        command.idempotencyKey,
        requestHash,
      );
      if (replay !== null) return replay;
      if (current.version !== command.expectedVersion) {
        throw new CaseworkConflictError('The case version is stale.', 'CASE_VERSION_CONFLICT');
      }
      if (
        (command.action === 'DECIDE_APPEAL' && current.case_type !== 'APPEAL') ||
        (command.action === 'DECIDE' && current.case_type === 'APPEAL')
      ) {
        throw new CaseworkConflictError('The decision action does not match the case type.');
      }
      if (
        command.action === 'ADD_CORRECTION_PROPOSAL' &&
        !['ADMISSION_CORRECTION', 'CATEGORY_CORRECTION', 'IDENTITY_LINK_CORRECTION'].includes(
          current.case_type,
        )
      ) {
        throw new CaseworkConflictError('Correction proposals require a correction case type.');
      }
      const invalidActionState = actionStateFinding(command.action, current.state);
      if (invalidActionState !== null) {
        throw new CaseworkConflictError(invalidActionState.explanation);
      }
      const state = nextState(command, current.state);
      if (state !== current.state) {
        const invalid = transitionFinding(current.state, state);
        if (invalid !== null) throw new CaseworkConflictError(invalid.explanation);
      }
      await this.applyAction(client, command, current);
      const updated = await client.query<CaseRow>(
        `UPDATE admission_cases SET state=$1,priority=$2,version=version+1,
           updated_at=transaction_timestamp()
         WHERE id=$3 AND version=$4 RETURNING *`,
        [
          state,
          command.action === 'SAVE_DRAFT' ? command.priority : current.priority,
          command.caseId,
          command.expectedVersion,
        ],
      );
      const changed = updated.rows[0];
      if (changed === undefined) {
        throw new CaseworkConflictError('The case version is stale.', 'CASE_VERSION_CONFLICT');
      }
      const result = record(changed);
      await this.history(
        client,
        command.caseId,
        current.state,
        state,
        command.actor,
        command.action,
      );
      await this.finishCommand(
        client,
        current.institution_id,
        command.idempotencyKey,
        requestHash,
        command.caseId,
        command.action,
        result,
      );
      await this.audit(
        client,
        command.caseId,
        command.actor,
        command.idempotencyKey,
        `CASE_${command.action}`,
        state,
      );
      return result;
    });
  }

  public implementCancellation(
    command: ImplementCancellationCommand,
    requestHash: string,
  ): Promise<CaseImplementationResult> {
    return this.inTransaction(async (client) => {
      const current = await this.lockCase(client, command.caseId, command.actor.institutionId);
      const replay = await this.findReplay<CaseImplementationResult>(
        client,
        current.institution_id,
        command.idempotencyKey,
        requestHash,
      );
      if (replay !== null) return replay;
      this.assertImplementationCase(current, command.expectedVersion, ['ADMISSION_CANCELLATION']);
      await this.requirePolicyCapability(client, current.policy_version, 'cancellation');
      const source = await this.lockAdmission(client, current.admission_id);
      const sourceVersion = await this.lockCurrentAdmissionVersion(client, source.id);
      const reservations = await this.lockReservations(client, source.id);
      await this.lockCapacityAllocations(client, reservations, null);
      const releasedReservationIds = await this.releaseReservations(
        client,
        command.caseId,
        reservations,
      );
      await this.replaceSourceVersion(
        client,
        sourceVersion,
        command.sourceAdmissionVersionId,
        command.caseId,
        'CANCELLED',
        {
          ...sourceVersion.snapshot,
          cancelledByCaseId: command.caseId,
          lifecycleStatus: 'CANCELLED',
        },
      );
      const result: CaseImplementationResult = {
        caseId: command.caseId,
        implementationId: command.implementationId,
        implementationType: 'CANCELLATION',
        receiptReference: command.receiptReference,
        releasedReservationIds,
        sourceAdmissionId: source.id,
        sourceAdmissionVersionId: command.sourceAdmissionVersionId,
        state: 'IMPLEMENTED',
        targetAdmissionId: null,
        targetDecisionId: null,
      };
      await this.completeImplementation(client, current, command, result, requestHash);
      return result;
    });
  }

  public implementTransfer(
    command: ImplementTransferCommand,
    requestHash: string,
  ): Promise<CaseImplementationResult> {
    return this.inTransaction(async (client) => {
      const current = await this.lockCase(client, command.caseId, command.actor.institutionId);
      const replay = await this.findReplay<CaseImplementationResult>(
        client,
        current.institution_id,
        command.idempotencyKey,
        requestHash,
      );
      if (replay !== null) return replay;
      this.assertImplementationCase(current, command.expectedVersion, [
        'INSTITUTION_TRANSFER',
        'PROGRAMME_OR_COURSE_TRANSFER',
      ]);
      const source = await this.lockAdmission(client, current.admission_id);
      const target = command.targetSubmission.admission;
      const crossInstitution = source.institution_id !== target.institutionId;
      if (
        (crossInstitution && current.case_type !== 'INSTITUTION_TRANSFER') ||
        (!crossInstitution && current.case_type !== 'PROGRAMME_OR_COURSE_TRANSFER')
      ) {
        throw new CaseworkConflictError(
          'The transfer route does not match the governed case type.',
        );
      }
      await this.requirePolicyCapability(
        client,
        current.policy_version,
        crossInstitution ? 'crossInstitutionTransfer' : 'sameInstitutionTransfer',
      );
      if (
        source.student_key !== target.studentKey ||
        source.academic_year_code !== target.academicYear
      ) {
        throw new CaseworkConflictError(
          'Transfer must retain the student and academic year of the source admission.',
        );
      }
      if (
        source.institution_id === target.institutionId &&
        source.campus_id === target.campusId &&
        source.programme_id === target.programmeId &&
        source.course_id === target.courseId
      ) {
        throw new CaseworkConflictError('A transfer target must differ from the source route.');
      }
      const sourceVersion = await this.lockCurrentAdmissionVersion(client, source.id);
      const reservations = await this.lockReservations(client, source.id);
      const targetApproval = await this.findTargetApprovalForLock(client, command);
      await this.lockCapacityAllocations(client, reservations, targetApproval);

      const targetResult = await new SubmitAdmissionService(
        {
          clock: {
            now: (): typeof target.identityVerification.checkedAt =>
              target.identityVerification.checkedAt,
          },
          unitOfWork: new PostgresAdmissionClientUnitOfWork(client),
        },
        new FixedTransferReferences(command.targetReferences),
      ).execute(command.targetSubmission);
      if (targetResult.decision.outcome !== 'ACCEPT') {
        throw new CaseworkConflictError(
          'Target admission was not accepted; source capacity is unchanged.',
        );
      }

      const releasedReservationIds = await this.releaseReservations(
        client,
        command.caseId,
        reservations,
      );
      await this.replaceSourceVersion(
        client,
        sourceVersion,
        command.sourceAdmissionVersionId,
        command.caseId,
        'TRANSFERRED',
        {
          ...sourceVersion.snapshot,
          lifecycleStatus: 'TRANSFERRED',
          targetAdmissionId: targetResult.admissionId,
          transferredByCaseId: command.caseId,
        },
      );
      await client.query(
        `INSERT INTO admission_transfers(
          id,case_id,source_admission_id,target_admission_id,target_institution_id,
          target_campus_id,target_programme_id,target_course_id,target_academic_year_code,
          target_decision_id,implemented_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,transaction_timestamp())`,
        [
          command.transferId,
          command.caseId,
          source.id,
          targetResult.admissionId,
          target.institutionId,
          target.campusId,
          target.programmeId,
          target.courseId,
          target.academicYear,
          targetResult.decisionId,
        ],
      );
      const result: CaseImplementationResult = {
        caseId: command.caseId,
        implementationId: command.implementationId,
        implementationType: 'TRANSFER',
        receiptReference: command.receiptReference,
        releasedReservationIds,
        sourceAdmissionId: source.id,
        sourceAdmissionVersionId: command.sourceAdmissionVersionId,
        state: 'IMPLEMENTED',
        targetAdmissionId: targetResult.admissionId,
        targetDecisionId: targetResult.decisionId,
      };
      await this.completeImplementation(client, current, command, result, requestHash);
      return result;
    });
  }

  public transition(command: TransitionCaseCommand, requestHash: string): Promise<CaseRecord> {
    return this.inTransaction(async (client) => {
      const currentResult = await client.query<CaseRow>(
        `SELECT * FROM admission_cases WHERE id=$1
         AND ($2::text IS NULL OR institution_id=$2) FOR UPDATE`,
        [command.caseId, command.actor.institutionId],
      );
      const current = currentResult.rows[0];
      if (current === undefined) throw new CaseworkConflictError('Case was not found.');
      const replay = await this.findReplay(
        client,
        current.institution_id,
        command.idempotencyKey,
        requestHash,
      );
      if (replay !== null) return replay;
      if (current.version !== command.expectedVersion) {
        throw new CaseworkConflictError('The case version is stale.', 'CASE_VERSION_CONFLICT');
      }
      const invalid = transitionFinding(current.state, command.nextState);
      if (invalid !== null) throw new CaseworkConflictError(invalid.explanation);
      const updated = await client.query<CaseRow>(
        `UPDATE admission_cases SET state=$1,version=version+1,updated_at=transaction_timestamp()
         WHERE id=$2 AND version=$3 RETURNING *`,
        [command.nextState, command.caseId, command.expectedVersion],
      );
      const changed = updated.rows[0];
      if (changed === undefined) {
        throw new CaseworkConflictError('The case version is stale.', 'CASE_VERSION_CONFLICT');
      }
      const result = record(changed);
      await this.history(
        client,
        command.caseId,
        current.state,
        command.nextState,
        command.actor,
        'CASE_STATE_CHANGED',
      );
      await this.finishCommand(
        client,
        current.institution_id,
        command.idempotencyKey,
        requestHash,
        command.caseId,
        'TRANSITION',
        result,
      );
      await this.audit(
        client,
        command.caseId,
        command.actor,
        command.idempotencyKey,
        'CASE_STATE_CHANGED',
        command.nextState,
      );
      return result;
    });
  }

  public async get(caseId: string, institutionId: string | null): Promise<CaseRecord | null> {
    const result = await this.pool.query<CaseRow>(
      'SELECT * FROM admission_cases WHERE id=$1 AND ($2::text IS NULL OR institution_id=$2)',
      [caseId, institutionId],
    );
    return result.rows[0] === undefined ? null : record(result.rows[0]);
  }

  public async list(query: CaseListQuery): Promise<CasePage> {
    const result = await this.pool.query<CaseRow>(
      `SELECT * FROM admission_cases
       WHERE ($1::text IS NULL OR institution_id=$1)
         AND ($2::text IS NULL OR state=$2)
         AND ($3::text IS NULL OR case_type=$3)
         AND ($4::text IS NULL OR id>$4)
       ORDER BY id ASC LIMIT $5`,
      [query.institutionId, query.state, query.caseType, query.afterCaseId, query.limit + 1],
    );
    const hasMore = result.rows.length > query.limit;
    const visible = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    return {
      items: visible.map(record),
      nextCursor: hasMore ? (visible.at(-1)?.id ?? null) : null,
    };
  }

  private async lockCase(
    client: PoolClient,
    caseId: string,
    institutionId: string | null,
  ): Promise<CaseRow> {
    const result = await client.query<CaseRow>(
      `SELECT * FROM admission_cases WHERE id=$1
       AND ($2::text IS NULL OR institution_id=$2) FOR UPDATE`,
      [caseId, institutionId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new CaseworkConflictError('Case was not found.');
    return row;
  }

  private assertImplementationCase(
    current: CaseRow,
    expectedVersion: number,
    allowedTypes: readonly CaseRecord['caseType'][],
  ): void {
    if (current.version !== expectedVersion) {
      throw new CaseworkConflictError('The case version is stale.', 'CASE_VERSION_CONFLICT');
    }
    if (current.state !== 'APPROVED') {
      throw new CaseworkConflictError('Only an approved case may be implemented.');
    }
    if (!allowedTypes.includes(current.case_type)) {
      throw new CaseworkConflictError('The implementation command does not match the case type.');
    }
  }

  private async requirePolicyCapability(
    client: PoolClient,
    policyVersion: string,
    capability: 'cancellation' | 'sameInstitutionTransfer' | 'crossInstitutionTransfer',
  ): Promise<void> {
    const result = await client.query<{ configuration: Readonly<Record<string, unknown>> }>(
      `SELECT configuration FROM casework_policy_versions
       WHERE policy_version=$1 AND activation_status='ACTIVE'`,
      [policyVersion],
    );
    if (result.rows[0]?.configuration[capability] !== true) {
      throw new CaseworkConflictError(
        `No active authority configuration permits ${capability}.`,
        'POLICY_AUTHORITY_REQUIRED',
      );
    }
  }

  private async lockAdmission(client: PoolClient, admissionId: string): Promise<AdmissionRow> {
    const result = await client.query<AdmissionRow>(
      'SELECT * FROM admissions WHERE id=$1 FOR UPDATE',
      [admissionId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new CaseworkConflictError('Source admission was not found.');
    return row;
  }

  private async lockCurrentAdmissionVersion(
    client: PoolClient,
    admissionId: string,
  ): Promise<AdmissionVersionRow> {
    const result = await client.query<AdmissionVersionRow>(
      `SELECT id,version,decision_id,snapshot FROM admission_versions
       WHERE admission_id=$1 AND is_current=true FOR UPDATE`,
      [admissionId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new CaseworkConflictError('Source admission has no current governed version.');
    }
    return row;
  }

  private async lockReservations(
    client: PoolClient,
    admissionId: string,
  ): Promise<readonly ReservationRow[]> {
    const result = await client.query<ReservationRow & { readonly released: boolean }>(
      `SELECT r.*,EXISTS(
         SELECT 1 FROM capacity_releases release WHERE release.reservation_id=r.id
       ) AS released
       FROM capacity_reservations r WHERE r.admission_id=$1 ORDER BY r.id FOR UPDATE OF r`,
      [admissionId],
    );
    if (result.rows.length === 0) {
      throw new CaseworkConflictError('Accepted source admission has no capacity reservation.');
    }
    if (result.rows.some((row) => row.released)) {
      throw new CaseworkConflictError('Source capacity has already been released.');
    }
    return result.rows;
  }

  private async findTargetApprovalForLock(
    client: PoolClient,
    command: ImplementTransferCommand,
  ): Promise<TargetApprovalLock | null> {
    const target = command.targetSubmission.admission;
    const result = await client.query<{
      academic_year_code: string;
      id: string;
      institution_id: string;
      policy_version: string;
    }>(
      `SELECT a.id,a.institution_id,a.academic_year_code,a.policy_version
       FROM approval_snapshots a
       WHERE a.institution_id=$1 AND a.campus_id=$2 AND a.programme_id=$3
         AND a.course_id=$4 AND a.academic_year_code=$5
         AND a.effective_from <= $6::date
         AND (a.effective_to IS NULL OR a.effective_to >= $6::date)
         AND NOT EXISTS (
           SELECT 1 FROM approval_supersessions s
           JOIN approval_snapshots replacement ON replacement.id=s.replacement_snapshot_id
           WHERE s.previous_snapshot_id=a.id
             AND replacement.effective_from <= $6::date
             AND (replacement.effective_to IS NULL OR replacement.effective_to >= $6::date)
         )
       ORDER BY a.effective_from DESC,a.received_at DESC,a.id DESC LIMIT 1`,
      [
        target.institutionId,
        target.campusId,
        target.programmeId,
        target.courseId,
        target.academicYear,
        target.admissionDate,
      ],
    );
    const approval = result.rows[0];
    if (approval === undefined) return null;
    const institution = await client.query<{ id: string }>(
      `SELECT id FROM institution_capacity_allocations
       WHERE institution_id=$1 AND academic_year_code=$2 AND policy_version=$3
         AND allocation_code='PM_USPY_INSTITUTION'`,
      [approval.institution_id, approval.academic_year_code, approval.policy_version],
    );
    return {
      approvalId: approval.id,
      institutionAllocationId: institution.rows[0]?.id ?? null,
    };
  }

  private async lockCapacityAllocations(
    client: PoolClient,
    sourceReservations: readonly ReservationRow[],
    target: TargetApprovalLock | null,
  ): Promise<void> {
    const capacityIds = sourceReservations.flatMap((reservation) =>
      reservation.capacity_allocation_id === null ? [] : [reservation.capacity_allocation_id],
    );
    if (target !== null) {
      const targetRows = await client.query<{ id: string }>(
        'SELECT id FROM capacity_allocations WHERE approval_snapshot_id=$1',
        [target.approvalId],
      );
      capacityIds.push(...targetRows.rows.map((row) => row.id));
    }
    const uniqueCapacityIds = [...new Set(capacityIds)].sort();
    if (uniqueCapacityIds.length > 0) {
      await client.query(
        'SELECT id FROM capacity_allocations WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',
        [uniqueCapacityIds],
      );
    }
    const institutionIds = sourceReservations.flatMap((reservation) =>
      reservation.institution_capacity_allocation_id === null
        ? []
        : [reservation.institution_capacity_allocation_id],
    );
    if (target?.institutionAllocationId !== null && target?.institutionAllocationId !== undefined) {
      institutionIds.push(target.institutionAllocationId);
    }
    const uniqueInstitutionIds = [...new Set(institutionIds)].sort();
    if (uniqueInstitutionIds.length > 0) {
      await client.query(
        `SELECT id FROM institution_capacity_allocations
         WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,
        [uniqueInstitutionIds],
      );
    }
  }

  private async releaseReservations(
    client: PoolClient,
    caseId: string,
    reservations: readonly ReservationRow[],
  ): Promise<readonly string[]> {
    const released: string[] = [];
    for (const reservation of reservations) {
      const update =
        reservation.capacity_allocation_id !== null
          ? await client.query(
              `UPDATE capacity_allocations SET used_quantity=used_quantity-$1
               WHERE id=$2 AND used_quantity >= $1`,
              [reservation.units, reservation.capacity_allocation_id],
            )
          : await client.query(
              `UPDATE institution_capacity_allocations SET used_quantity=used_quantity-$1
               WHERE id=$2 AND used_quantity >= $1`,
              [reservation.units, reservation.institution_capacity_allocation_id],
            );
      if (update.rowCount !== 1) {
        throw new CaseworkConflictError('Capacity counter cannot be released safely.');
      }
      await client.query(
        `INSERT INTO capacity_releases(id,case_id,reservation_id,units)
         VALUES ($1,$2,$3,$4)`,
        [`${caseId}-RELEASE-${reservation.id}`, caseId, reservation.id, reservation.units],
      );
      released.push(reservation.id);
    }
    return released;
  }

  private async replaceSourceVersion(
    client: PoolClient,
    current: AdmissionVersionRow,
    successorId: string,
    caseId: string,
    lifecycleStatus: 'CANCELLED' | 'TRANSFERRED',
    snapshot: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await client.query('UPDATE admission_versions SET is_current=false WHERE id=$1', [current.id]);
    await client.query(
      `INSERT INTO admission_versions(
        id,admission_id,version,predecessor_id,case_id,decision_id,lifecycle_status,
        snapshot,is_current
      ) SELECT $1,admission_id,$2,$3,$4,$5,$6,$7,true
        FROM admission_versions WHERE id=$3`,
      [
        successorId,
        current.version + 1,
        current.id,
        caseId,
        current.decision_id,
        lifecycleStatus,
        snapshot,
      ],
    );
  }

  private async completeImplementation(
    client: PoolClient,
    current: CaseRow,
    command: ImplementCancellationCommand | ImplementTransferCommand,
    result: CaseImplementationResult,
    requestHash: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO case_implementations(
        id,case_id,implementation_type,receipt_reference,implemented_by,result
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        command.implementationId,
        command.caseId,
        result.implementationType,
        command.receiptReference,
        command.actor.actorReference,
        result,
      ],
    );
    const updated = await client.query(
      `UPDATE admission_cases SET state='IMPLEMENTED',version=version+1,
         updated_at=transaction_timestamp()
       WHERE id=$1 AND version=$2`,
      [command.caseId, command.expectedVersion],
    );
    if (updated.rowCount !== 1) {
      throw new CaseworkConflictError('The case version is stale.', 'CASE_VERSION_CONFLICT');
    }
    await this.history(
      client,
      command.caseId,
      current.state,
      'IMPLEMENTED',
      command.actor,
      `IMPLEMENT_${result.implementationType}`,
    );
    await client.query(
      `INSERT INTO casework_commands(
        id,institution_id,idempotency_key,request_hash,command_type,case_id,result_version,result
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        commandId(current.institution_id, command.idempotencyKey),
        current.institution_id,
        command.idempotencyKey,
        requestHash,
        `IMPLEMENT_${result.implementationType}`,
        command.caseId,
        command.expectedVersion + 1,
        result,
      ],
    );
    await this.audit(
      client,
      command.caseId,
      command.actor,
      command.idempotencyKey,
      `CASE_${result.implementationType}_IMPLEMENTED`,
      'IMPLEMENTED',
    );
  }

  private async applyAction(
    client: PoolClient,
    command: CaseActionCommand,
    current: CaseRow,
  ): Promise<void> {
    switch (command.action) {
      case 'ASSIGN_REVIEWER':
        await client.query(
          `UPDATE case_assignments SET ended_at=transaction_timestamp()
           WHERE case_id=$1 AND ended_at IS NULL`,
          [command.caseId],
        );
        await client.query(
          `INSERT INTO case_assignments(id,case_id,reviewer_reference,assigned_by)
           VALUES ($1,$2,$3,$4)`,
          [
            command.assignmentId,
            command.caseId,
            command.reviewerReference,
            command.actor.actorReference,
          ],
        );
        return;
      case 'DECLARE_CONFLICT':
        await client.query(
          `INSERT INTO case_conflict_declarations(id,case_id,actor_reference,has_conflict)
           VALUES ($1,$2,$3,$4)`,
          [
            command.declarationId,
            command.caseId,
            command.actor.actorReference,
            command.hasConflict,
          ],
        );
        return;
      case 'REQUEST_MORE_INFORMATION':
        await client.query(
          `INSERT INTO case_information_requests(id,case_id,requested_by,request_text)
           VALUES ($1,$2,$3,$4)`,
          [
            command.informationRequestId,
            command.caseId,
            command.actor.actorReference,
            command.requestText,
          ],
        );
        return;
      case 'SUPPLY_INFORMATION':
        if (
          (
            await client.query(
              `INSERT INTO case_information_responses(
            id,information_request_id,case_id,supplied_by,response_text
          ) SELECT $1,r.id,r.case_id,$2,$3 FROM case_information_requests r
            WHERE r.id=$4 AND r.case_id=$5`,
              [
                command.responseId,
                command.actor.actorReference,
                command.responseText,
                command.informationRequestId,
                command.caseId,
              ],
            )
          ).rowCount !== 1
        ) {
          throw new CaseworkConflictError('The information request was not found for this case.');
        }
        return;
      case 'RECOMMEND':
        await client.query(
          `INSERT INTO case_recommendations(
            id,case_id,reviewer_reference,recommendation,reason_code,explanation,policy_version
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            command.recommendationId,
            command.caseId,
            command.actor.actorReference,
            command.recommendation,
            command.reasonCode,
            command.explanation,
            command.policyVersion,
          ],
        );
        return;
      case 'DECIDE':
      case 'DECIDE_APPEAL':
        await client.query(
          `INSERT INTO case_decisions(
            id,case_id,checker_reference,maker_reference,outcome,reason_code,
            explanation,policy_version
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            command.decisionId,
            command.caseId,
            command.actor.actorReference,
            current.maker_reference,
            command.action === 'DECIDE'
              ? command.outcome
              : command.appealOutcome === 'DISMISSED'
                ? 'REJECTED'
                : 'APPROVED',
            command.reasonCode,
            command.explanation,
            command.policyVersion,
          ],
        );
        if (command.action === 'DECIDE_APPEAL') {
          if (
            (
              await client.query(
                'UPDATE case_appeals SET outcome=$1 WHERE case_id=$2 AND outcome IS NULL',
                [command.appealOutcome, command.caseId],
              )
            ).rowCount !== 1
          ) {
            throw new CaseworkConflictError('The pending appeal metadata was not found.');
          }
        }
        return;
      case 'ADD_CORRECTION_PROPOSAL': {
        const impacts = command.changes.map((change) => correctionImpact(change.fieldCode));
        await client.query(
          `INSERT INTO correction_proposals(
            id,case_id,requires_policy_reevaluation,capacity_may_change,
            identity_reverification_required
          ) VALUES ($1,$2,$3,$4,$5)`,
          [
            command.proposalId,
            command.caseId,
            impacts.some((impact) => impact?.policyReevaluationRequired === true),
            impacts.some((impact) => impact?.capacityMayChange === true),
            impacts.some((impact) => impact?.identityReverificationRequired === true),
          ],
        );
        for (const change of command.changes) {
          await client.query(
            `INSERT INTO correction_field_changes(
              proposal_id,field_code,previous_value,proposed_value
            ) VALUES ($1,$2,$3,$4)`,
            [
              command.proposalId,
              change.fieldCode,
              JSON.stringify(change.previousValue),
              JSON.stringify(change.proposedValue),
            ],
          );
        }
        return;
      }
      case 'ADD_EVIDENCE':
        await client.query(
          `INSERT INTO case_evidence_metadata(
            id,case_id,object_reference,safe_filename,media_type,sha256,malware_status,added_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            command.evidence.evidenceId,
            command.caseId,
            command.evidence.objectReference,
            command.evidence.safeFilename,
            command.evidence.mediaType,
            command.evidence.sha256,
            command.evidence.malwareStatus,
            command.actor.actorReference,
          ],
        );
        return;
      case 'RECORD_PURPOSE':
        await client.query(
          `INSERT INTO case_purpose_records(
            id,case_id,purpose,legal_basis_category,consent_reference,consent_status,
            data_categories,recipient_category,retention_policy_reference,actor_reference
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            command.purposeRecord.purposeRecordId,
            command.caseId,
            command.actor.purpose,
            command.purposeRecord.legalBasisCategory,
            command.purposeRecord.consentReference,
            command.purposeRecord.consentStatus,
            JSON.stringify(command.purposeRecord.dataCategories),
            command.purposeRecord.recipientCategory,
            command.purposeRecord.retentionPolicyReference,
            command.actor.actorReference,
          ],
        );
        return;
      default:
        return;
    }
  }

  private async findReplay<T = CaseRecord>(
    client: PoolClient,
    institutionId: string,
    key: string,
    requestHash: string,
  ): Promise<T | null> {
    const result = await client.query<ReplayRow>(
      `SELECT request_hash,result FROM casework_commands
       WHERE institution_id=$1 AND idempotency_key=$2 FOR UPDATE`,
      [institutionId, key],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    if (row.request_hash !== requestHash) {
      throw new CaseworkConflictError(
        'The idempotency key was used for different content.',
        'IDEMPOTENCY_CONFLICT',
      );
    }
    return row.result as T;
  }

  private async finishCommand(
    client: PoolClient,
    institutionId: string,
    key: string,
    requestHash: string,
    caseId: string,
    commandType: string,
    result: CaseRecord,
  ): Promise<void> {
    await client.query(
      `INSERT INTO casework_commands (
        id,institution_id,idempotency_key,request_hash,command_type,case_id,result_version,result
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        commandId(institutionId, key),
        institutionId,
        key,
        requestHash,
        commandType,
        caseId,
        result.version,
        result,
      ],
    );
  }

  private async history(
    client: PoolClient,
    caseId: string,
    previousState: CaseState | null,
    next: CaseState,
    actor: ActorContext,
    action: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO case_state_history (
        case_id,previous_state,next_state,actor_reference,actor_role,reason,purpose,
        request_reference,correlation_reference
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        caseId,
        previousState,
        next,
        actor.actorReference,
        actor.role,
        `${action}: ${actor.reason}`,
        actor.purpose,
        actor.requestReference,
        actor.correlationReference,
      ],
    );
  }

  private async audit(
    client: PoolClient,
    caseId: string,
    actor: ActorContext,
    eventReference: string,
    eventType: string,
    state: string,
  ): Promise<void> {
    const suffix = `${caseId}-${eventReference}`;
    await client.query(
      `INSERT INTO business_audit_events (
        id,event_type,aggregate_type,aggregate_reference,actor_reference,reason,
        correlation_reference,request_reference,details,created_at
      ) VALUES ($1,$2,'ADMISSION_CASE',$3,$4,$5,$6,$7,$8,transaction_timestamp())`,
      [
        `AUDIT-${suffix}`,
        eventType,
        caseId,
        actor.actorReference,
        actor.reason,
        actor.correlationReference,
        actor.requestReference,
        { state },
      ],
    );
    await client.query(
      `INSERT INTO outbox_events (
        id,event_type,aggregate_type,aggregate_reference,payload,created_at
      ) VALUES ($1,$2,'ADMISSION_CASE',$3,$4,transaction_timestamp())`,
      [`OUTBOX-${suffix}`, eventType, caseId, { caseId, state }],
    );
  }

  private async inTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = databaseCode(error);
        if ((code === '40001' || code === '40P01' || code === '23505') && attempt < 3) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new CaseworkConflictError('The transaction could not be completed.');
  }
}
