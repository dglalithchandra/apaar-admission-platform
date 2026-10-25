import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import {
  asAdmissionCommandId,
  type AdmissionPolicyDecision,
} from '@apaar-platform/admission-domain';
import { BatchValidationError } from './errors.js';
import { correctionCsv, parseAdmissionCsv, templateCsv } from './csv-template.js';
import {
  CURRENT_TEMPLATE_VERSION,
  MAX_PROCESSING_ATTEMPTS,
  MAX_UPLOAD_BYTES,
  type BatchFinding,
  type BatchReceipt,
  type BatchRowResult,
  type BatchSummary,
  type ClaimedBatchRow,
  type CreateBatchCommand,
} from './model.js';
import type {
  AcademicIdentityVerifierPort,
  AdmissionSubmissionPort,
  BatchClock,
  BatchReferenceGenerator,
  BatchRepositoryPort,
  MalwareScannerPort,
  ObjectStoragePort,
} from './ports.js';

interface CreateBatchDependencies {
  readonly clock: BatchClock;
  readonly references: BatchReferenceGenerator;
  readonly repository: BatchRepositoryPort;
  readonly scanner: MalwareScannerPort;
  readonly storage: ObjectStoragePort;
}

interface WorkerDependencies {
  readonly admissions: AdmissionSubmissionPort;
  readonly clock: BatchClock;
  readonly identity: AcademicIdentityVerifierPort;
  readonly repository: BatchRepositoryPort;
}

function fileFinding(
  code: BatchFinding['code'],
  message: string,
  field: string | null = null,
): BatchFinding {
  return { code, field, message, severity: 'ERROR' };
}

async function collectUpload(content: AsyncIterable<Buffer | string>): Promise<{
  readonly chunks: readonly Buffer[];
  readonly bytes: number;
  readonly sha256: string;
}> {
  const chunks: Buffer[] = [];
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const value of content) {
    const chunk = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    bytes += chunk.byteLength;
    if (bytes > MAX_UPLOAD_BYTES) {
      throw new BatchValidationError('The CSV exceeds the upload limit.', [
        fileFinding(
          'BATCH_FILE_TOO_LARGE',
          `The upload exceeds ${String(MAX_UPLOAD_BYTES)} bytes.`,
        ),
      ]);
    }
    hash.update(chunk);
    chunks.push(chunk);
  }
  return { bytes, chunks, sha256: hash.digest('hex') };
}

function requestHash(command: CreateBatchCommand, sha256: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        institutionId: command.institutionId,
        originalFilename: command.originalFilename,
        sha256,
        templateVersion: command.templateVersion,
      }),
    )
    .digest('hex');
}

export class CreateBatchService {
  public constructor(private readonly dependencies: CreateBatchDependencies) {}

  public async execute(command: CreateBatchCommand): Promise<BatchReceipt> {
    if (command.contentType.toLowerCase().split(';')[0] !== 'text/csv') {
      throw new BatchValidationError('Only CSV uploads are supported.', [
        fileFinding('BATCH_UNSUPPORTED_MEDIA_TYPE', 'The upload content type must be text/csv.'),
      ]);
    }
    if (
      command.originalFilename !== basename(command.originalFilename) ||
      !command.originalFilename.toLowerCase().endsWith('.csv')
    ) {
      throw new BatchValidationError('The filename is not safe.', [
        fileFinding('BATCH_FILENAME_INVALID', 'Use a plain filename ending in .csv.'),
      ]);
    }
    if (command.templateVersion !== CURRENT_TEMPLATE_VERSION) {
      throw new BatchValidationError('The template version is unsupported.', [
        fileFinding(
          'TEMPLATE_VERSION_UNSUPPORTED',
          `Only template ${CURRENT_TEMPLATE_VERSION} is supported.`,
          'templateVersion',
        ),
      ]);
    }
    if (command.idempotencyKey.length < 8 || command.idempotencyKey.length > 128) {
      throw new TypeError('The upload idempotency key must contain 8 to 128 characters.');
    }

    const upload = await collectUpload(command.content);
    const batchId = this.dependencies.references.next('BATCH');
    const objectReference = this.dependencies.references.next('OBJECT');
    const receivedAt = this.dependencies.clock.now();
    await this.dependencies.storage.put(objectReference, upload.chunks, {
      contentType: 'text/csv',
      sha256: upload.sha256,
    });
    const registration = await this.dependencies.repository.register({
      actorReference: command.actorReference,
      batchId,
      idempotencyKey: command.idempotencyKey,
      institutionId: command.institutionId,
      reason: command.reason,
      receiptReference: this.dependencies.references.next('RECEIPT'),
      receivedAt,
      requestHash: requestHash(command, upload.sha256),
      requestReference: command.requestReference,
      source: {
        byteSize: upload.bytes,
        contentType: 'text/csv',
        objectReference,
        originalFilename: command.originalFilename,
        sha256: upload.sha256,
      },
      templateVersion: command.templateVersion,
    });
    if (!registration.shouldProcess) return registration.receipt;

    await this.dependencies.repository.transition(batchId, 'RECEIVED', 'SCANNING');
    const scan = await this.dependencies.scanner.scan(upload.chunks);
    if (scan !== 'CLEAN') {
      await this.dependencies.repository.failBatch(batchId, [
        fileFinding(
          scan === 'INFECTED' ? 'BATCH_MALWARE_DETECTED' : 'BATCH_SCANNER_UNAVAILABLE',
          scan === 'INFECTED'
            ? 'The upload was rejected by the malware scanner.'
            : 'The malware scanner is unavailable; the file was not processed.',
        ),
      ]);
      return registration.receipt;
    }

    await this.dependencies.repository.transition(batchId, 'SCANNING', 'VALIDATING');
    try {
      const parsed = await parseAdmissionCsv(Readable.from(upload.chunks));
      if (parsed.sha256 !== upload.sha256 || parsed.totalBytes !== upload.bytes) {
        throw new Error('Stored upload digest or length changed before validation.');
      }
      await this.dependencies.repository.saveRows(batchId, parsed.rows);
    } catch (error) {
      if (error instanceof BatchValidationError) {
        await this.dependencies.repository.failBatch(batchId, error.findings);
        return registration.receipt;
      }
      throw error;
    }
    return registration.receipt;
  }
}

