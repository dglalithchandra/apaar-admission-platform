import type { ApprovalSnapshot, CapacityUsage, Clock } from '@apaar-platform/admission-domain';
import { asIsoDateTime } from '@apaar-platform/admission-domain';
import { describe, expect, it } from 'vitest';
import {
  IdempotencyConflictError,
  InvalidDatabaseConfigurationError,
  PersistenceInvariantError,
} from '../../src/errors.js';
import type {
  AdmissionSubmissionResult,
  ApprovalImportCommand,
  PersistAdmissionOutcome,
} from '../../src/model.js';
import type {
  AdmissionTransaction,
  AdmissionUnitOfWork,
  ApprovalSnapshotWriter,
  IdempotentTransactionOptions,
} from '../../src/ports.js';
import {
  ImportApprovalSnapshotService,
  SubmitAdmissionService,
} from '../../src/submit-admission.js';
import {
  SyntheticReferenceGenerator,
  syntheticApproval,
  syntheticCommand,
  syntheticUsage,
} from '../fixtures.js';

const clock: Clock = { now: () => asIsoDateTime('2026-08-01T09:00:00.000Z') };

class FakeTransaction implements AdmissionTransaction {
  public persisted: PersistAdmissionOutcome[] = [];
  public conflict: 'NONE' | 'EXACT' | 'POTENTIAL' = 'NONE';
  public classifyStudentConflict(): Promise<'NONE' | 'EXACT' | 'POTENTIAL'> {
    return Promise.resolve(this.conflict);
  }

  public constructor(
    private readonly approval: ApprovalSnapshot | null,
    private readonly usage: CapacityUsage,
  ) {}

  public findEffective(): Promise<ApprovalSnapshot | null> {
    return Promise.resolve(this.approval);
  }

  public loadCapacityUsageForUpdate(): Promise<CapacityUsage> {
    return Promise.resolve(this.usage);
  }

  public persistOutcome(outcome: PersistAdmissionOutcome): Promise<void> {
    this.persisted.push(outcome);
    return Promise.resolve();
  }
}

class FakeUnitOfWork implements AdmissionUnitOfWork {
  private readonly results = new Map<string, { hash: string; result: AdmissionSubmissionResult }>();

  public constructor(public readonly transaction: FakeTransaction) {}

  public async runIdempotent(
    options: IdempotentTransactionOptions,
    work: (transaction: AdmissionTransaction) => Promise<AdmissionSubmissionResult>,
  ): Promise<AdmissionSubmissionResult> {
    const key = `${options.institutionId}:${options.idempotencyKey}`;
    const existing = this.results.get(key);
    if (existing !== undefined) {
      if (existing.hash !== options.requestHash) throw new IdempotencyConflictError();
      return { ...existing.result, replayed: true };
    }
    const result = await work(this.transaction);
    this.results.set(key, { hash: options.requestHash, result });
    return result;
  }
}

