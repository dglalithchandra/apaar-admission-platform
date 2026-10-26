import { createHash } from 'node:crypto';
import type {
  ApprovalImportManifest,
  ApprovalIntegrityPort,
  ApprovalImportPort,
  ApprovalImportResult,
  Principal,
} from './model.js';
import { GatewayProblem } from './model.js';

export interface ApprovalManifestRepository {
  findApproval(
    importReference: string,
  ): Promise<{ readonly digest: string; readonly result: ApprovalImportResult } | null>;
  saveApproval(
    manifest: ApprovalImportManifest,
    result: ApprovalImportResult,
    principal: Principal,
  ): Promise<void>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(',')}}`;
}

export function manifestDigest(payload: Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

function signaturePayload(manifest: ApprovalImportManifest): string {
  const { integrity: _integrity, ...unsigned } = manifest;
  return canonical(unsigned);
}

export class SyntheticManifestIntegrityAdapter implements ApprovalIntegrityPort {
  public constructor(environment: 'development' | 'test' | 'production') {
    if (environment === 'production') {
      throw new GatewayProblem(
        'UNSAFE_PRODUCTION_CONFIGURATION',
        500,
        'Synthetic manifest integrity cannot run in production.',
      );
    }
  }

  public sign(
    manifest: Omit<ApprovalImportManifest, 'integrity'>,
  ): ApprovalImportManifest['integrity'] {
    return {
      algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
      keyId: 'SYNTH-MANIFEST-KEY-001',
      signature: createHash('sha256')
        .update(`SYNTHETIC:${canonical(manifest)}`)
        .digest('hex'),
    };
  }

  public verify(manifest: ApprovalImportManifest): Promise<boolean> {
    const expected = createHash('sha256')
      .update(`SYNTHETIC:${signaturePayload(manifest)}`)
      .digest('hex');
    return Promise.resolve(
      manifest.integrity.algorithm === 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION' &&
        manifest.integrity.keyId === 'SYNTH-MANIFEST-KEY-001' &&
        manifest.integrity.signature === expected,
    );
  }
}

export class ApprovalImportService implements ApprovalImportPort {
  public constructor(
    private readonly repository: ApprovalManifestRepository,
    private readonly integrity: ApprovalIntegrityPort,
  ) {}

  public async import(
    manifest: ApprovalImportManifest,
    principal: Principal,
  ): Promise<ApprovalImportResult> {
    if (!/^SYNTH-[A-Z0-9-]+$/.test(manifest.importReference)) {
      throw new GatewayProblem('IMPORT_REFERENCE_INVALID', 422, 'The import reference is invalid.');
    }
    if (!(await this.integrity.verify(manifest))) {
      throw new GatewayProblem(
        'IMPORT_INTEGRITY_INVALID',
        422,
        'The approval manifest integrity proof is invalid.',
      );
    }
    if (manifest.effectiveTo !== null && manifest.effectiveTo < manifest.effectiveFrom) {
      throw new GatewayProblem(
        'EFFECTIVE_RANGE_INVALID',
        422,
        'The effective date range is invalid.',
      );
    }
    if (
      manifest.supersedesImportReference !== null &&
      !/^SYNTH-[A-Z0-9-]+$/.test(manifest.supersedesImportReference)
    ) {
      throw new GatewayProblem(
        'SUPERSEDED_IMPORT_REFERENCE_INVALID',
        422,
        'The superseded import reference is invalid.',
      );
    }
    if (manifestDigest(manifest.payload) !== manifest.digestSha256) {
      throw new GatewayProblem(
        'IMPORT_DIGEST_MISMATCH',
        422,
        'The approval manifest digest does not match.',
      );
    }
    const prior = await this.repository.findApproval(manifest.importReference);
    if (prior !== null) {
      if (prior.digest !== manifest.digestSha256) {
        throw new GatewayProblem(
          'IDEMPOTENCY_CONFLICT',
          409,
          'The import reference was reused for different content.',
        );
      }
      return { ...prior.result, replayed: true };
    }
    const result: ApprovalImportResult = {
      importReference: manifest.importReference,
      replayed: false,
      status: manifest.authority === 'PROPOSED' ? 'PROPOSED' : 'IMPORTED',
    };
    try {
      await this.repository.saveApproval(manifest, result, principal);
      return result;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        const concurrent = await this.repository.findApproval(manifest.importReference);
        if (concurrent?.digest === manifest.digestSha256) {
          return { ...concurrent.result, replayed: true };
        }
        throw new GatewayProblem(
          'IDEMPOTENCY_CONFLICT',
          409,
          'The import reference was reused for different content.',
        );
      }
      throw error;
    }
  }
}

export class InMemoryApprovalManifestRepository implements ApprovalManifestRepository {
  private readonly values = new Map<
    string,
    { readonly digest: string; readonly result: ApprovalImportResult }
  >();

  public findApproval(
    importReference: string,
  ): Promise<{ readonly digest: string; readonly result: ApprovalImportResult } | null> {
    return Promise.resolve(this.values.get(importReference) ?? null);
  }

  public saveApproval(
    manifest: ApprovalImportManifest,
    result: ApprovalImportResult,
  ): Promise<void> {
    this.values.set(manifest.importReference, { digest: manifest.digestSha256, result });
    return Promise.resolve();
  }
}
