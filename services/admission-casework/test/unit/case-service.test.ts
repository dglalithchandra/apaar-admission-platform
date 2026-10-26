import { describe, expect, it, vi } from 'vitest';
import {
  CreateAppealService,
  CreateCaseService,
  ExecuteCaseActionService,
  GetCaseService,
  ImplementCancellationService,
  ImplementTransferService,
  ListCasesService,
  TransitionCaseService,
} from '../../src/case-service.js';
import { CaseworkError } from '../../src/errors.js';
import type {
  ActorContext,
  CaseActionCommand,
  CaseRecord,
  CreateAppealCommand,
  CreateCaseCommand,
  ImplementCancellationCommand,
  ImplementTransferCommand,
} from '../../src/model.js';
import type { AuthorizationPort, CaseRepositoryPort } from '../../src/ports.js';
import { DeterministicAuthorizationSimulator } from '../../src/simulators.js';

const actor: ActorContext = {
  actorReference: 'SYNTH-ACTOR-0001',
  correlationReference: 'SYNTH-CORRELATION-0001',
  institutionId: 'SYNTH-INST-0001',
  purpose: 'SYNTHETIC_CASEWORK',
  reason: 'SYNTHETIC_CORRECTION',
  requestReference: 'SYNTH-REQUEST-0001',
  role: 'INSTITUTION_OPERATOR',
};
const record: CaseRecord = {
  admissionId: 'SYNTH-ADMISSION-0001',
  caseId: 'SYNTH-CASE-0001',
  caseReference: 'SYNTH-CASE-REF-0001',
  caseType: 'ADMISSION_CORRECTION',
  institutionId: 'SYNTH-INST-0001',
  makerReference: actor.actorReference,
  policyVersion: 'SYNTH-POLICY-1',
  priority: 'NORMAL',
  state: 'DRAFT',
  version: 1,
};
const implementationResult = {
  caseId: record.caseId,
  implementationId: 'SYNTH-IMPLEMENTATION-0001',
  implementationType: 'CANCELLATION' as const,
  receiptReference: 'SYNTH-RECEIPT-0001',
  releasedReservationIds: ['SYNTH-RESERVATION-0001'],
  sourceAdmissionId: record.admissionId,
  sourceAdmissionVersionId: 'SYNTH-ADMISSION-VERSION-0002',
  state: 'IMPLEMENTED' as const,
  targetAdmissionId: null,
  targetDecisionId: null,
};

function command(overrides: Partial<CreateCaseCommand> = {}): CreateCaseCommand {
  return {
    actor,
    admissionId: record.admissionId,
    caseId: record.caseId,
    caseReference: record.caseReference,
    caseType: record.caseType,
    idempotencyKey: 'SYNTH-CASE-KEY-0001',
    institutionId: record.institutionId,
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: record.policyVersion,
    priority: record.priority,
    ...overrides,
  };
}

function repository(overrides: Partial<CaseRepositoryPort> = {}): CaseRepositoryPort {
  return {
    act: vi.fn(async () => record),
    create: vi.fn(async () => record),
    createAppeal: vi.fn(async () => ({ ...record, caseType: 'APPEAL' as const })),
    get: vi.fn(async () => record),
    implementCancellation: vi.fn(async () => implementationResult),
    implementTransfer: vi.fn(async () => ({
      ...implementationResult,
      implementationType: 'TRANSFER' as const,
    })),
    list: vi.fn(async () => ({ items: [record], nextCursor: null })),
    transition: vi.fn(async (input: Parameters<CaseRepositoryPort['transition']>[0]) => ({
      ...record,
      state: input.nextState,
      version: 2,
    })),
    ...overrides,
  };
}

