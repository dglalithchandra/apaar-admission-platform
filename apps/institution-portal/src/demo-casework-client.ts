import type {
  CaseworkClient,
  CaseworkRole,
  CreatePortalCaseInput,
  PortalCase,
  PortalCaseState,
} from './casework-types.js';

const openedAt = '2026-10-26T08:30:00.000Z';

const initialCases: readonly PortalCase[] = [
  {
    admissionReference: 'SYNTH-REGISTRATION-0101',
    assignedReviewer: null,
    caseId: 'SYNTH-CASE-DRAFT-0101',
    caseReference: 'SYNTH-CASE-REF-0101',
    caseType: 'ADMISSION_CORRECTION',
    conflictStatus: 'NOT_DECLARED',
    implementationReceipt: null,
    institutionId: 'SYNTH-INSTITUTION-001',
    lastAction: 'Draft saved by institution operator',
    openedAt,
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: 'SYNTH-POLICY-2026-01',
    priority: 'NORMAL',
    state: 'DRAFT',
    summary: 'Correct the course reference while retaining the original admission decision.',
    version: 1,
  },
  {
    admissionReference: 'SYNTH-REGISTRATION-0102',
    assignedReviewer: 'SYNTH-REVIEWER-001',
    caseId: 'SYNTH-CASE-INFO-0102',
    caseReference: 'SYNTH-CASE-REF-0102',
    caseType: 'ADMISSION_CORRECTION',
    conflictStatus: 'CLEAR',
    implementationReceipt: null,
    institutionId: 'SYNTH-INSTITUTION-001',
    lastAction: 'Reviewer requested supporting information',
    openedAt: '2026-10-25T11:00:00.000Z',
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: 'SYNTH-POLICY-2026-01',
    priority: 'HIGH',
    state: 'MORE_INFORMATION_REQUIRED',
    summary: 'Provide the synthetic approval reference supporting the requested correction.',
    version: 6,
  },
  {
    admissionReference: 'SYNTH-REGISTRATION-0201',
    assignedReviewer: 'SYNTH-REVIEWER-001',
    caseId: 'SYNTH-CASE-SUBMITTED-0201',
    caseReference: 'SYNTH-CASE-REF-0201',
    caseType: 'ADMISSION_CANCELLATION',
    conflictStatus: 'NOT_DECLARED',
    implementationReceipt: null,
    institutionId: 'SYNTH-INSTITUTION-001',
    lastAction: 'Submitted by institution operator',
    openedAt: '2026-10-24T09:45:00.000Z',
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: 'SYNTH-POLICY-2026-01',
    priority: 'HIGH',
    state: 'SUBMITTED',
    summary: 'Review an institution-requested admission cancellation and its capacity effect.',
    version: 2,
  },
  {
    admissionReference: 'SYNTH-REGISTRATION-0301',
    assignedReviewer: 'SYNTH-REVIEWER-002',
    caseId: 'SYNTH-CASE-RECOMMENDED-0301',
    caseReference: 'SYNTH-CASE-REF-0301',
    caseType: 'PROGRAMME_OR_COURSE_TRANSFER',
    conflictStatus: 'CLEAR',
    implementationReceipt: null,
    institutionId: 'SYNTH-INSTITUTION-001',
    lastAction: 'Reviewer recommended approval',
    openedAt: '2026-10-23T13:15:00.000Z',
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: 'SYNTH-POLICY-2026-01',
    priority: 'NORMAL',
    state: 'RECOMMENDED',
    summary: 'Move the admission to a different synthetic course within the same institution.',
    version: 7,
  },
  {
    admissionReference: 'SYNTH-REGISTRATION-0302',
    assignedReviewer: 'SYNTH-REVIEWER-003',
    caseId: 'SYNTH-CASE-APPROVED-0302',
    caseReference: 'SYNTH-CASE-REF-0302',
    caseType: 'ADMISSION_CANCELLATION',
    conflictStatus: 'CLEAR',
    implementationReceipt: null,
    institutionId: 'SYNTH-INSTITUTION-001',
    lastAction: 'Independent checker approved the case',
    openedAt: '2026-10-22T10:20:00.000Z',
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: 'SYNTH-POLICY-2026-01',
    priority: 'URGENT',
    state: 'APPROVED',
    summary: 'Implement the approved cancellation and release its recorded capacity reservations.',
    version: 8,
  },
];

