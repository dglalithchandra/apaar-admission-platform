export interface IntegrationReadiness {
  readonly apaar: 'UP' | 'DEGRADED' | 'DISABLED';
  readonly database: 'UP' | 'DEGRADED' | 'DISABLED';
  readonly notifications: 'UP' | 'DEGRADED' | 'DISABLED';
  readonly status: 'UP' | 'DEGRADED';
}

export interface IntegrationVerificationReceipt {
  readonly purpose?: string;
  readonly requesterOrganisation?: string;
  readonly legalBasisReference?: string;
  readonly algorithm: string;
  readonly claims: Readonly<Record<string, string | boolean>>;
  readonly expiresAt: string;
  readonly keyId: string;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  readonly verificationReference: string;
}

export interface IntegrationClient {
  readonly supportsPreviews?: boolean;
  receiptStatus?(reference: string): Promise<IntegrationVerificationReceipt>;
  createSyntheticVerification(): Promise<IntegrationVerificationReceipt>;
  readiness(): Promise<IntegrationReadiness>;
  simulateNotification(
    state: 'PENDING' | 'DEAD_LETTER',
  ): Promise<{ readonly state: 'PENDING' | 'DEAD_LETTER' }>;
  simulateReceiptStatus(status: 'EXPIRED' | 'REVOKED'): Promise<IntegrationVerificationReceipt>;
  simulateAccess(state: 'UNAUTHENTICATED' | 'FORBIDDEN'): Promise<never>;
  simulateProviderOutage(): Promise<{ readonly status: 'TEMPORARILY_UNAVAILABLE' }>;
}

export class IntegrationClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationClientError';
  }
}
