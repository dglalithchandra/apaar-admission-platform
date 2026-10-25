import { asIsoDateTime } from '@apaar-platform/admission-domain';
import type {
  AcademicIdentityVerifierPort,
  MalwareScannerPort,
  ObjectStoragePort,
} from './ports.js';

export class InMemoryObjectStorage implements ObjectStoragePort {
  public readonly objects = new Map<string, readonly Buffer[]>();

  public put(
    reference: string,
    content: readonly Buffer[],
    _metadata: Readonly<Record<string, string>>,
  ): Promise<void> {
    this.objects.set(
      reference,
      content.map((chunk) => Buffer.from(chunk)),
    );
    return Promise.resolve();
  }
}

export class DeterministicMalwareScanner implements MalwareScannerPort {
  public scan(content: readonly Buffer[]): Promise<'CLEAN' | 'INFECTED' | 'UNAVAILABLE'> {
    const marker = Buffer.concat(content).toString('utf8');
    if (marker.includes('SYNTH-MALWARE-MARKER')) return Promise.resolve('INFECTED');
    if (marker.includes('SYNTH-SCANNER-UNAVAILABLE')) return Promise.resolve('UNAVAILABLE');
    return Promise.resolve('CLEAN');
  }
}

export class DeterministicAcademicIdentityVerifier implements AcademicIdentityVerifierPort {
  public verify(
    request: Parameters<AcademicIdentityVerifierPort['verify']>[0],
  ): ReturnType<AcademicIdentityVerifierPort['verify']> {
    const reference = request.academicIdentityReference;
    const status = reference.includes('NOT-FOUND')
      ? 'NOT_FOUND'
      : reference.includes('MISMATCH')
        ? 'MISMATCH'
        : reference.includes('NOT-ELIGIBLE')
          ? 'NOT_ELIGIBLE_FOR_APAAR'
          : reference.includes('MANUAL')
            ? 'MANUAL_REVIEW'
            : reference.includes('RATE-LIMITED')
              ? 'RATE_LIMITED'
              : reference.includes('OUTAGE')
                ? 'TEMPORARILY_UNAVAILABLE'
                : 'VERIFIED';
    return Promise.resolve({
      checkedAt: asIsoDateTime('2026-08-01T08:00:00.000Z'),
      providerContractVersion: 'SYNTH-IDENTITY-SIMULATOR-1',
      providerRequestReference: `SYNTH-PROVIDER-${request.correlationReference}`,
      status,
    });
  }
}
