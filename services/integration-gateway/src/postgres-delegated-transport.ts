import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  DeterministicAuthorizationSimulator,
  ExecuteCaseActionService,
  GetCaseService,
  ImplementCancellationService,
  ImplementTransferService,
  CaseworkConflictError,
  CaseworkError,
  ListCasesService,
  PostgresCaseworkRepository,
  CreateAppealService,
  CreateCaseService,
  type ActorContext,
  type ActorRole,
  type CaseAction,
  type CaseActionCommand,
  type CaseListQuery,
  type CreateAppealCommand,
  type CreateCaseCommand,
  type ImplementCancellationCommand,
  type ImplementTransferCommand,
} from '@apaar-platform/admission-casework';
import type { BatchQueryService, CreateBatchService } from '@apaar-platform/batch-ingestion';
import {
  BatchIdempotencyConflictError,
  BatchValidationError,
  type BatchRowResult,
} from '@apaar-platform/batch-ingestion';
import type { Pool } from 'pg';
import type { ExistingServiceTransportPort, GatewayTransportResponse, Principal } from './model.js';
import { GatewayProblem } from './model.js';
import type { PilotExecutionService } from './pilot-execution.js';
import type { PostgresPilotExecutionRepository } from './pilot-execution-postgres.js';
import type { PilotRolloutService } from './pilot-rollout.js';
import type { PostgresPilotRepository } from './pilot-postgres.js';
import type { PostgresBatchJobRepository } from './reference-persistence.js';

type JsonObject = Readonly<Record<string, unknown>>;

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${label} must be an object.`);
  }
  return value as JsonObject;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${label} is required.`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${label} must be an integer.`);
  }
  return value as number;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${label} must be a boolean.`);
  }
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, `${label} must be a string array.`);
  }
  return value as readonly string[];
}

function path(input: JsonObject): JsonObject {
  return object(input['path'], 'path');
}

function query(input: JsonObject): JsonObject {
  return object(input['query'], 'query');
}

function idempotency(input: JsonObject): string {
  return text(input['idempotencyKey'], 'idempotencyKey');
}

function actorRole(principal: Principal): ActorRole {
  const role = principal.roles[0];
  if (role === 'INSTITUTION_ADMINISTRATOR') return 'INSTITUTION_APPROVER';
  if (role === 'SERVICE_INTEGRATION_CLIENT') return 'SYSTEM_OPERATOR';
  if (role === 'AUTHORIZED_VERIFIER') return 'AUDITOR';
  return role ?? 'AUDITOR';
}

function actor(principal: Principal, input: JsonObject): ActorContext {
  const stableReference =
    typeof input['idempotencyKey'] === 'string'
      ? input['idempotencyKey']
      : randomUUID().toUpperCase();
  return {
    actorReference: principal.actorReference,
    correlationReference:
      typeof input['correlationReference'] === 'string'
        ? input['correlationReference']
        : `SYNTH-CORRELATION-${stableReference}`,
    institutionId: principal.institutionId,
    purpose:
      typeof input['purpose'] === 'string' ? input['purpose'] : 'SYNTHETIC_REFERENCE_JOURNEY',
    reason:
      typeof input['reason'] === 'string' ? input['reason'] : 'Synthetic reference deployment',
    requestReference:
      typeof input['requestReference'] === 'string'
        ? input['requestReference']
        : `SYNTH-REQUEST-${stableReference}`,
    role: actorRole(principal),
  };
}

function response(body: unknown, status = 200): GatewayTransportResponse {
  return { body, status };
}

export interface PostgresTransportDependencies {
  readonly batchCreate: CreateBatchService;
  readonly batchJobs: PostgresBatchJobRepository;
  readonly batchQuery: BatchQueryService;
  readonly executionRepository: PostgresPilotExecutionRepository;
  readonly executionService: PilotExecutionService;
  readonly pilotRepository: PostgresPilotRepository;
  readonly pilotService: PilotRolloutService;
  readonly pool: Pool;
}

export class PostgresDelegatedTransport implements ExistingServiceTransportPort {
  private readonly caseRepository: PostgresCaseworkRepository;
  private readonly caseCreate: CreateCaseService;
  private readonly caseAction: ExecuteCaseActionService;
  private readonly caseGet: GetCaseService;
  private readonly caseList: ListCasesService;
  private readonly appealCreate: CreateAppealService;
  private readonly cancellation: ImplementCancellationService;
  private readonly transfer: ImplementTransferService;

