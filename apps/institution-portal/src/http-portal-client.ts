import type {
  AdmissionListItem,
  AdmissionEvidence,
  PortalBatch,
  PortalClient,
  PortalRow,
} from './types.js';

interface HttpPortalClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly token: () => Promise<string>;
}

interface BatchSummaryResponse extends Omit<PortalBatch, 'totals'> {
  readonly totals: {
    readonly accepted: number;
    readonly failedFinal: number;
    readonly invalid: number;
    readonly manualReview: number;
    readonly pending: number;
    readonly rejected: number;
    readonly retryable: number;
    readonly total: number;
  };
}

function portalBatch(value: BatchSummaryResponse): PortalBatch {
  return {
    ...value,
    totals: { ...value.totals, failed: value.totals.failedFinal },
  };
}

export class HttpPortalClient implements PortalClient {
  public constructor(private readonly options: HttpPortalClientOptions) {}

  public listAdmissions(
    search: string,
    after: string,
  ): Promise<{ items: readonly AdmissionListItem[]; nextCursor: string | null }> {
    return this.json(
      `/v1/institutions/SYNTH-INSTITUTION-001/admissions?${new URLSearchParams({ search, after })}`,
    );
  }
  public admissionEvidence(reference: string): Promise<AdmissionEvidence> {
    return this.json(`/v1/admissions/${encodeURIComponent(reference)}`);
  }
  public async printableRecord(admissionReference: string): Promise<void> {
    const html = await this.text(
      `/v1/admissions/${encodeURIComponent(admissionReference)}/record.html`,
    );
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'niyamsetu-admission-record.html';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  public async templateCsv(): Promise<string> {
    return this.text('/v1/admission-batches/templates/1.0.csv');
  }

  public async createBatch(file: File): Promise<PortalBatch> {
    const form = new FormData();
    form.set('file', file, file.name);
    form.set('originalFilename', file.name);
    form.set('templateVersion', '1.0');
    form.set('actorReference', 'SYNTH-OPERATOR-001');
    form.set('reason', 'Synthetic connected portal upload');
    form.set('requestReference', `SYNTH-PORTAL-${crypto.randomUUID().toUpperCase()}`);
    const receipt = await this.json<{ readonly batchId: string }>(
      '/v1/institutions/SYNTH-INSTITUTION-001/admission-batches',
      {
        body: form,
        headers: { 'idempotency-key': `SYNTH-UPLOAD-${crypto.randomUUID().toUpperCase()}` },
        method: 'POST',
      },
    );
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const summary = await this.json<BatchSummaryResponse>(
        `/v1/admission-batches/${encodeURIComponent(receipt.batchId)}`,
      );
      if (!['RECEIVED', 'SCANNING', 'VALIDATING', 'PROCESSING'].includes(summary.status)) {
        return portalBatch(summary);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('The durable worker did not settle the batch before the portal timeout.');
  }

  public async listRows(batchId: string): Promise<readonly PortalRow[]> {
    const result = await this.json<{ readonly items: readonly PortalRow[] }>(
      `/v1/admission-batches/${encodeURIComponent(batchId)}/rows`,
    );
    return result.items;
  }

  public async retryRow(batchId: string, recordKey: string): Promise<PortalRow> {
    await this.json(
      `/v1/admission-batches/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(recordKey)}/retry`,
      {
        body: JSON.stringify({ reason: 'Synthetic portal retry' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `SYNTH-RETRY-${crypto.randomUUID().toUpperCase()}`,
        },
        method: 'POST',
      },
    );
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const row = await this.json<Omit<PortalRow, 'status'> & { readonly status: string }>(
        `/v1/admission-batches/${encodeURIComponent(batchId)}/rows/${encodeURIComponent(recordKey)}`,
      );
      if (
        ['ACCEPTED', 'REJECTED', 'MANUAL_REVIEW', 'FAILED_FINAL', 'INVALID'].includes(row.status)
      ) {
        return row as PortalRow;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('The retry did not settle before the portal timeout.');
  }

  public correctionCsv(batchId: string): Promise<string> {
    return this.text(`/v1/admission-batches/${encodeURIComponent(batchId)}/corrections.csv`);
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${await this.options.token()}`);
    const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { readonly detail?: string };
      throw new Error(problem.detail ?? 'The connected gateway request failed.');
    }
    return response;
  }

  private async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return (await (await this.request(path, init)).json()) as T;
  }

  private async text(path: string): Promise<string> {
    return (await this.request(path)).text();
  }
}

export function syntheticSessionToken(
  baseUrl: string,
  role: string,
  fetcher: typeof fetch = fetch,
): () => Promise<string> {
  let cached: Promise<string> | null = null;
  return async () => {
    cached ??= fetcher(`${baseUrl}/v1/reference-sessions/${encodeURIComponent(role)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Synthetic reference session is unavailable.');
        const body = (await response.json()) as { readonly token: string };
        return body.token;
      })
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
    return cached;
  };
}
