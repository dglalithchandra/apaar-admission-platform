import { createHash } from 'node:crypto';
import { CaseworkError } from './errors.js';
import type {
  ActorContext,
  CaseActionCommand,
  CaseImplementationResult,
  CaseListQuery,
  CasePage,
  CaseRecord,
  CreateAppealCommand,
  CreateCaseCommand,
  ImplementCancellationCommand,
  ImplementTransferCommand,
  TransitionCaseCommand,
} from './model.js';
import type { AuthorizationPort, CaseRepositoryPort } from './ports.js';
import {
  authorityFinding,
  canPerform,
  canWrite,
  checkerFinding,
  correctionImpact,
} from './policy.js';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class CreateCaseService {
  public constructor(
    private readonly authorization: AuthorizationPort,
    private readonly repository: CaseRepositoryPort,
  ) {}

  public async execute(command: CreateCaseCommand): Promise<CaseRecord> {
    if (!canWrite(command.actor.role)) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'This role has read-only or operational access.',
      });
    }
    if (
      !(await this.authorization.authorize(command.actor, 'CASE_CREATE', command.institutionId))
    ) {
      throw new CaseworkError({
        code: 'TENANT_SCOPE_DENIED',
        explanation: 'The case is not visible in the actor institution scope.',
      });
    }
    if (command.caseType === 'APPEAL') {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'Appeals must be created with an explicit governed appeal target.',
      });
    }
    const authority = authorityFinding(command.policyAuthority);
    if (authority !== null) throw new CaseworkError(authority);
    return this.repository.create(command, hash(command));
  }
}

export class TransitionCaseService {
  public constructor(
    private readonly authorization: AuthorizationPort,
    private readonly repository: CaseRepositoryPort,
  ) {}

  public async execute(command: TransitionCaseCommand): Promise<CaseRecord> {
    const record = await this.repository.get(command.caseId, command.actor.institutionId);
    if (record === null) {
      throw new CaseworkError({
        code: 'TENANT_SCOPE_DENIED',
        explanation: 'The case was not found or is outside the actor scope.',
      });
    }
    if (
      !(await this.authorization.authorize(command.actor, 'CASE_TRANSITION', record.institutionId))
    ) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'The action is not authorised.',
      });
    }
    return this.repository.transition(command, hash(command));
  }
}

function notVisible(): CaseworkError {
  return new CaseworkError({
    code: 'TENANT_SCOPE_DENIED',
    explanation: 'The case was not found or is outside the actor scope.',
  });
}

export class ExecuteCaseActionService {
  public constructor(
    private readonly authorization: AuthorizationPort,
    private readonly repository: CaseRepositoryPort,
  ) {}

  public async execute(command: CaseActionCommand): Promise<CaseRecord> {
    const record = await this.repository.get(command.caseId, command.actor.institutionId);
    if (record === null) throw notVisible();
    if (
      !canPerform(command.actor.role, command.action) ||
      !(await this.authorization.authorize(command.actor, command.action, record.institutionId))
    ) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'The role is not authorised to perform this case action.',
      });
    }
    if (command.action === 'DECIDE' || command.action === 'DECIDE_APPEAL') {
      const finding = checkerFinding(record.makerReference, command.actor);
      if (finding !== null) throw new CaseworkError(finding);
    }
    if (command.action === 'ADD_CORRECTION_PROPOSAL') {
      if (command.changes.length === 0) {
        throw new CaseworkError({
          code: 'CORRECTION_FIELD_UNSUPPORTED',
          explanation: 'A correction proposal must contain at least one supported field.',
        });
      }
      const unsupported = command.changes.find(
        (change) => correctionImpact(change.fieldCode) === null,
      );
      if (unsupported !== undefined) {
        throw new CaseworkError({
          code: 'CORRECTION_FIELD_UNSUPPORTED',
          explanation: `${unsupported.fieldCode} is not an authorised correction field.`,
        });
      }
    }
    return this.repository.act(command, hash(command));
  }
}

export class CreateAppealService {
  public constructor(
    private readonly authorization: AuthorizationPort,
    private readonly repository: CaseRepositoryPort,
  ) {}

  public async execute(command: CreateAppealCommand): Promise<CaseRecord> {
    if (!canWrite(command.actor.role)) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'This role has read-only or operational access.',
      });
    }
    if (
      !(await this.authorization.authorize(command.actor, 'CREATE_APPEAL', command.institutionId))
    ) {
      throw notVisible();
    }
    const authority = authorityFinding(command.policyAuthority);
    if (authority !== null) throw new CaseworkError(authority);
    const targetCount =
      Number(command.appealedCaseId !== null) + Number(command.appealedDecisionId !== null);
    if (targetCount !== 1) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'An appeal must identify exactly one case or admission decision.',
      });
    }
    return this.repository.createAppeal(command, hash(command));
  }
}

export class GetCaseService {
  public constructor(private readonly repository: CaseRepositoryPort) {}

  public async execute(actor: ActorContext, caseId: string): Promise<CaseRecord> {
    const record = await this.repository.get(caseId, actor.institutionId);
    if (record === null) throw notVisible();
    return record;
  }
}

export class ListCasesService {
  public constructor(private readonly repository: CaseRepositoryPort) {}

  public async execute(actor: ActorContext, query: CaseListQuery): Promise<CasePage> {
    if (query.limit < 1 || query.limit > 100) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'Case page size must be between 1 and 100.',
      });
    }
    if (actor.institutionId !== null && query.institutionId !== actor.institutionId) {
      throw notVisible();
    }
    return this.repository.list({
      ...query,
      institutionId: actor.institutionId ?? query.institutionId,
    });
  }
}

abstract class ImplementCaseService<TCommand extends { actor: ActorContext; caseId: string }> {
  protected constructor(
    protected readonly authorization: AuthorizationPort,
    protected readonly repository: CaseRepositoryPort,
  ) {}

  protected async authorize(
    command: TCommand,
    expectedType: readonly CaseRecord['caseType'][],
  ): Promise<void> {
    const record = await this.repository.get(command.caseId, command.actor.institutionId);
    if (record === null) throw notVisible();
    if (
      command.actor.role !== 'AICTE_CHECKER' ||
      !(await this.authorization.authorize(command.actor, 'CASE_IMPLEMENT', record.institutionId))
    ) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'Only an authorised independent checker may implement an approved case.',
      });
    }
    if (!expectedType.includes(record.caseType)) {
      throw new CaseworkError({
        code: 'ACTION_FORBIDDEN',
        explanation: 'The implementation command does not match the case type.',
      });
    }
  }
}

export class ImplementCancellationService extends ImplementCaseService<ImplementCancellationCommand> {
  public constructor(authorization: AuthorizationPort, repository: CaseRepositoryPort) {
    super(authorization, repository);
  }

  public async execute(command: ImplementCancellationCommand): Promise<CaseImplementationResult> {
    await this.authorize(command, ['ADMISSION_CANCELLATION']);
    return this.repository.implementCancellation(command, hash(command));
  }
}

export class ImplementTransferService extends ImplementCaseService<ImplementTransferCommand> {
  public constructor(authorization: AuthorizationPort, repository: CaseRepositoryPort) {
    super(authorization, repository);
  }

  public async execute(command: ImplementTransferCommand): Promise<CaseImplementationResult> {
    await this.authorize(command, ['INSTITUTION_TRANSFER', 'PROGRAMME_OR_COURSE_TRANSFER']);
    return this.repository.implementTransfer(command, hash(command));
  }
}
