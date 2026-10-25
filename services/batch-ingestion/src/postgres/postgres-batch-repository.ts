import { BatchIdempotencyConflictError, BatchPersistenceError } from '../errors.js';
import {
  CURRENT_TEMPLATE_VERSION,
  type AdmissionRowInput,
  type BatchFinding,
  type BatchReceipt,
  type BatchRowResult,
  type BatchRowStatus,
  type BatchStatus,
  type BatchSummary,
  type BatchTotals,
  type ClaimedBatchRow,
  type CompletedBatchRow,
  type ParsedBatchRow,
  type RowResultFinding,
} from '../model.js';
import type {
  BatchFindingInput,
  BatchRepositoryPort,
  RegisterBatchInput,
  RegisterBatchResult,
} from '../ports.js';
import type { Pool, PoolClient } from 'pg';

interface BatchRowDb {
  readonly id: string;
  readonly batch_id: string;
  readonly row_number: number;
  readonly record_key: string;
  readonly status: BatchRowStatus;
  readonly payload: AdmissionRowInput;
  readonly attempt_count: number;
  readonly actor_reference: string;
  readonly reason: string;
  readonly request_reference: string;
  readonly admission_reference: string | null;
  readonly decision_id: string | null;
  readonly safe_values: Readonly<Record<string, string>>;
}

interface BatchDb {
  readonly id: string;
  readonly receipt_reference: string;
  readonly received_at: Date;
  readonly source_sha256: string;
  readonly status: BatchStatus;
  readonly template_version: string;
}

interface TotalsDb {
  readonly accepted_rows: number;
  readonly failed_final_rows: number;
  readonly invalid_rows: number;
  readonly manual_review_rows: number;
  readonly pending_rows: number;
  readonly rejected_rows: number;
  readonly retryable_rows: number;
  readonly total_rows: number;
}

const RETRYABLE_CODES = new Set(['40001', '40P01']);

function errorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
}

function receipt(row: BatchDb, replayed: boolean): BatchReceipt {
  if (row.template_version !== CURRENT_TEMPLATE_VERSION) {
    throw new BatchPersistenceError('Stored batch uses an unsupported template version.');
  }
  return {
    batchId: row.id,
    receiptReference: row.receipt_reference,
    receivedAt: row.received_at.toISOString(),
    replayed,
    sha256: row.source_sha256,
    status: 'RECEIVED',
    templateVersion: CURRENT_TEMPLATE_VERSION,
  };
}

