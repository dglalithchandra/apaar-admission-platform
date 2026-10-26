import type {
  IntegrationClient,
  IntegrationReadiness,
  IntegrationVerificationReceipt,
} from './integration-types.js';
import { IntegrationClientError } from './integration-types.js';

export class DemoIntegrationClient implements IntegrationClient {
  public createSyntheticVerification(): Promise<IntegrationVerificationReceipt> {
    return Promise.resolve({
      algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
      claims: { ADMISSION_EXISTS: true, CURRENT_STATUS: 'ACCEPTED' },
      expiresAt: '2026-10-26T12:15:00.000Z',
      keyId: 'SYNTH-SIGNING-KEY-001',
      verificationReference: 'SYNTH-VERIFICATION-PORTAL-001',
    });
  }

  public readiness(): Promise<IntegrationReadiness> {
    return Promise.resolve({
      apaar: 'DISABLED',
      database: 'UP',
      notifications: 'DISABLED',
      status: 'UP',
    });
  }

  public simulateAccess(state: 'UNAUTHENTICATED' | 'FORBIDDEN'): Promise<never> {
    return Promise.reject(
      new IntegrationClientError(
        state,
        state === 'UNAUTHENTICATED'
          ? 'Sign in with an authorised account before continuing.'
          : 'Your authenticated role cannot perform this action.',
      ),
    );
  }

  public simulateProviderOutage(): Promise<{ readonly status: 'TEMPORARILY_UNAVAILABLE' }> {
    return Promise.resolve({ status: 'TEMPORARILY_UNAVAILABLE' });
  }
}
