import type { Pool, PoolClient } from 'pg';
import type {
  MigrationReceipt,
  PilotConfiguration,
  PilotReconciliation,
  PilotReadinessAssessment,
  PilotRepositoryPort,
} from './pilot-rollout.js';
import { GatewayProblem } from './model.js';

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

interface ConfigurationRow {
  api_version: string;
  campus_ids: string[];
  checker_reference: string | null;
  cohort_reference: string;
  effective_from: string;
  effective_to: string;
  enabled_capabilities: PilotConfiguration['enabledCapabilities'];
  global_kill_switch: boolean;
  institution_id: string;
  institution_kill_switch: boolean;
  maker_reference: string;
  maximum_batch_rows: number;
  maximum_daily_submissions: number;
  pilot_reference: string;
  state: PilotConfiguration['state'];
  template_version: string;
  version: number;
}

interface MigrationRow {
  accepted_rows: number;
  correction_csv: string;
  digest_sha256: string;
  drift: number;
  duplicate_rows: number;
  idempotency_key: string;
  migration_reference: string;
  mode: MigrationReceipt['mode'];
  pilot_reference: string;
  rejected_rows: number;
  request_hash: string;
  state: MigrationReceipt['state'];
  total_rows: number;
}

function configuration(row: ConfigurationRow): PilotConfiguration {
  return {
    apiVersion: row.api_version,
    campusIds: row.campus_ids,
    checkerReference: row.checker_reference,
    cohortReference: row.cohort_reference,
    effectiveFrom: new Date(row.effective_from).toISOString().slice(0, 10),
    effectiveTo: new Date(row.effective_to).toISOString().slice(0, 10),
    enabledCapabilities: row.enabled_capabilities,
    globalKillSwitch: row.global_kill_switch,
    institutionId: row.institution_id,
    institutionKillSwitch: row.institution_kill_switch,
    makerReference: row.maker_reference,
    maximumBatchRows: row.maximum_batch_rows,
    maximumDailySubmissions: row.maximum_daily_submissions,
    pilotReference: row.pilot_reference,
    state: row.state,
    templateVersion: row.template_version,
    version: row.version,
  };
}

function migrationReceipt(row: MigrationRow, state = row.state): MigrationReceipt {
  return {
    acceptedRows: row.accepted_rows,
    correctionCsv: row.correction_csv,
    digestSha256: row.digest_sha256,
    drift: row.drift,
    duplicateRows: row.duplicate_rows,
    idempotencyKey: row.idempotency_key,
    migrationReference: row.migration_reference,
    mode: row.mode,
    pilotReference: row.pilot_reference,
    rejectedRows: row.rejected_rows,
    replayed: false,
    state,
    totalRows: row.total_rows,
  };
}

