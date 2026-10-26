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
    'verifications',
  ]);
  return segments
    .map((segment, index) =>
      index > 0 && dynamicParents.has(segments[index - 1] ?? '') ? ':reference' : segment,
    )
    .join('/');
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
