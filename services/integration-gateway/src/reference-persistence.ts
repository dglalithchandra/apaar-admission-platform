import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  migrate,
  type DatabaseConfig,
  createPostgresPool,
} from '@apaar-platform/admission-application';
import type { BatchReferenceGenerator, ObjectStoragePort } from '@apaar-platform/batch-ingestion';
import type { Pool } from 'pg';
import type {
  AdmissionFacts,
  AdmissionFactsPort,
  OperationalEvent,
  OperationalEventStreamPort,
  Principal,
} from './model.js';

const MIGRATION_DIRECTORIES = [
  'services/admission-application/migrations',
  'services/batch-ingestion/migrations',
  'services/admission-casework/migrations',
  'services/integration-gateway/migrations',
] as const;

export async function runReferenceMigrations(
  pool: Pool,
  repositoryRoot = process.cwd(),
): Promise<readonly string[]> {
  const applied: string[] = [];
  for (const directory of MIGRATION_DIRECTORIES) {
    applied.push(...(await migrate(pool, resolve(repositoryRoot, directory))));
  }
  return applied;
}

export function createReferencePool(config: DatabaseConfig): Pool {
  return createPostgresPool({ ...config, applicationName: 'apaar-reference-runtime' });
}

export class SyntheticReferenceGenerator implements BatchReferenceGenerator {
  public next(kind: 'BATCH' | 'OBJECT' | 'RECEIPT' | 'ROW'): string {
    return `SYNTH-${kind}-${randomUUID().toUpperCase()}`;
  }
}

export class PostgresObjectStorage implements ObjectStoragePort {
  public constructor(private readonly pool: Pool) {}

  public async put(
    reference: string,
    content: readonly Buffer[],
    metadata: Readonly<Record<string, string>>,
  ): Promise<void> {
    const payload = Buffer.concat(content);
    const digest = createHash('sha256').update(payload).digest('hex');
    if (metadata['sha256'] !== digest) {
      throw new Error('Object digest changed before persistence.');
    }
    await this.pool.query(
      `INSERT INTO runtime_objects(object_reference,content,metadata)
       VALUES($1,$2,$3) ON CONFLICT(object_reference) DO NOTHING`,
      [reference, payload, metadata],
    );
  }
}

export class PostgresAdmissionFacts implements AdmissionFactsPort {
  public constructor(private readonly pool: Pool) {}

  public async get(admissionReference: string): Promise<AdmissionFacts | null> {
    const result = await this.pool.query<{
      academic_year: string;
      admission_reference: string;
      current_status: string;
      institution_id: string;
      programme_id: string;
    }>(
      `SELECT a.academic_year_code academic_year,a.registration_reference admission_reference,
              a.lifecycle_status current_status,a.institution_id,a.programme_id
       FROM admissions a
       WHERE a.registration_reference=$1
       ORDER BY a.created_at DESC LIMIT 1`,
      [admissionReference],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          academicYear: row.academic_year,
          admissionReference: row.admission_reference,
          currentStatus: row.current_status,
          institutionReference: row.institution_id,
          programmeReference: row.programme_id,
        };
  }
}

export class PostgresWorkerHeartbeat {
  public constructor(private readonly pool: Pool) {}

  public async record(input: {
    readonly checkpoint?: Readonly<Record<string, unknown>>;
    readonly problemCode?: string | null;
    readonly state: 'STARTING' | 'READY' | 'DEGRADED' | 'STOPPING';
    readonly type: 'BATCH' | 'OUTBOX' | 'NOTIFICATION' | 'PILOT';
    readonly workerReference: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO runtime_worker_heartbeats(
         worker_reference,worker_type,state,checkpoint,last_problem_code,observed_at
       ) VALUES($1,$2,$3,$4,$5,transaction_timestamp())
       ON CONFLICT(worker_reference) DO UPDATE SET
         worker_type=excluded.worker_type,state=excluded.state,checkpoint=excluded.checkpoint,
         last_problem_code=excluded.last_problem_code,observed_at=excluded.observed_at`,
      [
        input.workerReference,
        input.type,
        input.state,
        input.checkpoint ?? {},
        input.problemCode ?? null,
      ],
    );
  }

  public async states(
    maximumAgeSeconds = 90,
  ): Promise<Readonly<Record<string, 'UP' | 'DEGRADED'>>> {
    const result = await this.pool.query<{ state: string; worker_type: string }>(
      `SELECT DISTINCT ON(worker_type) worker_type,state
       FROM runtime_worker_heartbeats
       WHERE observed_at >= transaction_timestamp()-make_interval(secs=>$1)
       ORDER BY worker_type,observed_at DESC`,
      [maximumAgeSeconds],
    );
    return Object.fromEntries(
      result.rows.map((row) => [
        `worker_${row.worker_type.toLowerCase()}`,
        row.state === 'READY' ? 'UP' : 'DEGRADED',
      ]),
    );
  }
}

export class PostgresBatchJobRepository {
  public constructor(private readonly pool: Pool) {}

  public async enqueue(batchId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO runtime_batch_jobs(batch_id,state) VALUES($1,'PENDING')
       ON CONFLICT(batch_id) DO NOTHING`,
      [batchId],
    );
  }