function decisionFindings(
  decision: AdmissionPolicyDecision,
): readonly { code: string; field: null; message: string; severity: string }[] {
  return decision.findings.map((item) => ({
    code: item.code,
    field: null,
    message: item.message,
    severity: item.severity,
  }));
}

function admissionHash(row: ClaimedBatchRow, identityStatus: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ batchId: row.batchId, input: row.input, identityStatus }))
    .digest('hex');
}

export class BatchWorker {
  public constructor(private readonly dependencies: WorkerDependencies) {}

  public async processNext(batchId: string, workerId: string, limit = 25): Promise<number> {
    const now = new Date(this.dependencies.clock.now());
    const leasedUntil = new Date(now.getTime() + 60_000).toISOString();
    const rows = await this.dependencies.repository.claimRows(
      batchId,
      workerId,
      limit,
      leasedUntil,
    );
    for (const row of rows) await this.processRow(row, workerId);
    await this.dependencies.repository.reconcile(batchId);
    return rows.length;
  }

  public async processUntilSettled(batchId: string, workerId: string): Promise<BatchSummary> {
    while ((await this.processNext(batchId, workerId)) > 0) {
      // Each iteration claims a bounded set; retryable provider results are retried at most three times.
    }
    return this.dependencies.repository.reconcile(batchId);
  }

  private async processRow(row: ClaimedBatchRow, workerId: string): Promise<void> {
    try {
      const identity = await this.dependencies.identity.verify({
        academicIdentityReference: row.input.academicIdentityReference,
        correlationReference: `${row.batchId}-${String(row.rowNumber)}`,
        studentKey: row.input.studentKey,
      });
      const transient =
        identity.status === 'RATE_LIMITED' || identity.status === 'TEMPORARILY_UNAVAILABLE';
      if (transient && row.attemptCount < MAX_PROCESSING_ATTEMPTS) {
        await this.dependencies.repository.deferRow(
          row.rowId,
          workerId,
          {
            code: 'IDENTITY_PROVIDER_RETRYABLE',
            message: 'Identity verification is temporarily unavailable and will be retried.',
          },
          true,
        );
        return;
      }

      const stable = createHash('sha256')
        .update(`${row.batchId}:${row.input.recordKey}`)
        .digest('hex');
      const result = await this.dependencies.admissions.execute({
        admission: {
          academicYear: row.input.academicYear,
          admissionDate: row.input.admissionDate,
          campusId: row.input.campusId,
          category: row.input.category,
          commandId: asAdmissionCommandId(`BATCH-${stable}`),
          courseId: row.input.courseId,
          eligibilityEvidence: row.input.eligibilityEvidence,
          identityVerification: identity,
          institutionId: row.input.institutionId,
          lateralCapacitySource: row.input.lateralCapacitySource,
          lifecycleStatus: 'DRAFT',
          programmeId: row.input.programmeId,
          studentKey: row.input.studentKey,
          studentStatus: row.input.studentStatus,
        },
        context: {
          actorReference: row.actorReference,
          correlationReference: `${row.batchId}-${String(row.rowNumber)}`,
          idempotencyKey: `ROW-${stable}`,
          institutionId: row.input.institutionId,
          reason: row.reason,
          requestHash: admissionHash(row, identity.status),
          requestReference: `${row.requestReference}-ROW-${String(row.rowNumber)}`,
        },
      });
      const outcome =
        result.decision.outcome === 'ACCEPT'
          ? 'ACCEPTED'
          : result.decision.outcome === 'REJECT'
            ? 'REJECTED'
            : 'MANUAL_REVIEW';
      await this.dependencies.repository.completeRow(row.rowId, workerId, {
        admissionId: result.admissionId,
        admissionReference: result.admissionReference,
        decisionId: result.decisionId,
        findings: decisionFindings(result.decision),
        outcome,
      });
    } catch {
      const retryable = row.attemptCount < MAX_PROCESSING_ATTEMPTS;
      await this.dependencies.repository.deferRow(
        row.rowId,
        workerId,
        {
          code: retryable ? 'IDENTITY_PROVIDER_RETRYABLE' : 'PROCESSING_RETRY_EXHAUSTED',
          message: retryable
            ? 'Processing failed without a partial commit and will be retried.'
            : 'Processing failed after the maximum number of attempts.',
        },
        retryable,
      );
    }
  }
}

export class BatchQueryService {
  public constructor(private readonly repository: BatchRepositoryPort) {}

  public getSummary(batchId: string): Promise<BatchSummary | null> {
    return this.repository.getSummary(batchId);
  }

  public listRows(batchId: string): Promise<readonly BatchRowResult[]> {
    return this.repository.listRows(batchId);
  }

  public async correctionCsv(batchId: string): Promise<string> {
    return correctionCsv(await this.repository.correctionRows(batchId));
  }

  public templateCsv(): string {
    return templateCsv();
  }
}