export class PostgresPilotRepository implements PilotRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async find(reference: string): Promise<PilotConfiguration | null> {
    const result = await this.pool.query<ConfigurationRow>(
      'SELECT * FROM pilot_configurations WHERE pilot_reference=$1 ORDER BY version DESC LIMIT 1',
      [reference],
    );
    return result.rows[0] === undefined ? null : configuration(result.rows[0]);
  }

  public async save(value: PilotConfiguration, eventCode: string, actor: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        value.pilotReference,
      ]);
      const membership = await client.query<{ count: string }>(
        'SELECT count(*)::text count FROM campuses WHERE institution_id=$1 AND id=ANY($2::text[])',
        [value.institutionId, value.campusIds],
      );
      if (Number(membership.rows[0]?.count ?? 0) !== value.campusIds.length) {
        throw new GatewayProblem(
          'PILOT_MEMBERSHIP_INVALID',
          422,
          'Every pilot campus must belong to the configured institution.',
        );
      }
      const latest = await client.query<{ version: number }>(
        'SELECT version FROM pilot_configurations WHERE pilot_reference=$1 ORDER BY version DESC LIMIT 1',
        [value.pilotReference],
      );
      if (value.version !== (latest.rows[0]?.version ?? 0) + 1) {
        throw new GatewayProblem('PILOT_VERSION_CONFLICT', 409, 'The pilot version is stale.');
      }
      await client.query(
        `INSERT INTO pilot_configurations(
          pilot_reference,version,cohort_reference,institution_id,campus_ids,effective_from,effective_to,
          enabled_capabilities,template_version,api_version,maximum_batch_rows,maximum_daily_submissions,
          global_kill_switch,institution_kill_switch,state,maker_reference,checker_reference
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          value.pilotReference,
          value.version,
          value.cohortReference,
          value.institutionId,
          JSON.stringify(value.campusIds),
          value.effectiveFrom,
          value.effectiveTo,
          JSON.stringify(value.enabledCapabilities),
          value.templateVersion,
          value.apiVersion,
          value.maximumBatchRows,
          value.maximumDailySubmissions,
          value.globalKillSwitch,
          value.institutionKillSwitch,
          value.state,
          value.makerReference,
          value.checkerReference,
        ],
      );
      await this.audit(client, value.pilotReference, eventCode, actor, value.version);
    });
  }

  public async saveReadiness(assessment: PilotReadinessAssessment, actor: string): Promise<void> {
    const pilot = await this.find(assessment.pilotReference);
    if (pilot === null)
      throw new GatewayProblem('PILOT_NOT_FOUND', 404, 'The pilot was not found.');
    await this.pool.query(
      `INSERT INTO pilot_readiness_assessments(
        pilot_reference,pilot_version,outcome,checks,assessed_at,actor_reference
      ) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        assessment.pilotReference,
        pilot.version,
        assessment.outcome,
        JSON.stringify(assessment.checks),
        assessment.assessedAt,
        actor,
      ],
    );
  }

  public async saveReconciliation(
    reconciliation: PilotReconciliation,
    actor: string,
  ): Promise<void> {
    const pilot = await this.find(reconciliation.pilotReference);
    if (pilot === null)
      throw new GatewayProblem('PILOT_NOT_FOUND', 404, 'The pilot was not found.');
    await this.pool.query(
      `INSERT INTO pilot_reconciliations(
        pilot_reference,pilot_version,source_rows,accepted_rows,rejected_rows,
        unresolved_corrections,drift,outcome,assessed_at,actor_reference
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        reconciliation.pilotReference,
        pilot.version,
        reconciliation.sourceRows,
        reconciliation.acceptedRows,
        reconciliation.rejectedRows,
        reconciliation.unresolvedCorrections,
        reconciliation.drift,
        reconciliation.outcome,
        reconciliation.assessedAt,
        actor,
      ],
    );
  }

  public async findMigration(
    key: string,
  ): Promise<{ readonly hash: string; readonly receipt: MigrationReceipt } | null> {
    const result = await this.pool.query<MigrationRow>(
      `SELECT r.*,(SELECT state FROM pilot_migration_state_history h
        WHERE h.migration_reference=r.migration_reference ORDER BY id DESC LIMIT 1) state
       FROM pilot_migration_receipts r WHERE idempotency_key=$1`,
      [key],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          hash: row.request_hash,
          receipt: migrationReceipt(row),
        };
  }

  public async saveMigration(
    receipt: MigrationReceipt,
    requestHash: string,
    actor: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO pilot_migration_receipts(
          migration_reference,pilot_reference,idempotency_key,request_hash,mode,digest_sha256,
          total_rows,accepted_rows,rejected_rows,duplicate_rows,drift,correction_csv,actor_reference
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          receipt.migrationReference,
          receipt.pilotReference,
          receipt.idempotencyKey,
          requestHash,
          receipt.mode,
          receipt.digestSha256,
          receipt.totalRows,
          receipt.acceptedRows,
          receipt.rejectedRows,
          receipt.duplicateRows,
          receipt.drift,
          receipt.correctionCsv,
          actor,
        ],
      );
      await client.query(
        `INSERT INTO pilot_migration_state_history(migration_reference,state,actor_reference)
         VALUES($1,$2,$3)`,
        [receipt.migrationReference, receipt.state, actor],
      );
      await this.audit(client, receipt.migrationReference, 'PILOT_MIGRATION_RECORDED', actor, 0);
    });
  }

  public async rollbackMigration(reference: string, actor: string): Promise<MigrationReceipt> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<MigrationRow>(
        `SELECT r.*,(SELECT state FROM pilot_migration_state_history h
          WHERE h.migration_reference=r.migration_reference ORDER BY id DESC LIMIT 1) state
         FROM pilot_migration_receipts r WHERE migration_reference=$1 FOR UPDATE`,
        [reference],
      );
      const row = found.rows[0];
      if (row === undefined)
        throw new GatewayProblem('MIGRATION_NOT_FOUND', 404, 'Migration not found.');
      if (row.state !== 'STAGED') {
        throw new GatewayProblem(
          'MIGRATION_ROLLBACK_INVALID',
          409,
          'Only staged migration can roll back.',
        );
      }
      await client.query(
        `INSERT INTO pilot_migration_state_history(migration_reference,state,actor_reference)
         VALUES($1,'ROLLED_BACK',$2)`,
        [reference, actor],
      );
      return migrationReceipt(row, 'ROLLED_BACK');
    });
  }

  private async audit(
    client: PoolClient,
    reference: string,
    event: string,
    actor: string,
    version: number,
  ): Promise<void> {
    const suffix = `${reference}-${String(version)}-${event}`;
    await client.query(
      `INSERT INTO business_audit_events(
        id,event_type,aggregate_type,aggregate_reference,actor_reference,reason,
        correlation_reference,request_reference,details,created_at
      ) VALUES($1,$2,'PILOT',$3,$4,'Stage 7 controlled rollout',$5,$6,$7,transaction_timestamp())`,
      [
        `SYNTH-AUDIT-${suffix}`,
        event,
        reference,
        actor,
        `SYNTH-CORRELATION-${suffix}`,
        `SYNTH-REQUEST-${suffix}`,
        { version },
      ],
    );
    await client.query(
      `INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_reference,payload,created_at)
       VALUES($1,$2,'PILOT',$3,$4,transaction_timestamp())`,
      [`SYNTH-OUTBOX-${suffix}`, event, reference, { reference, version }],
    );
  }
}
