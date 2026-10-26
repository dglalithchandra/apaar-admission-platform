import type { GatewayAction, Principal } from './model.js';
import { GatewayProblem } from './model.js';
import { authorize } from './auth.js';

export interface DelegatedRoute {
  readonly action: GatewayAction;
  readonly body: 'NONE' | 'JSON' | 'MULTIPART';
  readonly idempotent: boolean;
  readonly method: 'GET' | 'PATCH' | 'POST';
  readonly operationId: string;
  readonly pattern: RegExp;
  readonly status: number;
}

const route = (
  method: DelegatedRoute['method'],
  path: string,
  operationId: string,
  action: GatewayAction,
  status: number,
  body: DelegatedRoute['body'] = 'NONE',
  idempotent = false,
): DelegatedRoute => ({
  action,
  body,
  idempotent,
  method,
  operationId,
  pattern: new RegExp(`^${path}$`),
  status,
});

const institution = '(?<institutionId>[^/]+)';
const batch = '(?<batchId>[^/]+)';
const record = '(?<recordKey>[^/]+)';
const caseId = '(?<caseId>[^/]+)';
const pilot = '(?<pilotReference>[^/]+)';
const migration = '(?<migrationReference>[^/]+)';

export const DELEGATED_ROUTES: readonly DelegatedRoute[] = [
  route(
    'POST',
    `/v1/institutions/${institution}/admission-batches`,
    'createAdmissionBatch',
    'BATCH_WRITE',
    202,
    'MULTIPART',
    true,
  ),
  route(
    'GET',
    '/v1/admission-batches/templates',
    'listAdmissionBatchTemplates',
    'METADATA_READ',
    200,
  ),
  route(
    'GET',
    '/v1/admission-batches/templates/(?<templateVersion>[^/]+)\\.csv',
    'downloadAdmissionBatchTemplate',
    'METADATA_READ',
    200,
  ),
  route(
    'POST',
    `/v1/institutions/${institution}/admissions`,
    'submitAdmission',
    'ADMISSION_WRITE',
    201,
    'JSON',
    true,
  ),
  route('GET', `/v1/admission-batches/${batch}`, 'getAdmissionBatch', 'RECORD_READ', 200),
  route('GET', `/v1/admission-batches/${batch}/rows`, 'listAdmissionBatchRows', 'RECORD_READ', 200),
  route(
    'GET',
    `/v1/admission-batches/${batch}/rows/${record}`,
    'getAdmissionBatchRow',
    'RECORD_READ',
    200,
  ),
  route(
    'POST',
    `/v1/admission-batches/${batch}/rows/${record}/retry`,
    'retryAdmissionBatchRow',
    'BATCH_WRITE',
    202,
    'JSON',
    true,
  ),
  route(
    'GET',
    `/v1/admission-batches/${batch}/corrections\\.csv`,
    'downloadAdmissionBatchCorrections',
    'RECORD_READ',
    200,
  ),
  route('GET', '/v1/admissions/(?<admissionReference>[^/]+)', 'getAdmission', 'RECORD_READ', 200),
  route('GET', `/v1/institutions/${institution}/cases`, 'listAdmissionCases', 'CASE_READ', 200),
  route(
    'POST',
    `/v1/institutions/${institution}/cases`,
    'createAdmissionCase',
    'CASE_CREATE',
    201,
    'JSON',
    true,
  ),
  route('GET', `/v1/cases/${caseId}`, 'getAdmissionCase', 'CASE_READ', 200),
  route(
    'PATCH',
    `/v1/cases/${caseId}`,
    'saveAdmissionCaseDraft',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/submit`,
    'submitAdmissionCase',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/withdraw`,
    'withdrawAdmissionCase',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/assignments`,
    'assignAdmissionCaseReviewer',
    'CASE_RECOMMEND',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/conflict-declarations`,
    'declareAdmissionCaseConflict',
    'CASE_RECOMMEND',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/information-requests`,
    'requestAdmissionCaseInformation',
    'CASE_RECOMMEND',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/information-responses`,
    'supplyAdmissionCaseInformation',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/recommendations`,
    'recommendAdmissionCaseOutcome',
    'CASE_RECOMMEND',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/decisions`,
    'decideAdmissionCase',
    'CASE_DECIDE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/correction-proposal`,
    'addAdmissionCaseCorrectionProposal',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/evidence`,
    'addAdmissionCaseEvidence',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/purpose-records`,
    'recordAdmissionCasePurpose',
    'CASE_INSTITUTION_ACT',
    200,
    'JSON',
    true,
  ),
  route('GET', `/v1/cases/${caseId}/history`, 'listAdmissionCaseHistory', 'CASE_READ', 200),
  route(
    'POST',
    `/v1/institutions/${institution}/appeals`,
    'createAdmissionCaseAppeal',
    'CASE_INSTITUTION_ACT',
    201,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/appeal-decision`,
    'decideAdmissionCaseAppeal',
    'CASE_DECIDE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/implement-cancellation`,
    'implementAdmissionCancellation',
    'CASE_DECIDE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/implement-transfer`,
    'implementAdmissionTransfer',
    'CASE_DECIDE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/cases/${caseId}/implement-appeal-remedy`,
    'implementAdmissionAppealRemedy',
    'CASE_DECIDE',
    200,
    'JSON',
    true,
  ),
  route('GET', '/v1/casework/case-types', 'listCaseworkCaseTypes', 'METADATA_READ', 200),
  route('GET', '/v1/casework/reason-codes', 'listCaseworkReasonCodes', 'METADATA_READ', 200),
  route('GET', '/v1/casework/policies', 'listCaseworkPolicies', 'METADATA_READ', 200),
  route('GET', `/v1/cases/${caseId}/audit`, 'listAdmissionCaseAudit', 'AUDIT_READ', 200),
  route('POST', '/v1/pilots', 'createPilotConfiguration', 'PILOT_MANAGE', 201, 'JSON', true),
  route('GET', `/v1/pilots/${pilot}`, 'getPilotConfiguration', 'PILOT_READ', 200),
  route(
    'POST',
    `/v1/pilots/${pilot}/readiness`,
    'assessPilotReadiness',
    'PILOT_MANAGE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/pilots/${pilot}/reconciliation`,
    'reconcilePilot',
    'PILOT_MANAGE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/pilots/${pilot}/activate`,
    'activatePilot',
    'PILOT_ACTIVATE',
    200,
    'JSON',
    true,
  ),
  route('POST', `/v1/pilots/${pilot}/pause`, 'pausePilot', 'PILOT_MANAGE', 200, 'JSON', true),
  route('POST', `/v1/pilots/${pilot}/resume`, 'resumePilot', 'PILOT_ACTIVATE', 200, 'JSON', true),
  route('POST', `/v1/pilots/${pilot}/exit`, 'exitPilot', 'PILOT_ACTIVATE', 200, 'JSON', true),
  route(
    'POST',
    `/v1/pilots/${pilot}/expand`,
    'expandPilotCohort',
    'PILOT_MANAGE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/pilots/${pilot}/kill-switches`,
    'setPilotKillSwitches',
    'PILOT_MANAGE',
    200,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/pilots/${pilot}/migrations`,
    'createPilotMigration',
    'PILOT_MIGRATE',
    201,
    'JSON',
    true,
  ),
  route(
    'POST',
    `/v1/pilot-migrations/${migration}/rollback`,
    'rollbackPilotMigration',
    'PILOT_MIGRATE',
    200,
    'JSON',
    true,
  ),
  route(
    'GET',
    `/v1/institutions/${institution}/pilot-readiness`,
    'getInstitutionPilotReadiness',
    'PILOT_INSTITUTION_READ',
    200,
  ),
];

const DELEGATED_STATUS_BY_OPERATION = new Map(
  DELEGATED_ROUTES.map(({ operationId, status }) => [operationId, status]),
);

export function delegatedSuccessStatus(operationId: string): number {
  const status = DELEGATED_STATUS_BY_OPERATION.get(operationId);
  if (status === undefined) {
    throw new Error(`Unknown delegated operation: ${operationId}`);
  }
  return status;
}

export const NATIVE_OPERATIONS = new Set([
  'getHealth',
  'getReadiness',
  'getDependencyStatus',
  'getMetrics',
  'importApprovalManifest',
  'processOneNotification',
  'requestAcademicIdentityVerification',
  'createPurposeLimitedVerification',
  'getVerificationReceipt',
  'revokeVerificationReceipt',
]);

export function matchDelegatedRoute(
  method: string | undefined,
  pathname: string,
): { readonly route: DelegatedRoute; readonly path: Readonly<Record<string, string>> } | null {
  for (const candidate of DELEGATED_ROUTES) {
    if (candidate.method !== method) continue;
    const match = candidate.pattern.exec(pathname);
    if (match === null) continue;
    return {
      path: Object.fromEntries(
        Object.entries(match.groups ?? {}).map(([key, value]) => [key, decodeURIComponent(value)]),
      ),
      route: candidate,
    };
  }
  return null;
}

export function authorizeDelegatedRoute(
  principal: Principal,
  matched: ReturnType<typeof matchDelegatedRoute> & object,
): void {
  authorize(principal, matched.route.action, matched.path['institutionId'] ?? null);
}

export function requireIdempotencyKey(value: string | string[] | undefined): string {
  const key = Array.isArray(value) ? value[0] : value;
  if (key === undefined || key.length < 8 || key.length > 128) {
    throw new GatewayProblem(
      'IDEMPOTENCY_KEY_REQUIRED',
      422,
      'A valid Idempotency-Key is required.',
    );
  }
  return key;
}
