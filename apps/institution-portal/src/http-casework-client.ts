import type {
  CaseworkClient,
  CaseworkRole,
  CreatePortalCaseInput,
  PortalCase,
} from './casework-types.js';

type JsonObject = Readonly<Record<string, unknown>>;
type TokenProvider = (role: CaseworkRole) => Promise<string>;

interface HttpCaseworkClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly token: TokenProvider;
}

interface CaseRecord {
  readonly conflictStatus?: PortalCase['conflictStatus'];
  readonly openedAt?: string;
  readonly assignedReviewer?: string | null;
  readonly policyAuthority?: PortalCase['policyAuthority'];
  readonly admissionId: string;
  readonly caseId: string;
  readonly caseReference: string;
  readonly caseType: PortalCase['caseType'];
  readonly institutionId: string;
  readonly policyVersion: string;
  readonly priority: PortalCase['priority'];
  readonly state: PortalCase['state'];
  readonly version: number;
}

function reference(kind: string): string {
  return `SYNTH-${kind}-${crypto.randomUUID().toUpperCase()}`;
}

export class HttpCaseworkClient implements CaseworkClient {
  private readonly admissionReferences = new Map<string, string>();
  private readonly caseTypes = new Map<string, PortalCase['caseType']>();

  public constructor(private readonly options: HttpCaseworkClientOptions) {}

  public async listCases(role: CaseworkRole): Promise<readonly PortalCase[]> {
    const result = await this.request<{ readonly items: readonly CaseRecord[] }>(
      '/v1/institutions/SYNTH-INSTITUTION-001/cases?limit=100',
      role,
    );
    return Promise.all(result.items.map((item) => this.toPortalCase(item, role)));
  }

  public async createCase(input: CreatePortalCaseInput): Promise<PortalCase> {
    const admission = await this.request<JsonObject>(
      `/v1/admissions/${encodeURIComponent(input.admissionReference)}`,
      'INSTITUTION_OPERATOR',
    );
    const admissionId = typeof admission['id'] === 'string' ? admission['id'] : '';
    if (admissionId === '') throw new Error('The admission record has no stable identifier.');
    const created = await this.command<CaseRecord>(
      '/v1/institutions/SYNTH-INSTITUTION-001/cases',
      'INSTITUTION_OPERATOR',
      {
        admissionId,
        caseId: reference('CASE'),
        caseReference: reference('CASE-REFERENCE'),
        caseType: input.caseType,
        policyAuthority: 'AUTHORITY_CONFIGURED',
        policyVersion: 'SYNTH-POLICY-2026-01',
        priority: 'NORMAL',
        reason: input.reason,
      },
    );
    this.admissionReferences.set(admissionId, input.admissionReference);
    return this.toPortalCase(created, 'INSTITUTION_OPERATOR', input.reason);
  }

  public submitCase(caseId: string, expectedVersion: number): Promise<PortalCase> {
    return this.action(caseId, 'submit', 'INSTITUTION_OPERATOR', { expectedVersion });
  }

  public supplyInformation(
    caseId: string,
    expectedVersion: number,
    response: string,
  ): Promise<PortalCase> {
    return this.action(caseId, 'information-responses', 'INSTITUTION_OPERATOR', {
      expectedVersion,
      informationRequestId: `SYNTH-INFORMATION-REQUEST-${caseId}`,
      responseId: reference('INFORMATION-RESPONSE'),
      responseText: response,
    });
  }

  public async startReview(caseId: string, expectedVersion: number): Promise<PortalCase> {
    const assigned = await this.command<CaseRecord>(
      `/v1/cases/${encodeURIComponent(caseId)}/assignments`,
      'AICTE_CHECKER',
      {
        assignmentId: reference('ASSIGNMENT'),
        expectedVersion,
        reviewerReference: 'SYNTH-REVIEWER-001',
      },
    );
    return this.action(caseId, 'review-start', 'AICTE_REVIEWER', {
      expectedVersion: assigned.version,
    });
  }

  public declareConflict(
    caseId: string,
    expectedVersion: number,
    hasConflict: boolean,
  ): Promise<PortalCase> {
    return this.action(caseId, 'conflict-declarations', 'AICTE_REVIEWER', {
      declarationId: reference('CONFLICT'),
      expectedVersion,
      hasConflict,
    });
  }

