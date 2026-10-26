import type {
  AcademicIdentityPort,
  AcademicIdentityResult,
  AcademicIdentityStatus,
  GatewayClock,
} from './model.js';
import { GatewayProblem } from './model.js';

export class AcademicIdentitySimulator implements AcademicIdentityPort {
  public constructor(private readonly clock: GatewayClock) {}

  public verify(input: {
    readonly academicIdentity: string;
    readonly correlationReference: string;
    readonly purpose: 'ADMISSION_LINKING' | 'CORRECTION_REVIEW';
  }): Promise<AcademicIdentityResult> {
    const outcomes: Readonly<Record<string, AcademicIdentityStatus>> = {
      'SYNTH-MISMATCH': 'MISMATCH',
      'SYNTH-NOT-ELIGIBLE': 'NOT_ELIGIBLE_FOR_APAAR',
      'SYNTH-NOT-FOUND': 'NOT_FOUND',
      'SYNTH-OUTAGE': 'TEMPORARILY_UNAVAILABLE',
      'SYNTH-RATE-LIMITED': 'RATE_LIMITED',
      'SYNTH-REVIEW': 'MANUAL_REVIEW',
      'SYNTH-UNVERIFIED': 'UNVERIFIED',
      'SYNTH-VERIFIED': 'VERIFIED',
    };
    return Promise.resolve({
      checkedAt: this.clock.now(),
      providerContractVersion: 'SYNTH-1.0',
      providerRequestReference: `SYNTH-PROVIDER-${input.correlationReference}`,
      status: outcomes[input.academicIdentity] ?? 'UNVERIFIED',
    });
  }
}

export interface AuthorizedProviderTranslator {
  decode(status: number, body: unknown, checkedAt: string): AcademicIdentityResult;
  encode(input: {
    readonly academicIdentity: string;
    readonly purpose: 'ADMISSION_LINKING' | 'CORRECTION_REVIEW';
  }): unknown;
}

export interface AuthorizedAcademicIdentityAdapterOptions {
  readonly clock: GatewayClock;
  readonly fetch: typeof fetch;
  readonly maximumAttempts: number;
  readonly openAfterFailures: number;
  readonly operationUrl: string;
  readonly timeoutMs: number;
  readonly translator: AuthorizedProviderTranslator;
}

export class AuthorizedAcademicIdentityAdapter implements AcademicIdentityPort {
  private failures = 0;
  private circuitOpen = false;

  public constructor(private readonly options: AuthorizedAcademicIdentityAdapterOptions) {
    if (!options.operationUrl.startsWith('https://')) {
      throw new GatewayProblem(
        'EXTERNAL_CONTRACT_UNAVAILABLE',
        500,
        'The provider URL must use HTTPS.',
      );
    }
  }

  public async verify(input: {
    readonly academicIdentity: string;
    readonly correlationReference: string;
    readonly purpose: 'ADMISSION_LINKING' | 'CORRECTION_REVIEW';
  }): Promise<AcademicIdentityResult> {
    if (this.circuitOpen) return this.unavailable();
    for (let attempt = 1; attempt <= this.options.maximumAttempts; attempt += 1) {
      try {
        const response = await this.options.fetch(this.options.operationUrl, {
          body: JSON.stringify(this.options.translator.encode(input)),
          headers: {
            'content-type': 'application/json',
            'x-correlation-id': input.correlationReference,
          },
          method: 'POST',
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        if (response.status === 429) {
          this.recordFailure();
          if (attempt === this.options.maximumAttempts) return this.rateLimited();
          continue;
        }
        if (response.status >= 500) {
          this.recordFailure();
          if (attempt === this.options.maximumAttempts) return this.unavailable();
          continue;
        }
        const body = (await response.json()) as unknown;
        const result = this.options.translator.decode(
          response.status,
          body,
          this.options.clock.now(),
        );
        this.failures = 0;
        return result;
      } catch {
        this.recordFailure();
        if (attempt === this.options.maximumAttempts) return this.unavailable();
      }
    }
    return this.unavailable();
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.openAfterFailures) this.circuitOpen = true;
  }

  private unavailable(): AcademicIdentityResult {
    return {
      checkedAt: this.options.clock.now(),
      providerContractVersion: 'AUTHORIZED-CONTRACT-PENDING',
      providerRequestReference: null,
      status: 'TEMPORARILY_UNAVAILABLE',
    };
  }

  private rateLimited(): AcademicIdentityResult {
    return { ...this.unavailable(), status: 'RATE_LIMITED' };
  }
}
