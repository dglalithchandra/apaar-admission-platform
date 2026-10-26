import type {
  ActorContext,
  CaseActionCommand,
  CaseListQuery,
  CasePage,
  CaseRecord,
  CaseImplementationResult,
  CreateAppealCommand,
  CreateCaseCommand,
  ImplementCancellationCommand,
  ImplementTransferCommand,
  TransitionCaseCommand,
} from './model.js';

export interface AuthorizationPort {
  authorize(actor: ActorContext, action: string, institutionId: string): Promise<boolean>;
}

export interface CaseRepositoryPort {
  act(command: CaseActionCommand, requestHash: string): Promise<CaseRecord>;
  create(command: CreateCaseCommand, requestHash: string): Promise<CaseRecord>;
  createAppeal(command: CreateAppealCommand, requestHash: string): Promise<CaseRecord>;
  transition(command: TransitionCaseCommand, requestHash: string): Promise<CaseRecord>;
  get(caseId: string, institutionId: string | null): Promise<CaseRecord | null>;
  implementCancellation(
    command: ImplementCancellationCommand,
    requestHash: string,
  ): Promise<CaseImplementationResult>;
  implementTransfer(
    command: ImplementTransferCommand,
    requestHash: string,
  ): Promise<CaseImplementationResult>;
  list(query: CaseListQuery): Promise<CasePage>;
}

export interface CaseClock {
  now(): string;
}
