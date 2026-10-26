import type { AuthenticationPort, GatewayAction, GatewayRole, Principal } from './model.js';
import { GatewayProblem } from './model.js';

const ACTION_ROLES: Readonly<Record<GatewayAction, readonly GatewayRole[]>> = {
  ADMISSION_WRITE: ['INSTITUTION_ADMINISTRATOR'],
  APPROVAL_IMPORT: ['SERVICE_INTEGRATION_CLIENT'],
  AUDIT_READ: ['AUDITOR'],
  BATCH_WRITE: ['INSTITUTION_OPERATOR', 'INSTITUTION_ADMINISTRATOR'],
  CASE_CREATE: ['INSTITUTION_OPERATOR', 'INSTITUTION_ADMINISTRATOR'],
  CASE_DECIDE: ['AICTE_CHECKER'],
  CASE_INSTITUTION_ACT: ['INSTITUTION_OPERATOR', 'INSTITUTION_ADMINISTRATOR'],
  CASE_READ: [
    'INSTITUTION_OPERATOR',
    'INSTITUTION_ADMINISTRATOR',
    'AICTE_REVIEWER',
    'AICTE_CHECKER',
  ],
  CASE_RECOMMEND: ['AICTE_REVIEWER'],
  IDENTITY_VERIFY: [
    'INSTITUTION_OPERATOR',
    'INSTITUTION_ADMINISTRATOR',
    'AICTE_REVIEWER',
    'SERVICE_INTEGRATION_CLIENT',
  ],
  NOTIFICATION_PROCESS: ['SERVICE_INTEGRATION_CLIENT'],
  PILOT_ACTIVATE: ['AICTE_CHECKER'],
  PILOT_INSTITUTION_READ: ['INSTITUTION_OPERATOR', 'INSTITUTION_ADMINISTRATOR'],
  PILOT_MANAGE: ['SERVICE_INTEGRATION_CLIENT'],
  PILOT_MIGRATE: ['SERVICE_INTEGRATION_CLIENT'],
  PILOT_READ: ['AICTE_REVIEWER', 'AICTE_CHECKER', 'AUDITOR', 'SERVICE_INTEGRATION_CLIENT'],
  METADATA_READ: [
    'INSTITUTION_OPERATOR',
    'INSTITUTION_ADMINISTRATOR',
    'AICTE_REVIEWER',
    'AICTE_CHECKER',
  ],
  RECORD_READ: [
    'INSTITUTION_OPERATOR',
    'INSTITUTION_ADMINISTRATOR',
    'AICTE_REVIEWER',
    'AICTE_CHECKER',
  ],
  VERIFICATION_CREATE: ['AUTHORIZED_VERIFIER'],
  VERIFICATION_READ: ['AUTHORIZED_VERIFIER', 'AUDITOR'],
  VERIFICATION_REVOKE: ['SERVICE_INTEGRATION_CLIENT'],
};

export class SyntheticTokenAuthenticator implements AuthenticationPort {
  private readonly tokens: ReadonlyMap<string, Principal>;

  public constructor(
    environment: 'development' | 'test' | 'production',
    tokens: ReadonlyMap<string, Principal>,
  ) {
    if (environment === 'production') {
      throw new GatewayProblem(
        'UNSAFE_PRODUCTION_CONFIGURATION',
        500,
        'Synthetic authentication cannot be enabled in production.',
      );
    }
    this.tokens = tokens;
  }

  public authenticate(authorization: string | undefined): Promise<Principal | null> {
    if (!authorization?.startsWith('Bearer ')) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.tokens.get(authorization.slice(7)) ?? null);
  }
}

export interface JwtVerificationPort {
  verify(token: string): Promise<Principal | null>;
}

export class OidcBearerAuthenticator implements AuthenticationPort {
  public constructor(private readonly verifier: JwtVerificationPort) {}

  public authenticate(authorization: string | undefined): Promise<Principal | null> {
    if (!authorization?.startsWith('Bearer ')) {
      return Promise.resolve(null);
    }
    return this.verifier.verify(authorization.slice(7));
  }
}

export function authorize(
  principal: Principal,
  action: GatewayAction,
  institutionId: string | null = null,
): void {
  if (!ACTION_ROLES[action].some((role) => principal.roles.includes(role))) {
    throw new GatewayProblem(
      'ACTION_FORBIDDEN',
      403,
      'The authenticated role cannot perform this action.',
    );
  }
  if (
    institutionId !== null &&
    principal.roles.some((role) =>
      ['INSTITUTION_OPERATOR', 'INSTITUTION_ADMINISTRATOR'].includes(role),
    ) &&
    principal.institutionId !== institutionId
  ) {
    throw new GatewayProblem(
      'TENANT_SCOPE_DENIED',
      404,
      'The resource is not visible to this institution.',
    );
  }
}
