export interface IntegrationReadiness {
  readonly apaar: 'UP' | 'DEGRADED' | 'DISABLED';
  readonly database: 'UP' | 'DEGRADED' | 'DISABLED';
  readonly notifications: 'UP' | 'DEGRADED' | 'DISABLED';
  readonly status: 'UP' | 'DEGRADED';
}

export interface IntegrationVerificationReceipt {
  readonly algorithm: string;
  readonly claims: Readonly<Record<string, string | boolean>>;
  readonly expiresAt: string;
  readonly keyId: string;
  readonly verificationReference: string;
}

export interface IntegrationClient {
  createSyntheticVerification(): Promise<IntegrationVerificationReceipt>;
  readiness(): Promise<IntegrationReadiness>;
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