function totals(row: TotalsDb | undefined): BatchTotals {
  return {
    accepted: row?.accepted_rows ?? 0,
    failedFinal: row?.failed_final_rows ?? 0,
    invalid: row?.invalid_rows ?? 0,
    manualReview: row?.manual_review_rows ?? 0,
    pending: row?.pending_rows ?? 0,
    rejected: row?.rejected_rows ?? 0,
    retryable: row?.retryable_rows ?? 0,
    total: row?.total_rows ?? 0,
  };
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

export class PostgresBatchRepository implements BatchRepositoryPort {
  public constructor(private readonly pool: Pool) {}

  public async register(input: RegisterBatchInput): Promise<RegisterBatchResult> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const existingRequest = await client.query<BatchDb & { request_hash: string }>(
          `SELECT b.*, r.request_hash
           FROM batch_upload_requests r JOIN admission_batches b ON b.id = r.batch_id
           WHERE r.institution_id = $1 AND r.idempotency_key = $2 FOR UPDATE OF r`,
          [input.institutionId, input.idempotencyKey],
        );
        const request = existingRequest.rows[0];
        if (request !== undefined) {
          if (request.request_hash !== input.requestHash) throw new BatchIdempotencyConflictError();
          await client.query('COMMIT');
          return { receipt: receipt(request, true), shouldProcess: false };
        }

        const existingDigest = await client.query<BatchDb>(
          `SELECT * FROM admission_batches
           WHERE institution_id = $1 AND template_version = $2 AND source_sha256 = $3
           FOR UPDATE`,
          [input.institutionId, input.templateVersion, input.source.sha256],
        );
        const digestBatch = existingDigest.rows[0];
        if (digestBatch !== undefined) {
          await this.insertRequest(client, input, digestBatch.id);
          await client.query('COMMIT');
          return { receipt: receipt(digestBatch, true), shouldProcess: false };
        }

        const inserted = await client.query<BatchDb>(
          `INSERT INTO admission_batches (
             id, institution_id, receipt_reference, template_version, source_sha256,
             source_object_reference, source_filename, source_content_type, source_byte_size,
             status, actor_reference, reason, request_reference, received_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECEIVED',$10,$11,$12,$13,$13)
           RETURNING *`,
          [
            input.batchId,
            input.institutionId,
            input.receiptReference,
            input.templateVersion,
            input.source.sha256,
            input.source.objectReference,
            input.source.originalFilename,
            input.source.contentType,
            input.source.byteSize,
            input.actorReference,
            input.reason,
            input.requestReference,
            input.receivedAt,
          ],
        );
        const batch = inserted.rows[0];
        if (batch === undefined) throw new BatchPersistenceError('Batch receipt was not inserted.');
        await this.insertRequest(client, input, batch.id);
        await client.query(
          `INSERT INTO batch_state_history (batch_id, previous_status, next_status, changed_at)
           VALUES ($1,NULL,'RECEIVED',$2)`,
          [batch.id, input.receivedAt],
        );
        await client.query(
          `INSERT INTO business_audit_events (
             id,event_type,aggregate_type,aggregate_reference,actor_reference,reason,
             correlation_reference,request_reference,details,created_at
           ) VALUES ($1,'ADMISSION_BATCH_RECEIVED','ADMISSION_BATCH',$2,$3,$4,$2,$5,$6,$7)`,
          [
            `AUDIT-${batch.id}-RECEIVED`,
            batch.id,
            input.actorReference,
            input.reason,
            input.requestReference,
            JSON.stringify({ sha256: input.source.sha256, templateVersion: input.templateVersion }),
            input.receivedAt,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events (id,event_type,aggregate_type,aggregate_reference,payload,created_at)
           VALUES ($1,'ADMISSION_BATCH_RECEIVED','ADMISSION_BATCH',$2,$3,$4)`,
          [
            `OUTBOX-${batch.id}-RECEIVED`,
            batch.id,
            JSON.stringify({ batchId: batch.id, receiptReference: batch.receipt_reference }),
            input.receivedAt,
          ],
        );
        await client.query('COMMIT');
        return { receipt: receipt(batch, false), shouldProcess: true };
      } catch (error) {
        await rollback(client);
        if (RETRYABLE_CODES.has(errorCode(error) ?? '') && attempt < 3) continue;
        throw error;
      } finally {
        client.release();
      }
    }
    throw new BatchPersistenceError('Batch registration retry limit was exhausted.');
  }

  private async insertRequest(
    client: PoolClient,
    input: RegisterBatchInput,
    batchId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO batch_upload_requests (
         id,institution_id,idempotency_key,request_hash,batch_id,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        `UPLOAD-${input.institutionId}-${input.idempotencyKey}`,
        input.institutionId,
        input.idempotencyKey,
        input.requestHash,
        batchId,
        input.receivedAt,
      ],
    );
  }

  public async transition(
    batchId: string,
    expected: BatchStatus,
    next: BatchStatus,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE admission_batches SET status = $1, updated_at = transaction_timestamp()
         WHERE id = $2 AND status = $3 RETURNING id`,
        [next, batchId, expected],
      );
      if (updated.rowCount !== 1) {
        throw new BatchPersistenceError(`Batch ${batchId} was not in ${expected}.`);
      }
      await client.query(
        `INSERT INTO batch_state_history (batch_id,previous_status,next_status)
         VALUES ($1,$2,$3)`,
        [batchId, expected, next],
      );
      await client.query('COMMIT');
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async failBatch(batchId: string, findings: readonly BatchFinding[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ status: BatchStatus }>(
        'SELECT status FROM admission_batches WHERE id = $1 FOR UPDATE',
        [batchId],
      );
      const status = current.rows[0]?.status;
      if (status === undefined) throw new BatchPersistenceError('Batch was not found.');
      for (const item of findings) {
        await client.query(
          `INSERT INTO batch_findings (batch_id,code,severity,field_path,message)
           VALUES ($1,$2,$3,$4,$5)`,
          [batchId, item.code, item.severity, item.field, item.message],
        );
      }
      await client.query(
        `UPDATE admission_batches SET status='FAILED', updated_at=transaction_timestamp() WHERE id=$1`,
        [batchId],
      );
      await client.query(
        `INSERT INTO batch_state_history (batch_id,previous_status,next_status)
         VALUES ($1,$2,'FAILED')`,
        [batchId, status],
      );
      await client.query('COMMIT');
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async saveRows(batchId: string, rows: readonly ParsedBatchRow[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const rowId = `${batchId}-ROW-${String(row.rowNumber)}`;
        const status: BatchRowStatus = row.input === null ? 'INVALID' : 'VALID';
        await client.query(
          `INSERT INTO batch_rows (
             id,batch_id,row_number,record_key,status,payload,safe_values
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            rowId,
            batchId,
            row.rowNumber,
            row.recordKey,
            status,
            row.input === null ? null : JSON.stringify(row.input),
            JSON.stringify(row.safeValues),
          ],
        );
        for (const item of row.findings) {
          await client.query(
            `INSERT INTO batch_row_findings (batch_row_id,code,severity,field_path,message)
             VALUES ($1,$2,$3,$4,$5)`,
            [rowId, item.code, item.severity, item.field, item.message],
          );
        }
      }
      const next: BatchStatus = rows.some(({ input }) => input !== null)
        ? 'PROCESSING'
        : 'NEEDS_ACTION';
      const updated = await client.query(
        `UPDATE admission_batches SET status=$1, updated_at=transaction_timestamp()
         WHERE id=$2 AND status='VALIDATING'`,
        [next, batchId],
      );
      if (updated.rowCount !== 1) throw new BatchPersistenceError('Batch is not validating.');
      await client.query(
        `INSERT INTO batch_state_history (batch_id,previous_status,next_status)
         VALUES ($1,'VALIDATING',$2)`,
        [batchId, next],
      );
      await client.query('COMMIT');
      await this.reconcile(batchId);
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async claimRows(
    batchId: string,
    workerId: string,
    limit: number,
    leasedUntil: string,
  ): Promise<readonly ClaimedBatchRow[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE batch_processing_attempts a
         SET finished_at=transaction_timestamp(), outcome='FAILED_RETRYABLE'
         FROM batch_rows r
         WHERE a.batch_row_id=r.id AND a.attempt_number=r.attempt_count AND a.finished_at IS NULL
           AND r.batch_id=$1 AND r.status='PROCESSING' AND r.leased_until < transaction_timestamp()
           AND r.attempt_count < 3`,
        [batchId],
      );
      await client.query(
        `UPDATE batch_rows SET status='FAILED_RETRYABLE', leased_by=NULL, leased_until=NULL
         WHERE batch_id=$1 AND status='PROCESSING' AND leased_until < transaction_timestamp()
           AND attempt_count < 3`,
        [batchId],
      );
      await client.query(
        `UPDATE batch_processing_attempts a
         SET finished_at=transaction_timestamp(), outcome='FAILED_FINAL'
         FROM batch_rows r
         WHERE a.batch_row_id=r.id AND a.attempt_number=r.attempt_count AND a.finished_at IS NULL
           AND r.batch_id=$1 AND r.status='PROCESSING' AND r.leased_until < transaction_timestamp()
           AND r.attempt_count >= 3`,
        [batchId],
      );
      await client.query(
        `UPDATE batch_rows SET status='FAILED_FINAL', leased_by=NULL, leased_until=NULL,
           completed_at=transaction_timestamp()
         WHERE batch_id=$1 AND status='PROCESSING' AND leased_until < transaction_timestamp()
           AND attempt_count >= 3`,
        [batchId],
      );

      const claimed = await client.query<BatchRowDb>(
        `WITH candidates AS (
           SELECT r.id FROM batch_rows r
           WHERE r.batch_id=$1 AND r.status IN ('VALID','FAILED_RETRYABLE') AND r.attempt_count < 3
           ORDER BY r.row_number
           FOR UPDATE SKIP LOCKED LIMIT $2
         )
         UPDATE batch_rows r
         SET status='PROCESSING', attempt_count=r.attempt_count+1,
             leased_by=$3, leased_until=$4
         FROM candidates c, admission_batches b
         WHERE r.id=c.id AND b.id=r.batch_id
         RETURNING r.*, b.actor_reference, b.reason, b.request_reference`,
        [batchId, limit, workerId, leasedUntil],
      );
      for (const row of claimed.rows) {
        await client.query(
          `INSERT INTO batch_processing_attempts (
             batch_row_id,attempt_number,worker_reference
           ) VALUES ($1,$2,$3)`,
          [row.id, row.attempt_count, workerId],
        );
      }
      await client.query('COMMIT');
      return claimed.rows.map((row) => ({
        actorReference: row.actor_reference,
        attemptCount: row.attempt_count,
        batchId: row.batch_id,
        input: row.payload,
        reason: row.reason,
        requestReference: row.request_reference,
        rowId: row.id,
        rowNumber: row.row_number,
      }));
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async completeRow(
    rowId: string,
    workerId: string,
    completed: CompletedBatchRow,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ attempt_count: number }>(
        `UPDATE batch_rows SET status=$1, leased_by=NULL, leased_until=NULL,
           admission_id=$2, decision_id=$3, admission_reference=$4,
           completed_at=transaction_timestamp()
         WHERE id=$5 AND status='PROCESSING' AND leased_by=$6
         RETURNING attempt_count`,
        [
          completed.outcome,
          completed.admissionId,
          completed.decisionId,
          completed.admissionReference,
          rowId,
          workerId,
        ],
      );
      const attempt = updated.rows[0]?.attempt_count;
      if (attempt === undefined)
        throw new BatchPersistenceError('The worker does not own this row.');
      for (const item of completed.findings) {
        await client.query(
          `INSERT INTO batch_row_findings (batch_row_id,code,severity,field_path,message)
           VALUES ($1,$2,$3,$4,$5)`,
          [rowId, item.code, item.severity, item.field, item.message],
        );
      }
      await client.query(
        `UPDATE batch_processing_attempts SET finished_at=transaction_timestamp(), outcome=$1
         WHERE batch_row_id=$2 AND attempt_number=$3`,
        [completed.outcome, rowId, attempt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async deferRow(
    rowId: string,
    workerId: string,
    item: BatchFindingInput,
    retryable: boolean,
  ): Promise<void> {
    const client = await this.pool.connect();
    const status: BatchRowStatus = retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL';
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ attempt_count: number }>(
        `UPDATE batch_rows SET status=$1, leased_by=NULL, leased_until=NULL,
           completed_at=CASE WHEN $1='FAILED_FINAL' THEN transaction_timestamp() ELSE NULL END
         WHERE id=$2 AND status='PROCESSING' AND leased_by=$3 RETURNING attempt_count`,
        [status, rowId, workerId],
      );
      const attempt = updated.rows[0]?.attempt_count;
      if (attempt === undefined)
        throw new BatchPersistenceError('The worker does not own this row.');
      await client.query(
        `INSERT INTO batch_row_findings (batch_row_id,code,severity,field_path,message)
         VALUES ($1,$2,'ERROR',NULL,$3)`,
        [rowId, item.code, item.message],
      );
      await client.query(
        `UPDATE batch_processing_attempts SET finished_at=transaction_timestamp(), outcome=$1
         WHERE batch_row_id=$2 AND attempt_number=$3`,
        [status, rowId, attempt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async reconcile(batchId: string): Promise<BatchSummary> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const batchResult = await client.query<BatchDb>(
        'SELECT * FROM admission_batches WHERE id=$1 FOR UPDATE',
        [batchId],
      );
      const batch = batchResult.rows[0];
      if (batch === undefined) throw new BatchPersistenceError('Batch was not found.');
      const result = await client.query<TotalsDb>(
        `SELECT
           count(*)::int AS total_rows,
           count(*) FILTER (WHERE status='ACCEPTED')::int AS accepted_rows,
           count(*) FILTER (WHERE status='REJECTED')::int AS rejected_rows,
           count(*) FILTER (WHERE status='MANUAL_REVIEW')::int AS manual_review_rows,
           count(*) FILTER (WHERE status='INVALID')::int AS invalid_rows,
           count(*) FILTER (WHERE status='FAILED_RETRYABLE')::int AS retryable_rows,
           count(*) FILTER (WHERE status='FAILED_FINAL')::int AS failed_final_rows,
           count(*) FILTER (WHERE status IN ('RECEIVED','VALID','PROCESSING'))::int AS pending_rows
         FROM batch_rows WHERE batch_id=$1`,
        [batchId],
      );
      const row = result.rows[0];
      if (row === undefined)
        throw new BatchPersistenceError('Batch totals could not be calculated.');
      const next: BatchStatus =
        batch.status === 'FAILED'
          ? 'FAILED'
          : row.pending_rows > 0 || row.retryable_rows > 0
            ? 'PROCESSING'
            : row.invalid_rows +
                  row.rejected_rows +
                  row.manual_review_rows +
                  row.failed_final_rows >
                0
              ? 'NEEDS_ACTION'
              : 'COMPLETED';
      await client.query(
        `INSERT INTO batch_reconciliations (
           batch_id,total_rows,accepted_rows,rejected_rows,manual_review_rows,invalid_rows,
           retryable_rows,failed_final_rows,pending_rows,reconciled_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,transaction_timestamp())
         ON CONFLICT (batch_id) DO UPDATE SET
           total_rows=EXCLUDED.total_rows, accepted_rows=EXCLUDED.accepted_rows,
           rejected_rows=EXCLUDED.rejected_rows, manual_review_rows=EXCLUDED.manual_review_rows,
           invalid_rows=EXCLUDED.invalid_rows, retryable_rows=EXCLUDED.retryable_rows,
           failed_final_rows=EXCLUDED.failed_final_rows, pending_rows=EXCLUDED.pending_rows,
           reconciled_at=EXCLUDED.reconciled_at`,
        [
          batchId,
          row.total_rows,
          row.accepted_rows,
          row.rejected_rows,
          row.manual_review_rows,
          row.invalid_rows,
          row.retryable_rows,
          row.failed_final_rows,
          row.pending_rows,
        ],
      );
      if (next !== batch.status) {
        await client.query(
          'UPDATE admission_batches SET status=$1,updated_at=transaction_timestamp() WHERE id=$2',
          [next, batchId],
        );
        await client.query(
          'INSERT INTO batch_state_history (batch_id,previous_status,next_status) VALUES ($1,$2,$3)',
          [batchId, batch.status, next],
        );
      }
      await client.query('COMMIT');
      return { ...receipt({ ...batch, status: next }, false), status: next, totals: totals(row) };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async getSummary(batchId: string): Promise<BatchSummary | null> {
    const exists = await this.pool.query<{ readonly found: boolean }>(
      'SELECT true AS found FROM admission_batches WHERE id=$1',
      [batchId],
    );
    return exists.rows[0]?.found === true ? this.reconcile(batchId) : null;
  }

  public async listRows(batchId: string): Promise<readonly BatchRowResult[]> {
    const rows = await this.pool.query<BatchRowDb>(
      `SELECT r.*, b.actor_reference, b.reason, b.request_reference
       FROM batch_rows r JOIN admission_batches b ON b.id=r.batch_id
       WHERE r.batch_id=$1 ORDER BY r.row_number`,
      [batchId],
    );
    const findings = await this.pool.query<
      RowResultFinding & { readonly batch_row_id: string; readonly field_path: string | null }
    >(
      `SELECT batch_row_id,code,severity,field_path,message
       FROM batch_row_findings WHERE batch_row_id IN
         (SELECT id FROM batch_rows WHERE batch_id=$1)
       ORDER BY id`,
      [batchId],
    );
    const byRow = new Map<string, RowResultFinding[]>();
    for (const item of findings.rows) {
      const collection = byRow.get(item.batch_row_id) ?? [];
      collection.push({
        code: item.code,
        field: item.field_path,
        message: item.message,
        severity: item.severity,
      });
      byRow.set(item.batch_row_id, collection);
    }
    return rows.rows.map((row) => ({
      admissionReference: row.admission_reference,
      attemptCount: row.attempt_count,
      decisionReference: row.decision_id,
      findings: byRow.get(row.id) ?? [],
      recordKey: row.record_key,
      rowNumber: row.row_number,
      status: row.status,
    }));
  }

  public async correctionRows(batchId: string): Promise<readonly ParsedBatchRow[]> {
    const rows = await this.pool.query<BatchRowDb>(
      `SELECT r.*, b.actor_reference, b.reason, b.request_reference
       FROM batch_rows r JOIN admission_batches b ON b.id=r.batch_id
       WHERE r.batch_id=$1 AND r.status IN ('INVALID','REJECTED','MANUAL_REVIEW','FAILED_FINAL')
       ORDER BY r.row_number`,
      [batchId],
    );
    const allResults = await this.listRows(batchId);
    const resultByNumber = new Map(allResults.map((row) => [row.rowNumber, row]));
    return rows.rows.map((row) => ({
      findings: (resultByNumber.get(row.row_number)?.findings ?? []).map((item) => ({
        code: item.code as BatchFinding['code'],
        field: item.field,
        message: item.message,
        severity:
          item.severity === 'REVIEW' || item.severity === 'WARNING' ? item.severity : 'ERROR',
      })),
      input: row.payload,
      recordKey: row.record_key,
      rowNumber: row.row_number,
      safeValues: row.safe_values,
    }));
  }
}
