import { createHash } from 'node:crypto';
import type {
  ApprovalImportManifest,
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

export class ApprovalImportService implements ApprovalImportPort {
  public constructor(private readonly repository: ApprovalManifestRepository) {}

  public async import(
    manifest: ApprovalImportManifest,
    principal: Principal,
  ): Promise<ApprovalImportResult> {
    if (!/^SYNTH-[A-Z0-9-]+$/.test(manifest.importReference)) {
      throw new GatewayProblem('IMPORT_REFERENCE_INVALID', 422, 'The import reference is invalid.');
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
    await this.repository.saveApproval(manifest, result, principal);
    return result;
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