describe('SubmitAdmissionService', () => {
  it('does not downgrade a capacity rejection when a possible overlap also exists', async () => {
    const transaction = new FakeTransaction(
      syntheticApproval(),
      syntheticUsage({ ordinaryUsed: 60 }),
    );
    transaction.conflict = 'POTENTIAL';
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );
    const result = await service.execute(syntheticCommand('SYNTH-CAPACITY-OVERLAP'));
    expect(result.decision.outcome).toBe('REJECT');
    expect(result.decision.reservation).toBeNull();
  });

  it.each(['EXACT', 'POTENTIAL'] as const)(
    'persists %s student conflicts without consuming capacity',
    async (conflict) => {
      const transaction = new FakeTransaction(syntheticApproval(), syntheticUsage());
      transaction.conflict = conflict;
      const service = new SubmitAdmissionService(
        { clock, unitOfWork: new FakeUnitOfWork(transaction) },
        new SyntheticReferenceGenerator(),
      );
      const result = await service.execute(syntheticCommand(`UNIT-CONFLICT-${conflict}`));
      expect(result.decision.outcome).toBe(conflict === 'EXACT' ? 'REJECT' : 'MANUAL_REVIEW');
      expect(result.decision.reservation).toBeNull();
      expect(result.admissionReference).toBeNull();
      expect(transaction.persisted).toHaveLength(1);
      expect(result.decision.findings.at(-1)?.code).toBe(
        conflict === 'EXACT' ? 'STUDENT_ADMISSION_DUPLICATE' : 'STUDENT_ENROLMENT_OVERLAP_REVIEW',
      );
    },
  );

  it('evaluates and persists an accepted admission with stable references', async () => {
    const transaction = new FakeTransaction(syntheticApproval(), syntheticUsage());
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );

    const result = await service.execute(syntheticCommand('UNIT-ACCEPT'));

    expect(result.decision.outcome).toBe('ACCEPT');
    expect(result.admissionReference).toMatch(/^SYNTH-REGISTRATION-/);
    expect(result.replayed).toBe(false);
    expect(transaction.persisted).toHaveLength(1);
    expect(transaction.persisted[0]?.approval?.id).toBe('SYNTH-APPROVAL-0001');
  });

  it('persists rejection without issuing a registration reference', async () => {
    const transaction = new FakeTransaction(
      syntheticApproval(),
      syntheticUsage({ ordinaryUsed: 60 }),
    );
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );

    const result = await service.execute(syntheticCommand('UNIT-REJECT'));

    expect(result.decision.outcome).toBe('REJECT');
    expect(result.admissionReference).toBeNull();
    expect(transaction.persisted[0]?.decision.reservation).toBeNull();
  });

  it('persists manual review without loading a different approval path', async () => {
    const transaction = new FakeTransaction(syntheticApproval(), syntheticUsage());
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );

    const result = await service.execute(
      syntheticCommand('UNIT-REVIEW', 'ORDINARY', 'TEMPORARILY_UNAVAILABLE'),
    );

    expect(result.decision.outcome).toBe('MANUAL_REVIEW');
    expect(result.admissionReference).toBeNull();
  });

  it('returns the original result for an identical replay', async () => {
    const transaction = new FakeTransaction(syntheticApproval(), syntheticUsage());
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );
    const command = syntheticCommand('UNIT-REPLAY');

    const first = await service.execute(command);
    const replay = await service.execute(command);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(transaction.persisted).toHaveLength(1);
  });

  it('reports a conflict when the same key is reused for different content', async () => {
    const transaction = new FakeTransaction(syntheticApproval(), syntheticUsage());
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );
    const first = syntheticCommand('UNIT-CONFLICT-A');
    const second = syntheticCommand('UNIT-CONFLICT-B');
    await service.execute(first);

    await expect(
      service.execute({
        ...second,
        context: { ...second.context, idempotencyKey: first.context.idempotencyKey },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('rejects mismatched scope and malformed request metadata before persistence', async () => {
    const transaction = new FakeTransaction(null, syntheticUsage());
    const service = new SubmitAdmissionService(
      { clock, unitOfWork: new FakeUnitOfWork(transaction) },
      new SyntheticReferenceGenerator(),
    );
    const command = syntheticCommand('UNIT-INVALID');

    await expect(
      service.execute({
        ...command,
        context: { ...command.context, idempotencyKey: 'short' },
      }),
    ).rejects.toThrow('8 to 128');
    await expect(
      service.execute({
        ...command,
        context: { ...command.context, institutionId: 'SYNTH-INST-OTHER' as never },
      }),
    ).rejects.toThrow('must match');
    await expect(
      service.execute({ ...command, context: { ...command.context, requestHash: 'invalid' } }),
    ).rejects.toThrow('SHA-256');
    await expect(
      service.execute({ ...command, context: { ...command.context, reason: '   ' } }),
    ).rejects.toThrow('reason must not be empty');
  });
});

describe('ImportApprovalSnapshotService', () => {
  it('delegates an immutable snapshot import and validates supersession metadata', async () => {
    const imported: ApprovalImportCommand[] = [];
    const writer: ApprovalSnapshotWriter = {
      importSnapshot: (command) => {
        imported.push(command);
        return Promise.resolve();
      },
    };
    const service = new ImportApprovalSnapshotService(writer);
    const command = { snapshot: syntheticApproval() };

    await service.execute(command);
    expect(imported).toEqual([command]);
    await expect(
      service.execute({ snapshot: syntheticApproval(), supersedesSnapshotId: 'SYNTH-OLD' }),
    ).rejects.toThrow('must be supplied together');
    await expect(
      service.execute({ snapshot: syntheticApproval(), supersessionReason: 'SYNTH-REASON' }),
    ).rejects.toThrow('must be supplied together');
  });
});

describe('application errors', () => {
  it('use stable names and messages', () => {
    expect(new IdempotencyConflictError()).toMatchObject({
      message: expect.stringContaining('idempotency key') as string,
      name: 'IdempotencyConflictError',
    });
    expect(new PersistenceInvariantError('SYNTH-INVARIANT')).toMatchObject({
      message: 'SYNTH-INVARIANT',
      name: 'PersistenceInvariantError',
    });
    expect(new InvalidDatabaseConfigurationError('SYNTH-CONFIG')).toMatchObject({
      message: 'SYNTH-CONFIG',
      name: 'InvalidDatabaseConfigurationError',
    });
  });
});