function visibleTo(role: CaseworkRole, item: PortalCase): boolean {
  if (role === 'INSTITUTION_OPERATOR') return item.institutionId === 'SYNTH-INSTITUTION-001';
  if (role === 'AICTE_REVIEWER') {
    return ['SUBMITTED', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED'].includes(item.state);
  }
  return ['RECOMMENDED', 'APPROVED', 'REJECTED', 'IMPLEMENTED'].includes(item.state);
}

export class DemoCaseworkClient implements CaseworkClient {
  private readonly cases = new Map(initialCases.map((item) => [item.caseId, item]));
  private nextCase = 9000;

  public listCases(role: CaseworkRole): Promise<readonly PortalCase[]> {
    return Promise.resolve([...this.cases.values()].filter((item) => visibleTo(role, item)));
  }

  public createCase(input: CreatePortalCaseInput): Promise<PortalCase> {
    this.nextCase += 1;
    const suffix = String(this.nextCase);
    const created: PortalCase = {
      admissionReference: input.admissionReference,
      assignedReviewer: null,
      caseId: `SYNTH-CASE-${suffix}`,
      caseReference: `SYNTH-CASE-REF-${suffix}`,
      caseType: input.caseType,
      conflictStatus: 'NOT_DECLARED',
      implementationReceipt: null,
      institutionId: 'SYNTH-INSTITUTION-001',
      lastAction: 'Draft created by institution operator',
      openedAt,
      policyAuthority: 'AUTHORITY_CONFIGURED',
      policyVersion: 'SYNTH-POLICY-2026-01',
      priority: 'NORMAL',
      state: 'DRAFT',
      summary: input.reason,
      version: 1,
    };
    this.cases.set(created.caseId, created);
    return Promise.resolve(created);
  }

  public async submitCase(caseId: string, expectedVersion: number): Promise<PortalCase> {
    return this.transition(caseId, expectedVersion, ['DRAFT', 'MORE_INFORMATION_REQUIRED'], {
      lastAction: 'Submitted by institution operator',
      state: 'SUBMITTED',
    });
  }

  public async supplyInformation(
    caseId: string,
    expectedVersion: number,
    response: string,
  ): Promise<PortalCase> {
    if (response.trim() === '') return Promise.reject(new Error('A response is required.'));
    return this.transition(caseId, expectedVersion, ['MORE_INFORMATION_REQUIRED'], {
      lastAction: 'Additional information supplied by institution',
      state: 'SUBMITTED',
      summary: response,
    });
  }

  public async startReview(caseId: string, expectedVersion: number): Promise<PortalCase> {
    return this.transition(caseId, expectedVersion, ['SUBMITTED'], {
      assignedReviewer: 'SYNTH-REVIEWER-CURRENT',
      lastAction: 'Review started by assigned reviewer',
      state: 'UNDER_REVIEW',
    });
  }

  public async declareConflict(
    caseId: string,
    expectedVersion: number,
    hasConflict: boolean,
  ): Promise<PortalCase> {
    return this.transition(caseId, expectedVersion, ['UNDER_REVIEW'], {
      conflictStatus: hasConflict ? 'DECLARED' : 'CLEAR',
      lastAction: hasConflict
        ? 'Conflict declared; reassignment required'
        : 'No conflict declared by reviewer',
    });
  }

  public async recommendCase(
    caseId: string,
    expectedVersion: number,
    outcome: 'APPROVE' | 'REJECT' | 'MORE_INFORMATION_REQUIRED',
    explanation: string,
  ): Promise<PortalCase> {
    const current = this.requireCase(caseId, expectedVersion, ['UNDER_REVIEW']);
    if (current.conflictStatus !== 'CLEAR') {
      return Promise.reject(new Error('A clear conflict declaration is required.'));
    }
    if (explanation.trim() === '') return Promise.reject(new Error('An explanation is required.'));
    const state: PortalCaseState =
      outcome === 'MORE_INFORMATION_REQUIRED' ? 'MORE_INFORMATION_REQUIRED' : 'RECOMMENDED';
    return this.save(current, {
      lastAction:
        outcome === 'MORE_INFORMATION_REQUIRED'
          ? 'Reviewer requested supporting information'
          : `Reviewer recommended ${outcome.toLowerCase()}`,
      state,
      summary: explanation,
    });
  }

  public async decideCase(
    caseId: string,
    expectedVersion: number,
    outcome: 'APPROVED' | 'REJECTED',
    explanation: string,
  ): Promise<PortalCase> {
    if (explanation.trim() === '') return Promise.reject(new Error('An explanation is required.'));
    return this.transition(caseId, expectedVersion, ['RECOMMENDED'], {
      lastAction: `Independent checker ${outcome.toLowerCase()} the case`,
      state: outcome,
      summary: explanation,
    });
  }

  public async implementCase(caseId: string, expectedVersion: number): Promise<PortalCase> {
    const current = this.requireCase(caseId, expectedVersion, ['APPROVED']);
    const transfer = current.caseType.includes('TRANSFER');
    return this.save(current, {
      implementationReceipt: {
        implementationType: transfer ? 'TRANSFER' : 'CANCELLATION',
        receiptReference: `SYNTH-IMPLEMENTATION-RECEIPT-${current.caseId}`,
        releasedReservationCount: transfer ? 1 : 2,
        targetAdmissionReference: transfer ? 'SYNTH-REGISTRATION-TARGET-9001' : null,
      },
      lastAction: `${transfer ? 'Transfer' : 'Cancellation'} implemented atomically`,
      state: 'IMPLEMENTED',
    });
  }

  private transition(
    caseId: string,
    expectedVersion: number,
    states: readonly PortalCaseState[],
    changes: Partial<PortalCase>,
  ): Promise<PortalCase> {
    return this.save(this.requireCase(caseId, expectedVersion, states), changes);
  }

  private requireCase(
    caseId: string,
    expectedVersion: number,
    states: readonly PortalCaseState[],
  ): PortalCase {
    const current = this.cases.get(caseId);
    if (current === undefined) throw new Error('Synthetic case not found.');
    if (current.version !== expectedVersion) throw new Error('The case version is stale.');
    if (!states.includes(current.state)) throw new Error('The action is not valid in this state.');
    return current;
  }

  private save(current: PortalCase, changes: Partial<PortalCase>): Promise<PortalCase> {
    const updated = { ...current, ...changes, version: current.version + 1 };
    this.cases.set(updated.caseId, updated);
    return Promise.resolve(updated);
  }
}
