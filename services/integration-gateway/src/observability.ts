import type { GatewayTelemetryPort } from './model.js';

interface Metric {
  count: number;
  durationMilliseconds: number;
}

export function sanitizeMetricRoute(pathname: string): string {
  const segments = pathname.split('/');
  const dynamicParents = new Set([
    'admission-batches',
    'admissions',
    'cases',
    'institutions',
    'pilot-migrations',
    'pilots',
    'verifications',
  ]);
  return segments
    .map((segment, index) =>
      index > 0 && dynamicParents.has(segments[index - 1] ?? '') ? ':reference' : segment,
    )
    .join('/');
}

export const PILOT_SIGNALS = [
  'SUBMISSION',
  'VALIDATION',
  'IDENTITY_PROVIDER',
  'PROCESSING_LATENCY_MILLISECONDS',
  'RECONCILIATION_DRIFT',
  'NOTIFICATION_DEAD_LETTER',
  'CASEWORK_BACKLOG',
  'CAPACITY_ANOMALY',
] as const;
export type PilotSignal = (typeof PILOT_SIGNALS)[number];
export type PilotSignalOutcome = 'SUCCESS' | 'REJECTED' | 'PENDING' | 'OUTAGE' | 'OBSERVED';

/**
 * Low-cardinality pilot telemetry. Tenant-specific dashboards apply institution
 * scope at the authorised query layer; identifiers are deliberately impossible
 * to pass as metric labels.
 */
export class InMemoryPilotTelemetry {
  private readonly values = new Map<string, number>();

  public record(signal: PilotSignal, outcome: PilotSignalOutcome, value = 1): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Pilot metric values must be finite and non-negative.');
    }
    const key = `${signal}|${outcome}`;
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  public prometheus(): string {
    const lines = [
      '# HELP apaar_pilot_signal_total Aggregate controlled-rollout signal without personal or tenant identifiers.',
      '# TYPE apaar_pilot_signal_total counter',
    ];
    for (const [key, value] of [...this.values.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const [signal, outcome] = key.split('|') as [PilotSignal, PilotSignalOutcome];
      lines.push(
        `apaar_pilot_signal_total{signal="${signal}",outcome="${outcome}"} ${String(value)}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}

export class InMemoryGatewayTelemetry implements GatewayTelemetryPort {
  private readonly metrics = new Map<string, Metric>();

  public record(input: {
    readonly durationMilliseconds: number;
    readonly method: string;
    readonly route: string;
    readonly status: number;
  }): void {
    const route = sanitizeMetricRoute(input.route);
    const key = `${input.method}|${route}|${String(input.status)}`;
    const current = this.metrics.get(key) ?? { count: 0, durationMilliseconds: 0 };
    this.metrics.set(key, {
      count: current.count + 1,
      durationMilliseconds: current.durationMilliseconds + input.durationMilliseconds,
    });
  }

  public prometheus(): string {
    const lines = [
      '# HELP apaar_gateway_requests_total Completed HTTP requests.',
      '# TYPE apaar_gateway_requests_total counter',
      '# HELP apaar_gateway_request_duration_milliseconds_total Cumulative request duration.',
      '# TYPE apaar_gateway_request_duration_milliseconds_total counter',
    ];
    for (const [key, metric] of [...this.metrics.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const [method, route, status] = key.split('|') as [string, string, string];
      const labels = `method="${method}",route="${route}",status="${status}"`;
      lines.push(`apaar_gateway_requests_total{${labels}} ${String(metric.count)}`);
      lines.push(
        `apaar_gateway_request_duration_milliseconds_total{${labels}} ${metric.durationMilliseconds.toFixed(3)}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}