  public recommendCase(
    caseId: string,
    expectedVersion: number,
    outcome: 'APPROVE' | 'REJECT' | 'MORE_INFORMATION_REQUIRED',
    explanation: string,
  ): Promise<PortalCase> {
    return this.action(caseId, 'recommendations', 'AICTE_REVIEWER', {
      expectedVersion,
      explanation,
      policyVersion: 'SYNTH-POLICY-2026-01',
      reasonCode: 'SYNTH-REVIEW-OUTCOME',
      recommendation: outcome,
      recommendationId: reference('RECOMMENDATION'),
    });
  }

  public decideCase(
    caseId: string,
    expectedVersion: number,
    outcome: 'APPROVED' | 'REJECTED',
    explanation: string,
  ): Promise<PortalCase> {
    return this.action(caseId, 'decisions', 'AICTE_CHECKER', {
      decisionId: reference('CASE-DECISION'),
      expectedVersion,
      explanation,
      outcome,
      policyVersion: 'SYNTH-POLICY-2026-01',
      reasonCode: 'SYNTH-CHECKER-DECISION',
    });
  }

  public async implementCase(caseId: string, expectedVersion: number): Promise<PortalCase> {
    const caseType = this.caseTypes.get(caseId);
    if (caseType !== 'ADMISSION_CANCELLATION') {
      throw new Error(
        'Transfer implementation needs an authority-configured target admission and is intentionally disabled.',
      );
    }
    await this.command(
      `/v1/cases/${encodeURIComponent(caseId)}/implement-cancellation`,
      'AICTE_CHECKER',
      {
        expectedVersion,
        implementationId: reference('IMPLEMENTATION'),
        receiptReference: reference('IMPLEMENTATION-RECEIPT'),
        sourceAdmissionVersionId: reference('ADMISSION-VERSION'),
      },
    );
    const updated = await this.request<CaseRecord>(
      `/v1/cases/${encodeURIComponent(caseId)}`,
      'AICTE_CHECKER',
    );
    return this.toPortalCase(updated, 'AICTE_CHECKER');
  }

  private async action(
    caseId: string,
    action: string,
    role: CaseworkRole,
    body: JsonObject,
  ): Promise<PortalCase> {
    const updated = await this.command<CaseRecord>(
      `/v1/cases/${encodeURIComponent(caseId)}/${action}`,
      role,
      body,
    );
    return this.toPortalCase(updated, role);
  }

  private async toPortalCase(
    item: CaseRecord,
    role: CaseworkRole,
    summary = 'Persistent governed case. Open the immutable history for full evidence.',
  ): Promise<PortalCase> {
    {
      item = await this.request<CaseRecord>(`/v1/cases/${encodeURIComponent(item.caseId)}`, role);
    }
    this.caseTypes.set(item.caseId, item.caseType);
    let admissionReference = this.admissionReferences.get(item.admissionId);
    if (admissionReference === undefined) {
      const admission = await this.request<JsonObject>(
        `/v1/admissions/${encodeURIComponent(item.admissionId)}`,
        role,
      );
      admissionReference =
        typeof admission['registration_reference'] === 'string'
          ? admission['registration_reference']
          : typeof admission['registrationReference'] === 'string'
            ? admission['registrationReference']
            : item.admissionId;
      this.admissionReferences.set(item.admissionId, admissionReference);
    }
    return {
      admissionReference,
      assignedReviewer: item.assignedReviewer ?? null,
      caseId: item.caseId,
      caseReference: item.caseReference,
      caseType: item.caseType,
      conflictStatus: item.conflictStatus ?? 'NOT_DECLARED',
      implementationReceipt: null,
      institutionId: item.institutionId,
      lastAction: `Persistent state changed to ${item.state.toLowerCase().replaceAll('_', ' ')}.`,
      openedAt: item.openedAt ?? 'Not recorded',
      policyAuthority: item.policyAuthority ?? 'AUTHORITY_CONFIGURED',
      policyVersion: item.policyVersion,
      priority: item.priority,
      state: item.state,
      summary,
      version: item.version,
    };
  }

  private command<T = unknown>(path: string, role: CaseworkRole, body: JsonObject): Promise<T> {
    return this.request(path, role, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': reference('CASE-COMMAND'),
      },
      method: 'POST',
    });
  }

  private async request<T>(path: string, role: CaseworkRole, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${await this.options.token(role)}`);
    const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const body = (await response.json().catch(() => ({}))) as {
      readonly detail?: string;
    } & T;
    if (!response.ok) throw new Error(body.detail ?? 'The connected casework request failed.');
    return body;
  }
}
