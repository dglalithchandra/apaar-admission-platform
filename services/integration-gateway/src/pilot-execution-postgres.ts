import type { Pool, PoolClient } from 'pg';
import { GatewayProblem } from './model.js';
import type {
  GoNoGoAssessment,
  PilotCompletionReport,
  PilotEvidence,
  PilotExecution,
  PilotExecutionRepositoryPort,
  PilotIncident,
  PilotParticipation,
  PilotWorkerJob,
  PilotWorkerRepositoryPort,
} from './pilot-execution.js';

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

interface ExecutionRow {
  authority_mode: 'SYNTHETIC_ONLY';
  checker_reference: string | null;
  cohort_reference: string;
  execution_reference: string;
  maker_reference: string;
  operational_owner_references: string[];
  pilot_reference: string;
  pilot_version: number;
  scheduled_end: string;
  scheduled_start: string;
  state: PilotExecution['state'];
  stop_controls: PilotExecution['stopControls'];
  version: number;
}

interface WorkerRow {
  attempt_count: number;
  available_at: string;
  batch_limit: number;
  checkpoint: Record<string, unknown>;
  execution_reference: string;
  institution_id: string | null;
  job_reference: string;
  maximum_attempts: number;
  state: PilotWorkerJob['state'];
  job_type: PilotWorkerJob['type'];
}

function execution(row: ExecutionRow): PilotExecution {
  return {
    authorityMode: row.authority_mode,
    checkerReference: row.checker_reference,
    cohortReference: row.cohort_reference,
    executionReference: row.execution_reference,
    makerReference: row.maker_reference,
    operationalOwnerReferences: row.operational_owner_references,
    pilotReference: row.pilot_reference,
    pilotVersion: row.pilot_version,
    scheduledEnd: new Date(row.scheduled_end).toISOString(),
    scheduledStart: new Date(row.scheduled_start).toISOString(),
    state: row.state,
    stopControls: row.stop_controls,
    version: row.version,
  };
}

function worker(row: WorkerRow): PilotWorkerJob {
  return {
    attemptCount: row.attempt_count,
    availableAt: new Date(row.available_at).toISOString(),
    batchLimit: row.batch_limit,
    checkpoint: row.checkpoint,
    executionReference: row.execution_reference,
    institutionId: row.institution_id,
    jobReference: row.job_reference,
    maximumAttempts: row.maximum_attempts,
    state: row.state,
    type: row.job_type,
  };
}

