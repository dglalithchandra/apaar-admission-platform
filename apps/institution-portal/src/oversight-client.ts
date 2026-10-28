import { syntheticSessionToken } from './http-portal-client.js';
export interface OversightRow {
  readonly allocationReference: string;
  readonly institutionReference: string;
  readonly academicYear: string;
  readonly approvalReference: string;
  readonly courseReference: string;
  readonly bucket: string;
  readonly approvedCapacity: number;
  readonly counterUsed: number;
  readonly ledgerUsed: number;
  readonly drift: number;
  readonly acceptedRecords: number;
  readonly pendingReviewRecords: number;
}
export interface OversightPage {
  readonly institutionCapacities?: readonly {
    readonly institutionReference: string;
    readonly bucket: string;
    readonly approvedCapacity: number;
    readonly counterUsed: number;
    readonly ledgerUsed: number;
    readonly drift: number;
  }[];
  readonly summary?: {
    readonly activeAdmissionRecords: number;
    readonly reviewOutcomes: number;
    readonly unlinkedReviewOutcomes: number;
    readonly retryableRows: number;
  };
  readonly rows: readonly OversightRow[];
  readonly nextOffset: number | null;
}
export interface OversightClient {
  load(role: string, year: string, offset: number): Promise<OversightPage>;
  exportPage(role: string, year: string, offset: number): Promise<void>;
}
export class HttpOversightClient implements OversightClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch,
  ) {}
  private async request(
    role: string,
    year: string,
    offset: number,
    csv = false,
  ): Promise<Response> {
    const token = await syntheticSessionToken(this.baseUrl, role, this.fetcher)();
    const response = await this.fetcher(
      `${this.baseUrl}/v1/oversight/capacity${csv ? '.csv' : ''}?academicYear=${encodeURIComponent(year)}&offset=${String(offset)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok)
      throw new Error('The capacity report is unavailable for this account or filter.');
    return response;
  }
  public async load(role: string, year: string, offset: number): Promise<OversightPage> {
    return (await (await this.request(role, year, offset)).json()) as OversightPage;
  }
  public async exportPage(role: string, year: string, offset: number): Promise<void> {
    const text = await (await this.request(role, year, offset, true)).text();
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'niyamsetu-capacity-page.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
