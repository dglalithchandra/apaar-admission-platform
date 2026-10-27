import { readDatabaseConfig } from '@apaar-platform/admission-application';
import { loadGatewayConfig } from './config.js';
import { createReferenceRuntime } from './reference-runtime.js';
import { createReferencePool, runReferenceMigrations } from './reference-persistence.js';

const config = loadGatewayConfig(process.env);
const pool = createReferencePool(readDatabaseConfig(process.env));
await runReferenceMigrations(pool);
const runtime = createReferenceRuntime(pool, config);
const workerReference = process.env['WORKER_REFERENCE'] ?? 'SYNTH-WORKER-INTEGRATED-001';
const workerType = process.env['WORKER_TYPE'] ?? 'ALL';
if (!['ALL', 'BATCH', 'OUTBOX', 'NOTIFICATION', 'PILOT'].includes(workerType)) {
  throw new Error('WORKER_TYPE must be ALL, BATCH, OUTBOX, NOTIFICATION or PILOT.');
}
const intervalMilliseconds = Number(process.env['WORKER_INTERVAL_MS'] ?? '500');
if (
  !Number.isInteger(intervalMilliseconds) ||
  intervalMilliseconds < 100 ||
  intervalMilliseconds > 60_000
) {
  throw new Error('WORKER_INTERVAL_MS must be an integer between 100 and 60000.');
}

let stopping = false;

function referenceFor(type: 'BATCH' | 'NOTIFICATION' | 'OUTBOX' | 'PILOT'): string {
  return workerType === 'ALL' ? `${workerReference}-${type}` : workerReference;
}

async function publishOutbox(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<{
      aggregate_reference: string;
      aggregate_type: string;
      event_type: string;
      id: string;
      payload: Readonly<Record<string, unknown>>;
    }>(
      `SELECT id,event_type,aggregate_type,aggregate_reference,payload FROM outbox_events
       WHERE publication_state='PENDING' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 25`,
    );
    for (const event of found.rows) {
      const tenant =
        typeof event.payload['institutionId'] === 'string'
          ? event.payload['institutionId']
          : typeof event.payload['institution_id'] === 'string'
            ? event.payload['institution_id']
            : null;
      await client.query(
        `INSERT INTO runtime_event_stream(
          event_reference,tenant_reference,event_type,aggregate_type,aggregate_reference,payload
        ) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_reference) DO NOTHING`,
        [
          event.id,
          tenant,
          event.event_type,
          event.aggregate_type,
          event.aggregate_reference,
          event.payload,
        ],
      );
      await client.query(
        `UPDATE outbox_events SET publication_state='PUBLISHED',published_at=transaction_timestamp(),
         attempt_count=attempt_count+1 WHERE id=$1`,
        [event.id],
      );
    }
    await client.query('COMMIT');
    return found.rows.length;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function workOnce(): Promise<void> {
  if (workerType === 'ALL' || workerType === 'BATCH') {
    const reference = referenceFor('BATCH');
    await runtime.heartbeat.record({ state: 'READY', type: 'BATCH', workerReference: reference });
    const job = await runtime.batchJobs.claim(reference);
    if (job !== null) {
      try {
        await runtime.batchWorker.processUntilSettled(job.batchId, reference);
        await runtime.batchJobs.complete(job.batchId, reference);
      } catch {
        await runtime.batchJobs.fail(job.batchId, reference, 'BATCH_PROCESSING_FAILED', 2);
      }
    }
  }
  if (workerType === 'ALL' || workerType === 'OUTBOX') {
    await runtime.heartbeat.record({
      state: 'READY',
      type: 'OUTBOX',
      workerReference: referenceFor('OUTBOX'),
    });
    await publishOutbox();
  }
  if (workerType === 'ALL' || workerType === 'NOTIFICATION') {
    await runtime.heartbeat.record({
      state: 'READY',
      type: 'NOTIFICATION',
      workerReference: referenceFor('NOTIFICATION'),
    });
    await runtime.dependencies.notificationWorker.processOne(new Date().toISOString());
  }
  if (workerType === 'ALL' || workerType === 'PILOT') {
    const reference = referenceFor('PILOT');
    await runtime.heartbeat.record({ state: 'READY', type: 'PILOT', workerReference: reference });
    const pilotJob = await runtime.pilotWorker.claim(reference);
    if (pilotJob !== null) {
      await runtime.pilotWorker.complete(pilotJob.jobReference, reference, {
        ...pilotJob.checkpoint,
        processedAt: new Date().toISOString(),
      });
    }
  }
}

function selectedTypes(): readonly ('BATCH' | 'NOTIFICATION' | 'OUTBOX' | 'PILOT')[] {
  return workerType === 'ALL'
    ? ['BATCH', 'OUTBOX', 'NOTIFICATION', 'PILOT']
    : [workerType as 'BATCH' | 'NOTIFICATION' | 'OUTBOX' | 'PILOT'];
}

async function recordState(state: 'DEGRADED' | 'STOPPING', problemCode?: string): Promise<void> {
  await Promise.all(
    selectedTypes().map((type) =>
      runtime.heartbeat.record({
        problemCode: problemCode ?? null,
        state,
        type,
        workerReference: referenceFor(type),
      }),
    ),
  );
}

async function loop(): Promise<void> {
  while (!stopping) {
    try {
      await workOnce();
    } catch (error) {
      const problemCode = error instanceof Error ? error.name : 'UNKNOWN_WORKER_ERROR';
      process.stderr.write(`worker_iteration_failed=${problemCode}\n`);
      await recordState('DEGRADED', problemCode).catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMilliseconds));
  }
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await recordState('STOPPING').catch(() => undefined);
  await pool.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
await loop();