describe('casework services', () => {
  it('creates an authorised case through the repository boundary', async () => {
    const repo = repository();
    await expect(
      new CreateCaseService(new DeterministicAuthorizationSimulator(), repo).execute(command()),
    ).resolves.toEqual(record);
    expect(repo.create).toHaveBeenCalledWith(command(), expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it.each(['AUDITOR', 'SYSTEM_OPERATOR'] as const)('denies writes by %s', async (role) => {
    await expect(
      new CreateCaseService(new DeterministicAuthorizationSimulator(), repository()).execute(
        command({ actor: { ...actor, role } }),
      ),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
  });

  it('hides cases outside the institution scope', async () => {
    await expect(
      new CreateCaseService(new DeterministicAuthorizationSimulator(), repository()).execute(
        command({ actor: { ...actor, institutionId: 'SYNTH-INST-OTHER' } }),
      ),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
  });

  it('requires the governed appeal service for appeal cases', async () => {
    await expect(
      new CreateCaseService(new DeterministicAuthorizationSimulator(), repository()).execute(
        command({ caseType: 'APPEAL' }),
      ),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
  });

  it.each(['PROPOSED', 'UNKNOWN_BLOCKING'] as const)(
    'blocks %s policy authority',
    async (policyAuthority) => {
      await expect(
        new CreateCaseService(new DeterministicAuthorizationSimulator(), repository()).execute(
          command({ policyAuthority }),
        ),
      ).rejects.toMatchObject({ finding: { code: 'POLICY_AUTHORITY_REQUIRED' } });
    },
  );

  it('transitions an authorised visible case with a deterministic hash', async () => {
    const repo = repository();
    const transition = {
      actor,
      caseId: record.caseId,
      expectedVersion: 1,
      idempotencyKey: 'SYNTH-TRANSITION-KEY-0001',
      nextState: 'SUBMITTED' as const,
    };
    await expect(
      new TransitionCaseService(new DeterministicAuthorizationSimulator(), repo).execute(
        transition,
      ),
    ).resolves.toMatchObject({ state: 'SUBMITTED', version: 2 });
    expect(repo.transition).toHaveBeenCalledWith(
      transition,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('does not reveal an absent or out-of-scope case', async () => {
    await expect(
      new TransitionCaseService(
        new DeterministicAuthorizationSimulator(),
        repository({ get: async () => null }),
      ).execute({
        actor,
        caseId: record.caseId,
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-TRANSITION-KEY-0001',
        nextState: 'SUBMITTED',
      }),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
  });

  it('enforces authorization on transitions', async () => {
    const denied: AuthorizationPort = { authorize: async () => false };
    await expect(
      new TransitionCaseService(denied, repository()).execute({
        actor,
        caseId: record.caseId,
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-TRANSITION-KEY-0001',
        nextState: 'SUBMITTED',
      }),
    ).rejects.toBeInstanceOf(CaseworkError);
  });

  it('executes an authorised typed action through the repository', async () => {
    const repo = repository();
    const action: CaseActionCommand = {
      action: 'SUBMIT',
      actor,
      caseId: record.caseId,
      expectedVersion: 1,
      idempotencyKey: 'SYNTH-ACTION-KEY-0001',
    };
    await expect(
      new ExecuteCaseActionService(new DeterministicAuthorizationSimulator(), repo).execute(action),
    ).resolves.toEqual(record);
    expect(repo.act).toHaveBeenCalledWith(action, expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it('hides an absent action target', async () => {
    await expect(
      new ExecuteCaseActionService(
        new DeterministicAuthorizationSimulator(),
        repository({ get: async () => null }),
      ).execute({
        action: 'SUBMIT',
        actor,
        caseId: record.caseId,
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-ACTION-KEY-0002',
      }),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
  });

  it('denies actions outside the role matrix or authorization boundary', async () => {
    const action = {
      action: 'DECIDE' as const,
      actor,
      caseId: record.caseId,
      decisionId: 'SYNTH-DECISION-0001',
      expectedVersion: 1,
      explanation: 'Synthetic decision.',
      idempotencyKey: 'SYNTH-ACTION-KEY-0003',
      outcome: 'APPROVED' as const,
      policyVersion: record.policyVersion,
      reasonCode: 'SYNTH-REASON',
    };
    await expect(
      new ExecuteCaseActionService(new DeterministicAuthorizationSimulator(), repository()).execute(
        action,
      ),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
    const denied: AuthorizationPort = { authorize: async () => false };
    await expect(
      new ExecuteCaseActionService(denied, repository()).execute({
        action: 'SUBMIT',
        actor,
        caseId: record.caseId,
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-ACTION-KEY-0004',
      }),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
  });

  it('prevents the case maker from making the checker decision', async () => {
    await expect(
      new ExecuteCaseActionService(
        new DeterministicAuthorizationSimulator(),
        repository({ get: async () => ({ ...record, state: 'RECOMMENDED' }) }),
      ).execute({
        action: 'DECIDE',
        actor: { ...actor, institutionId: null, role: 'AICTE_CHECKER' },
        caseId: record.caseId,
        decisionId: 'SYNTH-DECISION-0002',
        expectedVersion: 1,
        explanation: 'Synthetic decision.',
        idempotencyKey: 'SYNTH-ACTION-KEY-0005',
        outcome: 'REJECTED',
        policyVersion: record.policyVersion,
        reasonCode: 'SYNTH-REASON',
      }),
    ).rejects.toMatchObject({ finding: { code: 'CHECKER_MUST_DIFFER_FROM_MAKER' } });
  });

  it('allows an independent checker and validates correction fields', async () => {
    const decisionService = new ExecuteCaseActionService(
      new DeterministicAuthorizationSimulator(),
      repository({ get: async () => ({ ...record, state: 'RECOMMENDED' }) }),
    );
    await expect(
      decisionService.execute({
        action: 'DECIDE',
        actor: {
          ...actor,
          actorReference: 'SYNTH-CHECKER-0001',
          institutionId: null,
          role: 'AICTE_CHECKER',
        },
        caseId: record.caseId,
        decisionId: 'SYNTH-DECISION-0003',
        expectedVersion: 1,
        explanation: 'Synthetic decision.',
        idempotencyKey: 'SYNTH-ACTION-KEY-0006',
        outcome: 'APPROVED',
        policyVersion: record.policyVersion,
        reasonCode: 'SYNTH-REASON',
      }),
    ).resolves.toEqual(record);
    await expect(
      decisionService.execute({
        action: 'DECIDE_APPEAL',
        actor: {
          ...actor,
          actorReference: 'SYNTH-CHECKER-0001',
          institutionId: null,
          role: 'AICTE_CHECKER',
        },
        appealOutcome: 'OVERTURNED',
        caseId: record.caseId,
        decisionId: 'SYNTH-APPEAL-DECISION-0001',
        expectedVersion: 1,
        explanation: 'Synthetic appeal decision.',
        idempotencyKey: 'SYNTH-APPEAL-ACTION-KEY-0001',
        policyVersion: record.policyVersion,
        reasonCode: 'SYNTH-APPEAL-REASON',
      }),
    ).resolves.toEqual(record);
    const service = new ExecuteCaseActionService(
      new DeterministicAuthorizationSimulator(),
      repository(),
    );
    await expect(
      service.execute({
        action: 'ADD_CORRECTION_PROPOSAL',
        actor,
        caseId: record.caseId,
        changes: [{ fieldCode: 'UNSUPPORTED', previousValue: 'SYNTH-A', proposedValue: 'SYNTH-B' }],
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-ACTION-KEY-0007',
        proposalId: 'SYNTH-PROPOSAL-0001',
      }),
    ).rejects.toMatchObject({ finding: { code: 'CORRECTION_FIELD_UNSUPPORTED' } });
    await expect(
      service.execute({
        action: 'ADD_CORRECTION_PROPOSAL',
        actor,
        caseId: record.caseId,
        changes: [{ fieldCode: 'CATEGORY', previousValue: 'SYNTH-A', proposedValue: 'SYNTH-B' }],
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-ACTION-KEY-0008',
        proposalId: 'SYNTH-PROPOSAL-0002',
      }),
    ).resolves.toEqual(record);
  });

  it('rejects empty corrections before reaching persistence', async () => {
    const service = new ExecuteCaseActionService(
      new DeterministicAuthorizationSimulator(),
      repository(),
    );
    await expect(
      service.execute({
        action: 'ADD_CORRECTION_PROPOSAL',
        actor,
        caseId: record.caseId,
        changes: [],
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-ACTION-KEY-0009',
        proposalId: 'SYNTH-PROPOSAL-EMPTY',
      }),
    ).rejects.toMatchObject({ finding: { code: 'CORRECTION_FIELD_UNSUPPORTED' } });
  });

  function appeal(overrides: Partial<CreateAppealCommand> = {}): CreateAppealCommand {
    return {
      actor,
      appealCaseId: 'SYNTH-APPEAL-CASE-0001',
      appealId: 'SYNTH-APPEAL-0001',
      appealedCaseId: record.caseId,
      appealedDecisionId: null,
      caseReference: 'SYNTH-APPEAL-REFERENCE-0001',
      idempotencyKey: 'SYNTH-APPEAL-KEY-0001',
      institutionId: record.institutionId,
      policyAuthority: 'AUTHORITY_CONFIGURED',
      policyVersion: record.policyVersion,
      priority: 'NORMAL',
      ...overrides,
    };
  }

  it('creates one-target appeals and blocks invalid authority or targets', async () => {
    const service = new CreateAppealService(
      new DeterministicAuthorizationSimulator(),
      repository(),
    );
    await expect(service.execute(appeal())).resolves.toMatchObject({ caseType: 'APPEAL' });
    await expect(
      service.execute(appeal({ policyAuthority: 'UNKNOWN_BLOCKING' })),
    ).rejects.toMatchObject({ finding: { code: 'POLICY_AUTHORITY_REQUIRED' } });
    await expect(
      service.execute(appeal({ appealedCaseId: null, appealedDecisionId: null })),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
    await expect(
      service.execute(appeal({ appealedDecisionId: 'SYNTH-ADMISSION-DECISION-0001' })),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
  });

  it('denies appeal writes by read-only and out-of-scope actors', async () => {
    await expect(
      new CreateAppealService(new DeterministicAuthorizationSimulator(), repository()).execute(
        appeal({ actor: { ...actor, role: 'AUDITOR' } }),
      ),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
    const denied: AuthorizationPort = { authorize: async () => false };
    await expect(
      new CreateAppealService(denied, repository()).execute(appeal()),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
  });

  it('gets visible cases without exposing absent records', async () => {
    await expect(new GetCaseService(repository()).execute(actor, record.caseId)).resolves.toEqual(
      record,
    );
    await expect(
      new GetCaseService(repository({ get: async () => null })).execute(actor, record.caseId),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
  });

  it('lists scoped pages and validates pagination boundaries', async () => {
    const repo = repository();
    const service = new ListCasesService(repo);
    const query = {
      afterCaseId: null,
      caseType: null,
      institutionId: record.institutionId,
      limit: 25,
      state: null,
    };
    await expect(service.execute(actor, query)).resolves.toEqual({
      items: [record],
      nextCursor: null,
    });
    expect(repo.list).toHaveBeenCalledWith(query);
    await expect(service.execute(actor, { ...query, limit: 0 })).rejects.toMatchObject({
      finding: { code: 'ACTION_FORBIDDEN' },
    });
    await expect(service.execute(actor, { ...query, limit: 101 })).rejects.toMatchObject({
      finding: { code: 'ACTION_FORBIDDEN' },
    });
    await expect(
      service.execute(actor, { ...query, institutionId: 'SYNTH-INST-OTHER' }),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
    await expect(
      service.execute(
        { ...actor, institutionId: null, role: 'AUDITOR' },
        { ...query, institutionId: null },
      ),
    ).resolves.toEqual({ items: [record], nextCursor: null });
  });

  function cancellationCommand(): ImplementCancellationCommand {
    return {
      actor: {
        ...actor,
        actorReference: 'SYNTH-CHECKER-IMPLEMENT',
        institutionId: null,
        role: 'AICTE_CHECKER',
      },
      caseId: record.caseId,
      expectedVersion: 6,
      idempotencyKey: 'SYNTH-CANCEL-IMPLEMENT-KEY',
      implementationId: implementationResult.implementationId,
      receiptReference: implementationResult.receiptReference,
      sourceAdmissionVersionId: implementationResult.sourceAdmissionVersionId,
    };
  }

  it('authorises matching cancellation and transfer implementations', async () => {
    const cancellationRepository = repository({
      get: async () => ({ ...record, caseType: 'ADMISSION_CANCELLATION' }),
    });
    await expect(
      new ImplementCancellationService(
        new DeterministicAuthorizationSimulator(),
        cancellationRepository,
      ).execute(cancellationCommand()),
    ).resolves.toEqual(implementationResult);
    const transferRepository = repository({
      get: async () => ({ ...record, caseType: 'PROGRAMME_OR_COURSE_TRANSFER' }),
    });
    const transferCommand: ImplementTransferCommand = {
      ...cancellationCommand(),
      targetReferences: {
        admissionId: 'SYNTH-TARGET-ADMISSION',
        auditEventId: 'SYNTH-TARGET-AUDIT',
        decisionId: 'SYNTH-TARGET-DECISION',
        identityVerificationId: 'SYNTH-TARGET-IDENTITY',
        outboxEventId: 'SYNTH-TARGET-OUTBOX',
        registrationReference: 'SYNTH-TARGET-REGISTRATION',
      },
      targetSubmission: {} as ImplementTransferCommand['targetSubmission'],
      transferId: 'SYNTH-TRANSFER-0001',
    };
    await expect(
      new ImplementTransferService(
        new DeterministicAuthorizationSimulator(),
        transferRepository,
      ).execute(transferCommand),
    ).resolves.toMatchObject({ implementationType: 'TRANSFER' });
  });

  it('hides missing implementation cases and denies wrong role, scope or case type', async () => {
    const command = cancellationCommand();
    await expect(
      new ImplementCancellationService(
        new DeterministicAuthorizationSimulator(),
        repository({ get: async () => null }),
      ).execute(command),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });
    await expect(
      new ImplementCancellationService(
        new DeterministicAuthorizationSimulator(),
        repository({ get: async () => ({ ...record, caseType: 'ADMISSION_CANCELLATION' }) }),
      ).execute({ ...command, actor }),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
    const denied: AuthorizationPort = { authorize: async () => false };
    await expect(
      new ImplementCancellationService(
        denied,
        repository({ get: async () => ({ ...record, caseType: 'ADMISSION_CANCELLATION' }) }),
      ).execute(command),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
    await expect(
      new ImplementCancellationService(
        new DeterministicAuthorizationSimulator(),
        repository(),
      ).execute(command),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
  });
});
