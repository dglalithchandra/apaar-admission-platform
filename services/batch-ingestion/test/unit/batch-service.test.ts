import type { AdmissionSubmissionResult } from '@apaar-platform/admission-application';
import { asApprovalSnapshotId, asIsoDateTime } from '@apaar-platform/admission-domain';
import { describe, expect, it, vi } from 'vitest';
import { BatchQueryService, BatchWorker, CreateBatchService } from '../../src/batch-service.js';
import { BatchValidationError } from '../../src/errors.js';
import {
  CURRENT_TEMPLATE_VERSION,
  MAX_UPLOAD_BYTES,
  type BatchReceipt,
  type BatchSummary,
} from '../../src/model.js';
import type {
  AcademicIdentityVerifierPort,
  AdmissionSubmissionPort,
  BatchRepositoryPort,
} from '../../src/ports.js';
import {
  DeterministicAcademicIdentityVerifier,
  DeterministicMalwareScanner,
  InMemoryObjectStorage,
} from '../../src/simulators.js';
import { admissionRow, csvFile, csvRow, SyntheticBatchReferences } from '../fixtures.js';

const receipt: BatchReceipt = {
  batchId: 'SYNTH-BATCH-0001',
  receiptReference: 'SYNTH-RECEIPT-0001',
  receivedAt: '2026-08-01T09:00:00.000Z',
  replayed: false,
  sha256: 'a'.repeat(64),
  status: 'RECEIVED',
  templateVersion: CURRENT_TEMPLATE_VERSION,
};

const summary: BatchSummary = {
  ...receipt,
  status: 'COMPLETED',
  totals: {
    accepted: 1,
    failedFinal: 0,
    invalid: 0,
    manualReview: 0,
    pending: 0,
    rejected: 0,
    retryable: 0,
    total: 1,
  },
};

function repository(overrides: Partial<BatchRepositoryPort> = {}): BatchRepositoryPort {
  return {
    claimRows: async () => [],
    completeRow: async () => undefined,
    correctionRows: async () => [],
    deferRow: async () => undefined,
    failBatch: async () => undefined,
    getSummary: async () => summary,
    listRows: async () => [],
    reconcile: async () => summary,
    register: async () => ({ receipt, shouldProcess: true }),
    saveRows: async () => undefined,
    transition: async () => undefined,
    ...overrides,
  };
}

function command(csv = csvFile(csvRow('0001'))) {
  return {
    actorReference: 'SYNTH-ACTOR-0001',
    content: (async function* (): AsyncGenerator<string> {
      yield csv;
    })(),
    contentType: 'text/csv; charset=utf-8',
    idempotencyKey: 'SYNTH-UPLOAD-KEY-0001',
    institutionId: 'SYNTH-INST-0001',
    originalFilename: 'synthetic-admissions.csv',
    reason: 'SYNTHETIC_BATCH_UPLOAD',
    requestReference: 'SYNTH-REQUEST-0001',
    templateVersion: CURRENT_TEMPLATE_VERSION,
  };
}

function acceptedResult(): AdmissionSubmissionResult {
  return {
    admissionId: 'SYNTH-ADMISSION-0001',
    admissionReference: 'SYNTH-REGISTRATION-0001',
    decision: {
      approvalSnapshotId: asApprovalSnapshotId('SYNTH-APPROVAL-0001'),
      evaluatedAt: asIsoDateTime('2026-08-01T09:00:00.000Z'),
      findings: [],
      outcome: 'ACCEPT',
      reservation: { bucket: 'ORDINARY', subcategory: 'ORDINARY', units: 1 },
      rulesetVersion: 'SYNTH-POLICY-2026',
      targetLifecycleStatus: 'ACCEPTED',
    },
    decisionId: 'SYNTH-DECISION-0001',
    replayed: false,
  };
}