export class PostgresPilotExecutionRepository implements PilotExecutionRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async find(reference: string): Promise<PilotExecution | null> {
    const result = await this.pool.query<ExecutionRow>(
      'SELECT * FROM pilot_executions WHERE execution_reference=$1 ORDER BY version DESC LIMIT 1',
      [reference],
    );
    return result.rows[0] === undefined ? null : execution(result.rows[0]);
  }

  public async findCommand(
    key: string,
  ): Promise<{ readonly hash: string; readonly result: PilotExecution } | null> {
    const result = await this.pool.query<{ request_hash: string; result: PilotExecution }>(
      'SELECT request_hash,result FROM pilot_execution_commands WHERE idempotency_key=$1',
      [key],
    );
    const row = result.rows[0];
    return row === undefined ? null : { hash: row.request_hash, result: row.result };
  }

  public append(
    value: PilotExecution,
    expectedVersion: number,
    eventCode: string,
    actor: string,
    key: string,
    requestHash: string,
  ): Promise<PilotExecution> {
    return transaction(this.pool, (client) =>
      this.appendWithClient(client, value, expectedVersion, eventCode, actor, key, requestHash),
    );
  }

  public appendIncident(
    value: PilotExecution,
    expectedVersion: number,
    incident: PilotIncident,
    actor: string,
    key: string,
    requestHash: string,
  ): Promise<PilotExecution> {
    return transaction(this.pool, async (client) => {
      const saved = await this.appendWithClient(
        client,
        value,
        expectedVersion,
        'PILOT_INCIDENT_DECLARED',
        actor,
        key,
        requestHash,
      );
      await client.query(
        `INSERT INTO pilot_incidents(
          incident_reference,execution_reference,cohort_reference,severity,affected_capabilities,
          owner_reference,stop_action,declared_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          incident.incidentReference,
          incident.executionReference,
          incident.cohortReference,
          incident.severity,
          JSON.stringify(incident.affectedCapabilities),
          incident.ownerReference,
          incident.stopAction,
          incident.declaredAt,
        ],
      );
      await client.query(
        `INSERT INTO pilot_incident_timeline(
          incident_reference,event_code,explanation,evidence_references,recovery_checks,actor_reference,created_at
        ) VALUES($1,'INCIDENT_DECLARED',$2,$3,'[]',$4,$5)`,
        [
          incident.incidentReference,
          'Synthetic incident declared; affected exposure is stopped.',
          JSON.stringify(incident.evidenceReferences),
          actor,
          incident.declaredAt,
        ],
      );
      return saved;
    });
  }

  public appendCompletion(
    value: PilotExecution,
    expectedVersion: number,
    report: PilotCompletionReport,
    actor: string,
    key: string,
    requestHash: string,
  ): Promise<PilotExecution> {
    return transaction(this.pool, async (client) => {
      const saved = await this.appendWithClient(
        client,
        value,
        expectedVersion,
        'PILOT_EXECUTION_COMPLETED',
        actor,
        key,
        requestHash,
      );
      await client.query(
        `INSERT INTO pilot_completion_reports(
          report_reference,execution_reference,execution_version,classification,reconciliation,
          authority_decision_required,actor_reference,completed_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          report.reportReference,
          report.executionReference,
          report.executionVersion,
          report.classification,
          report.reconciliation,
          report.authorityDecisionRequired,
          actor,
          report.completedAt,
        ],
      );
      return saved;
    });
  }

  public async findCompletion(
    reference: string,
    executionVersion: number,
  ): Promise<PilotCompletionReport | null> {
    const result = await this.pool.query<{
      authority_decision_required: true;
      classification: PilotCompletionReport['classification'];
      completed_at: string;
      execution_reference: string;
      execution_version: number;
      reconciliation: PilotCompletionReport['reconciliation'];
      report_reference: string;
    }>(
      `SELECT * FROM pilot_completion_reports
       WHERE execution_reference=$1 AND execution_version=$2`,
      [reference, executionVersion],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          authorityDecisionRequired: row.authority_decision_required,
          classification: row.classification,
          completedAt: new Date(row.completed_at).toISOString(),
          executionReference: row.execution_reference,
          executionVersion: row.execution_version,
          reconciliation: row.reconciliation,
          reportReference: row.report_reference,
        };
  }

  public async latestAssessment(reference: string): Promise<GoNoGoAssessment | null> {
    const result = await this.pool.query<{
      assessed_at: string;
      assessment_reference: string;
      checks: GoNoGoAssessment['checks'];
      execution_reference: string;
      execution_version: number;
      outcome: GoNoGoAssessment['outcome'];
      startable: boolean;
    }>(
      `SELECT * FROM pilot_go_no_go_assessments
       WHERE execution_reference=$1 ORDER BY assessed_at DESC,assessment_reference DESC LIMIT 1`,
      [reference],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          assessedAt: new Date(row.assessed_at).toISOString(),
          assessmentReference: row.assessment_reference,
          checks: row.checks,
          executionReference: row.execution_reference,
          executionVersion: row.execution_version,
          outcome: row.outcome,
          startable: row.startable,
        };
  }

  public async recordAssessment(assessment: GoNoGoAssessment, actor: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO pilot_go_no_go_assessments(
        assessment_reference,execution_reference,execution_version,outcome,startable,checks,actor_reference,assessed_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        assessment.assessmentReference,
        assessment.executionReference,
        assessment.executionVersion,
        assessment.outcome,
        assessment.startable,
        JSON.stringify(assessment.checks),
        actor,
        assessment.assessedAt,
      ],
    );
  }

  public async saveParticipation(
    value: PilotParticipation,
    executionVersion: number,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const campusCount = await client.query<{ count: string }>(
        'SELECT count(*)::text count FROM campuses WHERE institution_id=$1 AND id=ANY($2::text[])',
        [value.institutionId, value.campusIds],
      );
      if (Number(campusCount.rows[0]?.count ?? 0) !== value.campusIds.length) {
        throw new GatewayProblem(
          'EXECUTION_MEMBERSHIP_INVALID',
          422,
          'Every campus must belong to the participating institution.',
        );
      }
      await client.query(
        `INSERT INTO pilot_execution_participation(
          execution_reference,execution_version,institution_id,campus_ids,readiness,
          approval_data_fresh,identity_dependency
        ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          value.executionReference,
          executionVersion,
          value.institutionId,
          JSON.stringify(value.campusIds),
          value.readiness,
          value.approvalDataFresh,
          value.identityDependency,
        ],
      );
    });
  }

  public async recordEvidence(value: PilotEvidence, actor: string): Promise<void> {
    const { evidenceReference, executionReference, institutionId, capturedAt, ...evidence } = value;
    await this.pool.query(
      `INSERT INTO pilot_evidence_snapshots(
        evidence_reference,execution_reference,institution_id,evidence,actor_reference,captured_at
      ) VALUES($1,$2,$3,$4,$5,$6)`,
      [evidenceReference, executionReference, institutionId, evidence, actor, capturedAt],
    );
  }

  public async listEvidenceForInstitution(
    executionReference: string,
    institutionId: string,
  ): Promise<readonly PilotEvidence[]> {
    const result = await this.pool.query<{
      actor_reference: string;
      captured_at: string;
      evidence: Omit<
        PilotEvidence,
        'capturedAt' | 'evidenceReference' | 'executionReference' | 'institutionId'
      >;
      evidence_reference: string;
      institution_id: string | null;
    }>(
      `SELECT * FROM pilot_evidence_snapshots
       WHERE execution_reference=$1 AND institution_id=$2 ORDER BY captured_at,evidence_reference`,
      [executionReference, institutionId],
    );
    return result.rows.map((row) => ({
      ...row.evidence,
      capturedAt: new Date(row.captured_at).toISOString(),
      evidenceReference: row.evidence_reference,
      executionReference,
      institutionId: row.institution_id,
    }));
  }

  public async recordIncidentTimeline(
    incidentReference: string,
    eventCode: string,
    explanation: string,
    evidenceReferences: readonly string[],
    recoveryChecks: readonly GoNoGoAssessment['checks'][number][],
    actor: string,
    at: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO pilot_incident_timeline(
        incident_reference,event_code,explanation,evidence_references,recovery_checks,actor_reference,created_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        incidentReference,
        eventCode,
        explanation,
        JSON.stringify(evidenceReferences),
        JSON.stringify(recoveryChecks),
        actor,
        at,
      ],
    );
  }

  public recordExpansion(
    expansionReference: string,
    prior: PilotExecution,
    next: PilotExecution,
    institutionIds: readonly string[],
    campusIds: readonly string[],
    checker: string,
  ): Promise<void> {
    return transaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        prior.executionReference,
      ]);
      await this.assertVersion(client, prior.executionReference, prior.version);
      const membership = await client.query<{ campuses: string; institutions: string }>(
        `SELECT
          (SELECT count(*)::text FROM campuses WHERE id=ANY($1::text[]) AND institution_id=ANY($2::text[])) campuses,
          (SELECT count(*)::text FROM institutions WHERE id=ANY($2::text[])) institutions`,
        [campusIds, institutionIds],
      );
      if (
        Number(membership.rows[0]?.campuses ?? 0) !== campusIds.length ||
        Number(membership.rows[0]?.institutions ?? 0) !== institutionIds.length
      ) {
        throw new GatewayProblem(
          'EXPANSION_MEMBERSHIP_INVALID',
          422,
          'Every expansion campus must belong to a proposed institution.',
        );
      }
      await this.insertExecution(client, next, 'PILOT_COHORT_EXPANDED', checker);
      await client.query(
        `INSERT INTO pilot_expansion_decisions(
          expansion_reference,execution_reference,prior_execution_version,new_execution_version,
          new_pilot_version,institution_ids,campus_ids,checker_reference
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          expansionReference,
          prior.executionReference,
          prior.version,
          next.version,
          next.pilotVersion,
          JSON.stringify(institutionIds),
          JSON.stringify(campusIds),
          checker,
        ],
      );
      await this.audit(client, expansionReference, 'PILOT_COHORT_EXPANDED', checker, next.version);
    });
  }

  public async recordCompletion(report: PilotCompletionReport, actor: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO pilot_completion_reports(
        report_reference,execution_reference,execution_version,classification,reconciliation,
        authority_decision_required,actor_reference,completed_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        report.reportReference,
        report.executionReference,
        report.executionVersion,
        report.classification,
        report.reconciliation,
        report.authorityDecisionRequired,
        actor,
        report.completedAt,
      ],
    );
  }

  private async appendWithClient(
    client: PoolClient,
    value: PilotExecution,
    expectedVersion: number,
    eventCode: string,
    actor: string,
    key: string,
    requestHash: string,
  ): Promise<PilotExecution> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      value.executionReference,
    ]);
    const prior = await client.query<{ request_hash: string; result: PilotExecution }>(
      'SELECT request_hash,result FROM pilot_execution_commands WHERE idempotency_key=$1',
      [key],
    );
    if (prior.rows[0] !== undefined) {
      if (prior.rows[0].request_hash !== requestHash)
        throw new GatewayProblem('IDEMPOTENCY_CONFLICT', 409, 'The idempotency key was reused.');
      return prior.rows[0].result;
    }
    await this.assertVersion(client, value.executionReference, expectedVersion);
    await this.insertExecution(client, value, eventCode, actor);
    await client.query(
      `INSERT INTO pilot_execution_commands(
        idempotency_key,request_hash,execution_reference,execution_version,result
      ) VALUES($1,$2,$3,$4,$5)`,
      [key, requestHash, value.executionReference, value.version, value],
    );
    await this.audit(client, key, eventCode, actor, value.version);
    return value;
  }

  private async assertVersion(
    client: PoolClient,
    reference: string,
    expected: number,
  ): Promise<void> {
    const latest = await client.query<{ version: number }>(
      'SELECT version FROM pilot_executions WHERE execution_reference=$1 ORDER BY version DESC LIMIT 1',
      [reference],
    );
    if ((latest.rows[0]?.version ?? 0) !== expected) {
      throw new GatewayProblem(
        'EXECUTION_VERSION_CONFLICT',
        409,
        'The execution version is stale.',
      );
    }
  }

  private async insertExecution(
    client: PoolClient,
    value: PilotExecution,
    event: string,
    actor: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO pilot_executions(
        execution_reference,version,pilot_reference,pilot_version,cohort_reference,scheduled_start,
        scheduled_end,operational_owner_references,state,stop_controls,authority_mode,maker_reference,
        checker_reference,event_code,actor_reference
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        value.executionReference,
        value.version,
        value.pilotReference,
        value.pilotVersion,
        value.cohortReference,
        value.scheduledStart,
        value.scheduledEnd,
        JSON.stringify(value.operationalOwnerReferences),
        value.state,
        value.stopControls,
        value.authorityMode,
        value.makerReference,
        value.checkerReference,
        event,
        actor,
      ],
    );
  }

  private async audit(
    client: PoolClient,
    suffix: string,
    event: string,
    actor: string,
    version: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO business_audit_events(
        id,event_type,aggregate_type,aggregate_reference,actor_reference,reason,
        correlation_reference,request_reference,details,created_at
      ) VALUES($1,$2,'PILOT_EXECUTION',$3,$4,'Stage 7B synthetic pilot execution',$5,$6,$7,transaction_timestamp())`,
      [
        `SYNTH-AUDIT-${suffix}`,
        event,
        suffix,
        actor,
        `SYNTH-CORRELATION-${suffix}`,
        `SYNTH-REQUEST-${suffix}`,
        { version },
      ],
    );
    await client.query(
      `INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_reference,payload,created_at)
       VALUES($1,$2,'PILOT_EXECUTION',$3,$4,transaction_timestamp())`,
      [`SYNTH-OUTBOX-${suffix}`, event, suffix, { reference: suffix, version }],
    );
  }
}

export class PostgresPilotWorkerRepository implements PilotWorkerRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async enqueue(job: PilotWorkerJob): Promise<void> {
    await this.pool.query(
      `INSERT INTO pilot_worker_jobs(
        job_reference,execution_reference,job_type,institution_id,state,checkpoint,attempt_count,
        maximum_attempts,batch_limit,available_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(job_reference) DO NOTHING`,
      [
        job.jobReference,
        job.executionReference,
        job.type,
        job.institutionId,
        job.state,
        job.checkpoint,
        job.attemptCount,
        job.maximumAttempts,
        job.batchLimit,
        job.availableAt,
      ],
    );
  }

  public claim(
    now: string,
    workerReference: string,
    leaseSeconds: number,
  ): Promise<PilotWorkerJob | null> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<WorkerRow>(
        `SELECT * FROM pilot_worker_jobs
         WHERE (state IN ('PENDING','RETRYABLE') AND available_at <= $1)
            OR (state='IN_FLIGHT' AND lease_until <= $1)
         ORDER BY available_at,created_at,job_reference FOR UPDATE SKIP LOCKED LIMIT 1`,
        [now],
      );
      const row = found.rows[0];
      if (row === undefined) return null;
      const attempt = row.attempt_count + 1;
      const updated = await client.query<WorkerRow>(
        `UPDATE pilot_worker_jobs SET state='IN_FLIGHT',attempt_count=$2,lease_owner=$3,
         lease_until=$4::timestamptz+make_interval(secs=>$5),last_problem_code=NULL
         WHERE job_reference=$1 RETURNING *`,
        [row.job_reference, attempt, workerReference, now, leaseSeconds],
      );
      await this.receipt(
        client,
        row.job_reference,
        attempt,
        'CLAIMED',
        row.checkpoint,
        workerReference,
        null,
      );
      const claimed = updated.rows[0];
      if (claimed === undefined)
        throw new GatewayProblem('WORKER_CLAIM_FAILED', 500, 'Worker claim did not persist.');
      return worker(claimed);
    });
  }

  public complete(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
    now: string,
  ): Promise<PilotWorkerJob> {
    return this.finish(jobReference, workerReference, checkpoint, null, null, now);
  }

  public fail(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
    problemCode: string,
    retryAt: string,
    now: string,
  ): Promise<PilotWorkerJob> {
    return this.finish(jobReference, workerReference, checkpoint, problemCode, retryAt, now);
  }

  private finish(
    jobReference: string,
    workerReference: string,
    checkpoint: Readonly<Record<string, unknown>>,
    problemCode: string | null,
    retryAt: string | null,
    now: string,
  ): Promise<PilotWorkerJob> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<
        WorkerRow & { lease_owner: string | null; lease_until: string | null }
      >('SELECT * FROM pilot_worker_jobs WHERE job_reference=$1 FOR UPDATE', [jobReference]);
      const row = found.rows[0];
      if (row === undefined)
        throw new GatewayProblem('WORKER_JOB_NOT_FOUND', 404, 'Worker job not found.');
      if (
        row.state !== 'IN_FLIGHT' ||
        row.lease_owner !== workerReference ||
        row.lease_until === null ||
        row.lease_until <= now
      ) {
        throw new GatewayProblem(
          'WORKER_LEASE_LOST',
          409,
          'The worker lease is absent, expired or owned by another worker.',
        );
      }
      const dead = problemCode !== null && row.attempt_count >= row.maximum_attempts;
      const state: PilotWorkerJob['state'] =
        problemCode === null ? 'COMPLETED' : dead ? 'DEAD_LETTER' : 'RETRYABLE';
      const updated = await client.query<WorkerRow>(
        `UPDATE pilot_worker_jobs SET state=$2,checkpoint=$3,available_at=coalesce($4,available_at),
         lease_owner=NULL,lease_until=NULL,last_problem_code=$5 WHERE job_reference=$1 RETURNING *`,
        [jobReference, state, checkpoint, retryAt, problemCode],
      );
      await this.receipt(
        client,
        jobReference,
        row.attempt_count,
        state,
        checkpoint,
        workerReference,
        problemCode,
      );
      const finished = updated.rows[0];
      if (finished === undefined)
        throw new GatewayProblem('WORKER_FINISH_FAILED', 500, 'Worker outcome did not persist.');
      return worker(finished);
    });
  }

  private async receipt(
    client: PoolClient,
    job: string,
    attempt: number,
    outcome: 'CLAIMED' | 'CHECKPOINTED' | 'RETRYABLE' | 'COMPLETED' | 'DEAD_LETTER',
    checkpoint: Readonly<Record<string, unknown>>,
    workerReference: string,
    problemCode: string | null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO pilot_worker_receipts(
        job_reference,attempt_number,outcome,checkpoint,worker_reference,problem_code
      ) VALUES($1,$2,$3,$4,$5,$6)`,
      [job, attempt, outcome, checkpoint, workerReference, problemCode],
    );
  }
}