  public async claim(
    workerReference: string,
    leaseSeconds = 60,
  ): Promise<{ readonly attempt: number; readonly batchId: string } | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{ attempt_count: number; batch_id: string }>(
        `SELECT batch_id,attempt_count FROM runtime_batch_jobs
         WHERE (state IN ('PENDING','RETRYABLE') AND available_at <= transaction_timestamp())
            OR (state='IN_FLIGHT' AND lease_until <= transaction_timestamp())
         ORDER BY available_at,batch_id FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = found.rows[0];
      if (row === undefined) {
        await client.query('COMMIT');
        return null;
      }
      const attempt = row.attempt_count + 1;
      await client.query(
        `UPDATE runtime_batch_jobs SET state='IN_FLIGHT',attempt_count=$2,lease_owner=$3,
         lease_until=transaction_timestamp()+make_interval(secs=>$4),updated_at=transaction_timestamp()
         WHERE batch_id=$1`,
        [row.batch_id, attempt, workerReference, leaseSeconds],
      );
      await client.query('COMMIT');
      return { attempt, batchId: row.batch_id };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async complete(batchId: string, workerReference: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE runtime_batch_jobs SET state='COMPLETED',lease_owner=NULL,lease_until=NULL,
       updated_at=transaction_timestamp() WHERE batch_id=$1 AND state='IN_FLIGHT' AND lease_owner=$2`,
      [batchId, workerReference],
    );
    if (result.rowCount !== 1) throw new Error('Batch worker lease was lost before completion.');
  }

  public async fail(
    batchId: string,
    workerReference: string,
    problemCode: string,
    retrySeconds: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE runtime_batch_jobs SET
         state=CASE WHEN attempt_count>=maximum_attempts THEN 'DEAD_LETTER' ELSE 'RETRYABLE' END,
         available_at=transaction_timestamp()+make_interval(secs=>$3),lease_owner=NULL,lease_until=NULL,
         last_problem_code=$4,updated_at=transaction_timestamp()
       WHERE batch_id=$1 AND state='IN_FLIGHT' AND lease_owner=$2`,
      [batchId, workerReference, retrySeconds, problemCode],
    );
  }
}

export class PostgresOperationalEventStream implements OperationalEventStreamPort {
  public constructor(private readonly pool: Pool) {}

  public async list(
    principal: Principal,
    afterSequence: number,
    limit: number,
  ): Promise<readonly OperationalEvent[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    const result = await this.pool.query<{
      aggregate_reference: string;
      aggregate_type: string;
      event_reference: string;
      event_sequence: string;
      event_type: string;
      occurred_at: string;
      payload: Readonly<Record<string, unknown>>;
    }>(
      `SELECT event_sequence::text,event_reference,event_type,aggregate_type,aggregate_reference,
              payload,occurred_at
       FROM runtime_event_stream
       WHERE event_sequence>$1 AND ($2::text IS NULL OR tenant_reference=$2)
       ORDER BY event_sequence LIMIT $3`,
      [afterSequence, principal.institutionId, boundedLimit],
    );
    return result.rows.map((row) => ({
      aggregateReference: row.aggregate_reference,
      aggregateType: row.aggregate_type,
      eventId: row.event_reference,
      eventType: row.event_type,
      occurredAt: new Date(row.occurred_at).toISOString(),
      payload: row.payload,
      sequence: Number(row.event_sequence),
    }));
  }
}