describe('CreateBatchService', () => {
  it('stores, scans, parses and persists a valid versioned upload', async () => {
    const transitions: string[] = [];
    let saved = 0;
    const storage = new InMemoryObjectStorage();
    const service = new CreateBatchService({
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      references: new SyntheticBatchReferences(),
      repository: repository({
        saveRows: async (_batchId, rows) => {
          saved = rows.length;
        },
        transition: async (_batchId, _expected, next) => {
          transitions.push(next);
        },
      }),
      scanner: new DeterministicMalwareScanner(),
      storage,
    });

    await expect(service.execute(command())).resolves.toEqual(receipt);
    expect(transitions).toEqual(['SCANNING', 'VALIDATING']);
    expect(saved).toBe(1);
    expect(storage.objects.size).toBe(1);
  });

  it('returns an existing receipt without rescanning an identical replay', async () => {
    const scanner = { scan: vi.fn(async () => 'CLEAN' as const) };
    const service = new CreateBatchService({
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      references: new SyntheticBatchReferences(),
      repository: repository({
        register: async () => ({ receipt: { ...receipt, replayed: true }, shouldProcess: false }),
      }),
      scanner,
      storage: new InMemoryObjectStorage(),
    });
    await expect(service.execute(command())).resolves.toMatchObject({ replayed: true });
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it.each([
    [{ contentType: 'application/json' }, 'BATCH_UNSUPPORTED_MEDIA_TYPE'],
    [{ originalFilename: '../unsafe.csv' }, 'BATCH_FILENAME_INVALID'],
    [{ templateVersion: '9.0' }, 'TEMPLATE_VERSION_UNSUPPORTED'],
  ])('rejects an unsafe request before registration', async (override, code) => {
    const service = new CreateBatchService({
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      references: new SyntheticBatchReferences(),
      repository: repository(),
      scanner: new DeterministicMalwareScanner(),
      storage: new InMemoryObjectStorage(),
    });
    const promise = service.execute({ ...command(), ...override });
    await expect(promise).rejects.toBeInstanceOf(BatchValidationError);
    await expect(promise).rejects.toMatchObject({ findings: [expect.objectContaining({ code })] });
  });

  it('records scanner rejection and file-level parser failure against the receipt', async () => {
    const failed: string[][] = [];
    const base = {
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      references: new SyntheticBatchReferences(),
      repository: repository({
        failBatch: async (_batchId, findings) => {
          failed.push(findings.map(({ code }) => code));
        },
      }),
      storage: new InMemoryObjectStorage(),
    };
    await new CreateBatchService({
      ...base,
      scanner: { scan: async () => 'INFECTED' },
    }).execute(command());
    await new CreateBatchService({
      ...base,
      scanner: new DeterministicMalwareScanner(),
    }).execute(command(''));
    await new CreateBatchService({
      ...base,
      scanner: { scan: async () => 'UNAVAILABLE' },
    }).execute(command());
    expect(failed).toEqual([
      ['BATCH_MALWARE_DETECTED'],
      ['BATCH_EMPTY'],
      ['BATCH_SCANNER_UNAVAILABLE'],
    ]);
  });

  it('bounds the upload before storage or registration', async () => {
    const service = new CreateBatchService({
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      references: new SyntheticBatchReferences(),
      repository: repository(),
      scanner: new DeterministicMalwareScanner(),
      storage: new InMemoryObjectStorage(),
    });
    const oversized = {
      ...command(),
      content: (async function* (): AsyncGenerator<Buffer> {
        yield Buffer.alloc(MAX_UPLOAD_BYTES + 1);
      })(),
    };
    await expect(service.execute(oversized)).rejects.toMatchObject({
      findings: [expect.objectContaining({ code: 'BATCH_FILE_TOO_LARGE' })],
    });
  });

  it('validates idempotency-key length', async () => {
    const service = new CreateBatchService({
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      references: new SyntheticBatchReferences(),
      repository: repository(),
      scanner: new DeterministicMalwareScanner(),
      storage: new InMemoryObjectStorage(),
    });
    await expect(service.execute({ ...command(), idempotencyKey: 'short' })).rejects.toThrow(
      '8 to 128',
    );
  });
});

describe('BatchWorker and queries', () => {
  it('submits claimed rows through the admission service and saves exact references', async () => {
    const complete = vi.fn(async () => undefined);
    let claims = 0;
    const repo = repository({
      claimRows: async () => {
        claims += 1;
        return claims === 1
          ? [
              {
                actorReference: 'SYNTH-ACTOR-0001',
                attemptCount: 1,
                batchId: 'SYNTH-BATCH-0001',
                input: admissionRow('0001'),
                reason: 'SYNTHETIC_UPLOAD',
                requestReference: 'SYNTH-REQUEST-0001',
                rowId: 'SYNTH-ROW-0001',
                rowNumber: 2,
              },
            ]
          : [];
      },
      completeRow: complete,
    });
    const admissions: AdmissionSubmissionPort = { execute: vi.fn(async () => acceptedResult()) };
    const worker = new BatchWorker({
      admissions,
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      identity: new DeterministicAcademicIdentityVerifier(),
      repository: repo,
    });

    await expect(worker.processUntilSettled('SYNTH-BATCH-0001', 'SYNTH-WORKER-0001')).resolves.toBe(
      summary,
    );
    expect(admissions.execute).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      'SYNTH-ROW-0001',
      'SYNTH-WORKER-0001',
      expect.objectContaining({
        admissionId: 'SYNTH-ADMISSION-0001',
        decisionId: 'SYNTH-DECISION-0001',
        outcome: 'ACCEPTED',
      }),
    );
  });

  it.each(['missing-key', 'missing-provenance'] as const)(
    'routes verified evidence with %s to manual review',
    async (missing) => {
      const execute = vi.fn(async () => acceptedResult());
      const canonical = await new DeterministicAcademicIdentityVerifier().verify({
        academicIdentityReference: 'SYNTH-IDENTITY-VERIFIED',
        correlationReference: 'SYNTH-CORRELATION',
        studentKey: admissionRow('0001').studentKey,
      });
      const { canonicalStudentKey: _key, ...withoutKey } = canonical;
      const identity: AcademicIdentityVerifierPort = {
        verify: async () =>
          missing === 'missing-key' ? withoutKey : { ...canonical, providerRequestReference: null },
      };
      await new BatchWorker({
        admissions: { execute },
        clock: { now: () => '2026-08-01T09:00:00.000Z' },
        identity,
        repository: repository({
          claimRows: async () => [
            {
              actorReference: 'SYNTH-ACTOR-0001',
              attemptCount: 1,
              batchId: 'SYNTH-BATCH-0001',
              input: admissionRow('0001'),
              reason: 'SYNTHETIC_UPLOAD',
              requestReference: 'SYNTH-REQUEST-0001',
              rowId: 'SYNTH-ROW-0001',
              rowNumber: 2,
            },
          ],
        }),
      }).processNext('SYNTH-BATCH-0001', 'SYNTH-WORKER-0001');
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          admission: expect.objectContaining({
            identityVerification: expect.objectContaining({ status: 'MANUAL_REVIEW' }),
          }),
        }),
      );
    },
  );

  it('defers transient identity failures before the last attempt', async () => {
    const defer = vi.fn(async () => undefined);
    const row = admissionRow('0001');
    const repo = repository({
      claimRows: async () => [
        {
          actorReference: 'SYNTH-ACTOR-0001',
          attemptCount: 1,
          batchId: 'SYNTH-BATCH-0001',
          input: { ...row, academicIdentityReference: 'SYNTH-IDENTITY-OUTAGE-0001' },
          reason: 'SYNTHETIC_UPLOAD',
          requestReference: 'SYNTH-REQUEST-0001',
          rowId: 'SYNTH-ROW-0001',
          rowNumber: 2,
        },
      ],
      deferRow: defer,
    });
    await new BatchWorker({
      admissions: { execute: async () => acceptedResult() },
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      identity: new DeterministicAcademicIdentityVerifier(),
      repository: repo,
    }).processNext('SYNTH-BATCH-0001', 'SYNTH-WORKER-0001');
    expect(defer).toHaveBeenCalledWith(
      'SYNTH-ROW-0001',
      'SYNTH-WORKER-0001',
      expect.objectContaining({ code: 'IDENTITY_PROVIDER_RETRYABLE' }),
      true,
    );
  });

  it('exposes summary, rows, template and correction exports through the query service', async () => {
    const repo = repository({
      correctionRows: async () => [],
      getSummary: async () => null,
      listRows: async () => [
        {
          admissionReference: null,
          attemptCount: 0,
          decisionReference: null,
          findings: [],
          recordKey: 'SYNTH-RECORD-0001',
          rowNumber: 2,
          status: 'INVALID',
        },
      ],
    });
    const query = new BatchQueryService(repo);
    await expect(query.getSummary('SYNTH-BATCH-UNKNOWN')).resolves.toBeNull();
    await expect(query.listRows('SYNTH-BATCH-0001')).resolves.toHaveLength(1);
    await expect(query.correctionCsv('SYNTH-BATCH-0001')).resolves.toContain('error_codes');
    expect(query.templateCsv()).toContain('template_version');
  });

  it('marks an unexpected final-attempt failure as final', async () => {
    const defer = vi.fn(async () => undefined);
    const identity: AcademicIdentityVerifierPort = {
      verify: async () => {
        throw new Error('SYNTHETIC_PROVIDER_FAILURE');
      },
    };
    await new BatchWorker({
      admissions: { execute: async () => acceptedResult() },
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      identity,
      repository: repository({
        claimRows: async () => [
          {
            actorReference: 'SYNTH-ACTOR-0001',
            attemptCount: 3,
            batchId: 'SYNTH-BATCH-0001',
            input: admissionRow('0001'),
            reason: 'SYNTHETIC_UPLOAD',
            requestReference: 'SYNTH-REQUEST-0001',
            rowId: 'SYNTH-ROW-0001',
            rowNumber: 2,
          },
        ],
        deferRow: defer,
      }),
    }).processNext('SYNTH-BATCH-0001', 'SYNTH-WORKER-0001');
    expect(defer).toHaveBeenCalledWith(
      'SYNTH-ROW-0001',
      'SYNTH-WORKER-0001',
      expect.objectContaining({ code: 'PROCESSING_RETRY_EXHAUSTED' }),
      false,
    );
  });

  it.each([
    ['REJECT', 'REJECTED'],
    ['MANUAL_REVIEW', 'MANUAL_REVIEW'],
  ] as const)('maps a Stage 2 %s result without duplicating policy', async (decision, expected) => {
    const complete = vi.fn(async () => undefined);
    await new BatchWorker({
      admissions: {
        execute: async () => ({
          ...acceptedResult(),
          admissionReference: null,
          decision: {
            ...acceptedResult().decision,
            outcome: decision,
            targetLifecycleStatus: decision === 'REJECT' ? 'REJECTED' : 'UNDER_REVIEW',
          },
        }),
      },
      clock: { now: () => '2026-08-01T09:00:00.000Z' },
      identity: new DeterministicAcademicIdentityVerifier(),
      repository: repository({
        claimRows: async () => [
          {
            actorReference: 'SYNTH-ACTOR-0001',
            attemptCount: 1,
            batchId: 'SYNTH-BATCH-0001',
            input: admissionRow('0001'),
            reason: 'SYNTHETIC_UPLOAD',
            requestReference: 'SYNTH-REQUEST-0001',
            rowId: 'SYNTH-ROW-0001',
            rowNumber: 2,
          },
        ],
        completeRow: complete,
      }),
    }).processNext('SYNTH-BATCH-0001', 'SYNTH-WORKER-0001');
    expect(complete).toHaveBeenCalledWith(
      'SYNTH-ROW-0001',
      'SYNTH-WORKER-0001',
      expect.objectContaining({ outcome: expected }),
    );
  });
});
