import type {
  IntegrationClient,
  IntegrationReadiness,
  IntegrationVerificationReceipt,
} from './integration-types.js';
import { IntegrationClientError } from './integration-types.js';

interface HttpIntegrationClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly token: () => Promise<string | null>;
}

export class HttpIntegrationClient implements IntegrationClient {
  public constructor(private readonly options: HttpIntegrationClientOptions) {}

  public readiness(): Promise<IntegrationReadiness> {
    return this.request<IntegrationReadiness>('/ready', { method: 'GET' }, false);
  }

  public createSyntheticVerification(): Promise<IntegrationVerificationReceipt> {
    return this.request<IntegrationVerificationReceipt>('/v1/verifications', {
      body: JSON.stringify({
        admissionReference: 'SYNTH-REGISTRATION-001',
        consentReference: null,
        legalBasisReference: 'SYNTH-LEGAL-BASIS-001',
        purpose: 'SYNTH-PORTAL-ACCEPTANCE',
        requestedClaims: ['ADMISSION_EXISTS', 'CURRENT_STATUS'],
      }),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'SYNTH-PORTAL-IDEMPOTENCY-001',
      },
      method: 'POST',
    });
  }

  public simulateAccess(state: 'UNAUTHENTICATED' | 'FORBIDDEN'): Promise<never> {
    return Promise.reject(
      new IntegrationClientError(
        state,
        'Access-state simulation is available only in the explicit demo adapter.',
      ),
    );
  }

  public requestProviderOutage(): Promise<{ readonly status: 'TEMPORARILY_UNAVAILABLE' }> {
    return this.request('/v1/academic-identity/verifications', {
      body: JSON.stringify({ academicIdentity: 'SYNTH-OUTAGE', purpose: 'ADMISSION_LINKING' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
  }

  public simulateProviderOutage(): Promise<{ readonly status: 'TEMPORARILY_UNAVAILABLE' }> {
    return this.requestProviderOutage();
  }

  public simulateNotification(
    state: 'PENDING' | 'DEAD_LETTER',
  ): Promise<{ readonly state: 'PENDING' | 'DEAD_LETTER' }> {
    return Promise.reject(
      new IntegrationClientError(
        state,
        'Notification-state simulation is available only in the explicit demo adapter.',
      ),
    );
  }

  public simulateReceiptStatus(
    status: 'EXPIRED' | 'REVOKED',
  ): Promise<IntegrationVerificationReceipt> {
    return Promise.reject(
      new IntegrationClientError(
        status,
        'Receipt-state simulation is available only in the explicit demo adapter.',
      ),
    );
  }

  private async request<T>(path: string, init: RequestInit, authenticated = true): Promise<T> {
    const token = authenticated ? await this.options.token() : null;
    const headers = new Headers(init.headers);
    if (token !== null) headers.set('authorization', `Bearer ${token}`);
    const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers,
    });
    const body = (await response.json()) as {
      readonly detail?: string;
      readonly errors?: readonly { readonly code?: string }[];
    } & T;
    if (!response.ok) {
      throw new IntegrationClientError(
        body.errors?.[0]?.code ?? 'REQUEST_FAILED',
        body.detail ?? 'The gateway request failed.',
      );
    }
    return body;
  }
}