  public constructor(private readonly dependencies: PostgresTransportDependencies) {
    const authorization = new DeterministicAuthorizationSimulator();
    this.caseRepository = new PostgresCaseworkRepository(dependencies.pool);
    this.caseCreate = new CreateCaseService(authorization, this.caseRepository);
    this.caseAction = new ExecuteCaseActionService(authorization, this.caseRepository);
    this.caseGet = new GetCaseService(this.caseRepository);
    this.caseList = new ListCasesService(this.caseRepository);
    this.appealCreate = new CreateAppealService(authorization, this.caseRepository);
    this.cancellation = new ImplementCancellationService(authorization, this.caseRepository);
    this.transfer = new ImplementTransferService(authorization, this.caseRepository);
  }

  public async execute(
    operation: string,
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    try {
      if (operation === 'listAdmissionBatchTemplates') {
        return response({ items: [{ templateVersion: '1.0', mediaType: 'text/csv' }] });
      }
      if (operation === 'downloadAdmissionBatchTemplate') {
        return {
          body: this.dependencies.batchQuery.templateCsv(),
          contentType: 'text/csv',
          headers: {
            'content-disposition': 'attachment; filename="student-admission-template-v1.0.csv"',
          },
          status: 200,
        };
      }
      if (operation === 'createAdmissionBatch') return await this.createBatch(input, principal);
      if (operation === 'getAdmissionBatch') return await this.batchSummary(input, principal);
      if (operation === 'listAdmissionBatchRows') return await this.batchRows(input, principal);
      if (operation === 'getAdmissionBatchRow') return await this.batchRow(input, principal);
      if (operation === 'retryAdmissionBatchRow') return await this.retryBatchRow(input, principal);
      if (operation === 'downloadAdmissionBatchCorrections')
        return await this.correctionCsv(input, principal);
      if (operation === 'getAdmission') return await this.getAdmission(input, principal);

      if (operation === 'listAdmissionCases') return await this.listCases(input, principal);
      if (operation === 'createAdmissionCase') return await this.createCase(input, principal);
      if (operation === 'getAdmissionCase') return await this.getCase(input, principal);
      if (operation === 'createAdmissionCaseAppeal')
        return await this.createAppeal(input, principal);
      if (operation === 'implementAdmissionCancellation') {
        return response(
          await this.cancellation.execute({
            ...(input as unknown as ImplementCancellationCommand),
            actor: actor(principal, input),
            caseId: text(path(input)['caseId'], 'caseId'),
            idempotencyKey: idempotency(input),
          }),
        );
      }
      if (operation === 'implementAdmissionTransfer') {
        return response(
          await this.transfer.execute({
            ...(input as unknown as ImplementTransferCommand),
            actor: actor(principal, input),
            caseId: text(path(input)['caseId'], 'caseId'),
            idempotencyKey: idempotency(input),
          }),
        );
      }
      if (operation === 'implementAdmissionAppealRemedy') {
        throw new GatewayProblem(
          'AUTHORITY_CONFIGURATION_REQUIRED',
          409,
          'Appeal-remedy implementation requires an authority-configured remedy policy.',
        );
      }
      const action = this.caseActionFor(operation);
      if (action !== null) return await this.executeCaseAction(action, input, principal);
      if (operation === 'listAdmissionCaseHistory' || operation === 'listAdmissionCaseAudit') {
        return await this.caseHistory(input, principal, operation === 'listAdmissionCaseAudit');
      }
      if (operation === 'listCaseworkCaseTypes') {
        return response({
          items: ['ADMISSION_CORRECTION', 'ADMISSION_CANCELLATION', 'DUPLICATE_ENROLMENT_REVIEW'],
        });
      }
      if (operation === 'listCaseworkReasonCodes') {
        return response({ items: ['SYNTH-CORRECTION', 'SYNTH-CANCELLATION', 'SYNTH-DUPLICATE'] });
      }
      if (operation === 'listCaseworkPolicies') {
        return response({ items: [{ authority: 'PROPOSED', policyVersion: 'SYNTH-POLICY-1' }] });
      }

      if (
        [
          'activatePilot',
          'assessPilotReadiness',
          'createPilotConfiguration',
          'createPilotMigration',
          'exitPilot',
          'expandPilotCohort',
          'getInstitutionPilotReadiness',
          'getPilotConfiguration',
          'pausePilot',
          'reconcilePilot',
          'resumePilot',
          'rollbackPilotMigration',
          'setPilotKillSwitches',
        ].includes(operation)
      ) {
        return await this.pilot(operation, input, principal);
      }
      if (
        operation.includes('PilotExecution') ||
        operation.includes('PilotWorker') ||
        operation.includes('PilotEvidence') ||
        operation === 'recordPilotParticipation' ||
        operation === 'expandPilotExecutionCohort'
      ) {
        return await this.execution(operation, input, principal);
      }

      throw new GatewayProblem(
        'OPERATION_NOT_CONNECTED',
        503,
        `Operation ${operation} has no persistent reference-deployment adapter.`,
      );
    } catch (error) {
      if (error instanceof GatewayProblem) throw error;
      if (error instanceof CaseworkError) {
        const status =
          error.finding.code === 'ACTION_FORBIDDEN' || error.finding.code === 'TENANT_SCOPE_DENIED'
            ? 403
            : 409;
        throw new GatewayProblem(error.finding.code, status, error.message);
      }
      if (error instanceof CaseworkConflictError) {
        throw new GatewayProblem(error.code, 409, error.message);
      }
      if (error instanceof BatchIdempotencyConflictError) {
        throw new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, error.message);
      }
      if (error instanceof BatchValidationError) {
        throw new GatewayProblem(
          error.findings[0]?.code ?? 'REQUEST_VALIDATION_FAILED',
          422,
          error.message,
        );
      }
      throw error;
    }
  }

  private async createBatch(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const institutionId = text(path(input)['institutionId'], 'institutionId');
    if (principal.institutionId !== null && principal.institutionId !== institutionId) {
      throw new GatewayProblem(
        'TENANT_SCOPE_DENIED',
        403,
        'The batch is outside the actor tenant.',
      );
    }
    const file = input['file'];
    if (!Buffer.isBuffer(file)) {
      throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, 'file must contain CSV bytes.');
    }
    const receipt = await this.dependencies.batchCreate.execute({
      actorReference: principal.actorReference,
      content: Readable.from([file]),
      contentType: 'text/csv',
      idempotencyKey: idempotency(input),
      institutionId,
      originalFilename:
        typeof input['originalFilename'] === 'string'
          ? input['originalFilename']
          : 'synthetic-upload.csv',
      reason: text(input['reason'], 'reason'),
      requestReference: text(input['requestReference'], 'requestReference'),
      templateVersion: text(input['templateVersion'], 'templateVersion'),
    });
    await this.dependencies.batchJobs.enqueue(receipt.batchId);
    return response(receipt, 202);
  }

  private async requireBatchTenant(batchId: string, principal: Principal): Promise<void> {
    const result = await this.dependencies.pool.query<{ institution_id: string }>(
      'SELECT institution_id FROM admission_batches WHERE id=$1',
      [batchId],
    );
    const institution = result.rows[0]?.institution_id;
    if (institution === undefined)
      throw new GatewayProblem('BATCH_NOT_FOUND', 404, 'Batch not found.');
    if (principal.institutionId !== null && principal.institutionId !== institution) {
      throw new GatewayProblem(
        'TENANT_SCOPE_DENIED',
        403,
        'The batch is outside the actor tenant.',
      );
    }
  }

  private async batchSummary(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const batchId = text(path(input)['batchId'], 'batchId');
    await this.requireBatchTenant(batchId, principal);
    const summary = await this.dependencies.batchQuery.getSummary(batchId);
    if (summary === null) throw new GatewayProblem('BATCH_NOT_FOUND', 404, 'Batch not found.');
    return response(summary);
  }

  private async batchRows(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const batchId = text(path(input)['batchId'], 'batchId');
    await this.requireBatchTenant(batchId, principal);
    return response({ items: await this.dependencies.batchQuery.listRows(batchId) });
  }

  private async batchRow(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const batchId = text(path(input)['batchId'], 'batchId');
    await this.requireBatchTenant(batchId, principal);
    const recordKey = text(path(input)['recordKey'], 'recordKey');
    const row = (await this.dependencies.batchQuery.listRows(batchId)).find(
      (candidate: BatchRowResult) => candidate.recordKey === recordKey,
    );
    if (row === undefined)
      throw new GatewayProblem('BATCH_ROW_NOT_FOUND', 404, 'Batch row not found.');
    return response(row);
  }

  private async retryBatchRow(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const batchId = text(path(input)['batchId'], 'batchId');
    await this.requireBatchTenant(batchId, principal);
    const recordKey = text(path(input)['recordKey'], 'recordKey');
    const result = await this.dependencies.pool.query(
      `UPDATE batch_rows SET status='VALID',leased_by=NULL,leased_until=NULL
       WHERE batch_id=$1 AND record_key=$2 AND status='FAILED_RETRYABLE'`,
      [batchId, recordKey],
    );
    if (result.rowCount !== 1) {
      throw new GatewayProblem('BATCH_ROW_NOT_RETRYABLE', 409, 'The row is not retryable.');
    }
    await this.dependencies.batchJobs.enqueue(batchId);
    return response({ batchId, recordKey, state: 'QUEUED' }, 202);
  }

  private async correctionCsv(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const batchId = text(path(input)['batchId'], 'batchId');
    await this.requireBatchTenant(batchId, principal);
    return {
      body: await this.dependencies.batchQuery.correctionCsv(batchId),
      contentType: 'text/csv',
      status: 200,
    };
  }

  private async getAdmission(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const reference = text(path(input)['admissionReference'], 'admissionReference');
    const result = await this.dependencies.pool.query(
      `SELECT id,registration_reference,institution_id,campus_id,programme_id,course_id,
              academic_year_code,category,lifecycle_status,ruleset_version,created_at
       FROM admissions WHERE registration_reference=$1 OR id=$1 ORDER BY created_at DESC LIMIT 1`,
      [reference],
    );
    const row = result.rows[0] as Readonly<Record<string, unknown>> | undefined;
    if (row === undefined)
      throw new GatewayProblem('ADMISSION_NOT_FOUND', 404, 'Admission not found.');
    if (principal.institutionId !== null && principal.institutionId !== row['institution_id']) {
      throw new GatewayProblem(
        'TENANT_SCOPE_DENIED',
        403,
        'Admission is outside the actor tenant.',
      );
    }
    return response(row);
  }

  private async listCases(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const values = query(input);
    const institutionId = text(path(input)['institutionId'], 'institutionId');
    return response(
      await this.caseList.execute(actor(principal, input), {
        afterCaseId: typeof values['after'] === 'string' ? values['after'] : null,
        caseType:
          typeof values['caseType'] === 'string'
            ? (values['caseType'] as CaseListQuery['caseType'])
            : null,
        institutionId,
        limit: values['limit'] === undefined ? 50 : Number(values['limit']),
        state:
          typeof values['state'] === 'string' ? (values['state'] as CaseListQuery['state']) : null,
      }),
    );
  }

  private async createCase(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const command = {
      ...(input as unknown as CreateCaseCommand),
      actor: actor(principal, input),
      idempotencyKey: idempotency(input),
      institutionId: text(path(input)['institutionId'], 'institutionId'),
    };
    return response(await this.caseCreate.execute(command), 201);
  }

  private async getCase(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    return response(
      await this.caseGet.execute(actor(principal, input), text(path(input)['caseId'], 'caseId')),
    );
  }

  private async createAppeal(
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const command = {
      ...(input as unknown as CreateAppealCommand),
      actor: actor(principal, input),
      idempotencyKey: idempotency(input),
      institutionId: text(path(input)['institutionId'], 'institutionId'),
    };
    return response(await this.appealCreate.execute(command), 201);
  }

  private caseActionFor(operation: string): CaseAction | null {
    return (
      (
        {
          addAdmissionCaseCorrectionProposal: 'ADD_CORRECTION_PROPOSAL',
          addAdmissionCaseEvidence: 'ADD_EVIDENCE',
          assignAdmissionCaseReviewer: 'ASSIGN_REVIEWER',
          decideAdmissionCase: 'DECIDE',
          decideAdmissionCaseAppeal: 'DECIDE_APPEAL',
          declareAdmissionCaseConflict: 'DECLARE_CONFLICT',
          recordAdmissionCasePurpose: 'RECORD_PURPOSE',
          recommendAdmissionCaseOutcome: 'RECOMMEND',
          requestAdmissionCaseInformation: 'REQUEST_MORE_INFORMATION',
          saveAdmissionCaseDraft: 'SAVE_DRAFT',
          startAdmissionCaseReview: 'START_REVIEW',
          submitAdmissionCase: 'SUBMIT',
          supplyAdmissionCaseInformation: 'SUPPLY_INFORMATION',
          withdrawAdmissionCase: 'WITHDRAW',
        } as Readonly<Record<string, CaseAction | undefined>>
      )[operation] ?? null
    );
  }

  private async executeCaseAction(
    action: CaseAction,
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const command = {
      ...input,
      action,
      actor: actor(principal, input),
      caseId: text(path(input)['caseId'], 'caseId'),
      idempotencyKey: idempotency(input),
    } as unknown as CaseActionCommand;
    return response(await this.caseAction.execute(command));
  }

  private async caseHistory(
    input: JsonObject,
    principal: Principal,
    auditOnly: boolean,
  ): Promise<GatewayTransportResponse> {
    const caseId = text(path(input)['caseId'], 'caseId');
    await this.caseGet.execute(actor(principal, input), caseId);
    const result = await this.dependencies.pool.query(
      auditOnly
        ? `SELECT event_type,actor_reference,reason,details,created_at FROM business_audit_events
           WHERE aggregate_reference=$1 ORDER BY created_at,id`
        : `SELECT state,version,event_type,actor_reference,created_at FROM admission_case_state_history
           WHERE case_id=$1 ORDER BY version`,
      [caseId],
    );
    return response({ items: result.rows });
  }

  private async pilot(
    operation: string,
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const p = path(input);
    const reference = typeof p['pilotReference'] === 'string' ? p['pilotReference'] : null;
    if (operation === 'createPilotConfiguration') {
      return response(
        await this.dependencies.pilotService.configure(input as never, principal),
        201,
      );
    }
    if (operation === 'getInstitutionPilotReadiness') {
      const result = await this.dependencies.pool.query(
        `SELECT p.*,r.outcome readiness_outcome,r.checks readiness_checks,r.assessed_at
         FROM pilot_configurations p LEFT JOIN LATERAL(
           SELECT outcome,checks,assessed_at FROM pilot_readiness_assessments
           WHERE pilot_reference=p.pilot_reference ORDER BY assessed_at DESC LIMIT 1
         ) r ON true WHERE p.institution_id=$1 ORDER BY p.version DESC LIMIT 1`,
        [text(p['institutionId'], 'institutionId')],
      );
      return response(result.rows[0] ?? { state: 'NOT_CONFIGURED' });
    }
    if (reference === null)
      throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, 'pilotReference is required.');
    if (operation === 'getPilotConfiguration') {
      const value = await this.dependencies.pilotRepository.find(reference);
      if (value === null) throw new GatewayProblem('PILOT_NOT_FOUND', 404, 'Pilot not found.');
      return response(value);
    }
    if (operation === 'assessPilotReadiness')
      return response(
        await this.dependencies.pilotService.assess(reference, input as never, principal),
      );
    if (operation === 'reconcilePilot')
      return response(
        await this.dependencies.pilotService.reconcile(reference, input as never, principal),
      );
    if (operation === 'activatePilot')
      return response(
        await this.dependencies.pilotService.activate(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
        ),
      );
    if (operation === 'pausePilot')
      return response(
        await this.dependencies.pilotService.pause(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
          input['incident'] === true,
        ),
      );
    if (operation === 'resumePilot')
      return response(
        await this.dependencies.pilotService.resume(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
        ),
      );
    if (operation === 'exitPilot')
      return response(
        await this.dependencies.pilotService.exit(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          integer(input['reconciliationDrift'], 'reconciliationDrift'),
          principal,
        ),
      );
    if (operation === 'expandPilotCohort')
      return response(
        await this.dependencies.pilotService.expand(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          strings(input['campusIds'], 'campusIds'),
          principal,
        ),
      );
    if (operation === 'setPilotKillSwitches')
      return response(
        await this.dependencies.pilotService.setKillSwitches(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          {
            globalKillSwitch: boolean(input['globalKillSwitch'], 'globalKillSwitch'),
            institutionKillSwitch: boolean(input['institutionKillSwitch'], 'institutionKillSwitch'),
          },
          principal,
        ),
      );
    if (operation === 'createPilotMigration')
      return response(
        await this.dependencies.pilotService.migrate(
          reference,
          idempotency(input),
          text(input['mode'], 'mode') as 'DRY_RUN' | 'STAGED',
          input['rows'] as never,
          principal,
        ),
        201,
      );
    if (operation === 'rollbackPilotMigration')
      return response(
        await this.dependencies.pilotService.rollbackMigration(
          text(p['migrationReference'], 'migrationReference'),
          principal,
        ),
      );
    throw new GatewayProblem('OPERATION_NOT_CONNECTED', 503, `${operation} is not connected.`);
  }

  private async execution(
    operation: string,
    input: JsonObject,
    principal: Principal,
  ): Promise<GatewayTransportResponse> {
    const p = path(input);
    const reference = typeof p['executionReference'] === 'string' ? p['executionReference'] : null;
    if (operation === 'createPilotExecution')
      return response(
        await this.dependencies.executionService.create(
          input as never,
          principal,
          idempotency(input),
        ),
        201,
      );
    if (reference === null)
      throw new GatewayProblem('REQUEST_VALIDATION_FAILED', 422, 'executionReference is required.');
    if (operation === 'getPilotExecution') {
      const value = await this.dependencies.executionRepository.find(reference);
      if (value === null)
        throw new GatewayProblem('EXECUTION_NOT_FOUND', 404, 'Execution not found.');
      return response(value);
    }
    if (operation === 'assessPilotExecutionGoNoGo')
      return response(
        await this.dependencies.executionService.assess(reference, input as never, principal),
      );
    if (operation === 'submitPilotGoLiveReview')
      return response(
        await this.dependencies.executionService.submitGoLiveReview(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'approvePilotExecution')
      return response(
        await this.dependencies.executionService.approve(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'startPilotExecution')
      return response(
        await this.dependencies.executionService.start(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'pausePilotExecution')
      return response(
        await this.dependencies.executionService.pause(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'declarePilotIncident')
      return response(
        await this.dependencies.executionService.declareIncident(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          input as never,
          principal,
          idempotency(input),
        ),
        201,
      );
    if (operation === 'resumePilotExecution')
      return response(
        await this.dependencies.executionService.resume(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          text(p['incidentReference'], 'incidentReference'),
          object(input['recovery'], 'recovery') as never,
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'setPilotExecutionStopControls')
      return response(
        await this.dependencies.executionService.setStopControls(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          object(input['stopControls'], 'stopControls') as never,
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'recordPilotParticipation') {
      await this.dependencies.executionService.addParticipation(
        { ...input, executionReference: reference } as never,
        principal,
      );
      return response({ recorded: true }, 201);
    }
    if (operation === 'recordPilotEvidence') {
      await this.dependencies.executionService.recordEvidence(
        { ...input, executionReference: reference } as never,
        principal,
      );
      return response({ recorded: true }, 201);
    }
    if (operation === 'expandPilotExecutionCohort')
      return response(
        await this.dependencies.executionService.expand(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          input as never,
          principal,
        ),
      );
    if (operation === 'completePilotExecution')
      return response(
        await this.dependencies.executionService.complete(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          input as never,
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'terminatePilotExecution')
      return response(
        await this.dependencies.executionService.terminate(
          reference,
          integer(input['expectedVersion'], 'expectedVersion'),
          principal,
          idempotency(input),
        ),
      );
    if (operation === 'getPilotCompletionReport') {
      const execution = await this.dependencies.executionRepository.find(reference);
      if (execution === null)
        throw new GatewayProblem('EXECUTION_NOT_FOUND', 404, 'Execution not found.');
      const report = await this.dependencies.executionRepository.findCompletion(
        reference,
        execution.version,
      );
      if (report === null)
        throw new GatewayProblem(
          'COMPLETION_REPORT_NOT_FOUND',
          404,
          'Completion report not found.',
        );
      return response(report);
    }
    if (operation === 'getInstitutionPilotEvidence') {
      return response({
        items: await this.dependencies.executionRepository.listEvidenceForInstitution(
          reference,
          text(p['institutionId'], 'institutionId'),
        ),
      });
    }
    if (operation === 'listPilotWorkerStatus') {
      const result = await this.dependencies.pool.query(
        'SELECT * FROM pilot_worker_jobs WHERE execution_reference=$1 ORDER BY created_at,job_reference',
        [reference],
      );
      return response({ items: result.rows });
    }
    throw new GatewayProblem('OPERATION_NOT_CONNECTED', 503, `${operation} is not connected.`);
  }
}
