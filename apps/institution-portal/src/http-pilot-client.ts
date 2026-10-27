import type { PilotClient, PilotSnapshot } from './pilot-types.js';
import type { PilotPreviewState } from './PilotWorkspace.js';

interface HttpPilotClientOptions {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly institutionToken: () => Promise<string>;
  readonly reviewerToken: () => Promise<string>;
}

const EXECUTION_STATES: Readonly<Record<string, PilotPreviewState>> = {
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  GO_LIVE_REVIEW: 'READY',
  INCIDENT: 'INCIDENT',
  PAUSED: 'PAUSED',
  PLANNED: 'MANUAL_REVIEW',
  RUNNING: 'RUNNING',
  TERMINATED: 'TERMINATED',
};

export class HttpPilotClient implements PilotClient {
  public constructor(private readonly options: HttpPilotClientOptions) {}

  public async load(mode: 'INSTITUTION' | 'AICTE'): Promise<PilotSnapshot> {
    if (mode === 'INSTITUTION') {
      const value = await this.request<Record<string, unknown>>(
        '/v1/institutions/SYNTH-INSTITUTION-001/pilot-readiness',
        await this.options.institutionToken(),
      );
      const readiness =
        typeof value['readiness_outcome'] === 'string'
          ? value['readiness_outcome']
          : 'MANUAL_REVIEW';
      return {
        executionReference: 'SYNTH-EXECUTION-REFERENCE-001',
        institutions: [
          {
            campusCount: Array.isArray(value['campus_ids']) ? value['campus_ids'].length : 1,
            label: 'Connected synthetic institution',
            readiness,
            reference: 'SYNTH-INSTITUTION-001',
          },
        ],
        state: readiness === 'PASS' ? 'READY' : readiness === 'FAIL' ? 'BLOCKED' : 'MANUAL_REVIEW',
        version: Number(value['version'] ?? 1),
      };
    }
    const value = await this.request<Record<string, unknown>>(
      '/v1/pilot-executions/SYNTH-EXECUTION-REFERENCE-001',
      await this.options.reviewerToken(),
    );
    const state = typeof value['state'] === 'string' ? value['state'] : 'MANUAL_REVIEW';
    return {
      executionReference:
        typeof value['executionReference'] === 'string'
          ? value['executionReference']
          : 'SYNTH-EXECUTION-REFERENCE-001',
      institutions: [
        {
          campusCount: 1,
          label: 'Connected synthetic cohort member',
          readiness: state === 'RUNNING' || state === 'COMPLETED' ? 'READY' : state,
          reference: 'SYNTH-INSTITUTION-001',
        },
      ],
      state: EXECUTION_STATES[state] ?? 'MANUAL_REVIEW',
      version: Number(value['version'] ?? 1),
    };
  }

  private async request<T>(path: string, token: string): Promise<T> {
    const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as { readonly detail?: string } & T;
    if (!response.ok) throw new Error(body.detail ?? 'The connected pilot service is unavailable.');
    return body;
  }
}
