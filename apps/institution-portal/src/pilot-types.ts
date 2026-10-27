import type { PilotPreviewState } from './PilotWorkspace.js';

export interface PilotSnapshot {
  readonly executionReference: string;
  readonly institutions: readonly {
    readonly campusCount: number;
    readonly label: string;
    readonly readiness: string;
    readonly reference: string;
  }[];
  readonly state: PilotPreviewState;
  readonly version: number;
}

export interface PilotClient {
  load(mode: 'INSTITUTION' | 'AICTE'): Promise<PilotSnapshot>;
}
