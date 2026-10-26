import { GatewayProblem } from './model.js';

export interface GatewayConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly requestTimeoutMs: number;
  readonly maximumJsonBytes: number;
  readonly syntheticAuthentication: boolean;
  readonly apaarMode: 'disabled' | 'simulator' | 'authorized-http';
  readonly apaarOperationUrl: string | null;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new GatewayProblem(
      'CONFIGURATION_INVALID',
      500,
      'A numeric gateway setting is outside its safe range.',
    );
  }
  return parsed;
}

export function loadGatewayConfig(environment: NodeJS.ProcessEnv): GatewayConfig {
  const mode = environment['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) {
    throw new GatewayProblem('CONFIGURATION_INVALID', 500, 'NODE_ENV is not supported.');
  }
  const syntheticAuthentication = environment['SYNTHETIC_AUTH_ENABLED'] === 'true';
  const apaarMode = environment['APAAR_MODE'] ?? 'disabled';
  if (!['disabled', 'simulator', 'authorized-http'].includes(apaarMode)) {
    throw new GatewayProblem('CONFIGURATION_INVALID', 500, 'APAAR_MODE is not supported.');
  }
  if (mode === 'production' && (syntheticAuthentication || apaarMode === 'simulator')) {
    throw new GatewayProblem(
      'UNSAFE_PRODUCTION_CONFIGURATION',
      500,
      'Synthetic authentication and identity verification are forbidden in production.',
    );
  }
  const operationUrl = environment['APAAR_OPERATION_URL'] ?? null;
  if (apaarMode === 'authorized-http' && operationUrl === null) {
    throw new GatewayProblem(
      'EXTERNAL_CONTRACT_UNAVAILABLE',
      500,
      'The authority-approved APAAR operation URL is required.',
    );
  }
  return {
    apaarMode: apaarMode as GatewayConfig['apaarMode'],
    apaarOperationUrl: operationUrl,
    environment: mode as GatewayConfig['environment'],
    host: environment['GATEWAY_HOST'] ?? '127.0.0.1',
    maximumJsonBytes: integer(environment['MAXIMUM_JSON_BYTES'], 262_144, 1_024, 1_048_576),
    port: integer(environment['GATEWAY_PORT'], 8080, 1, 65_535),
    requestTimeoutMs: integer(environment['REQUEST_TIMEOUT_MS'], 5_000, 100, 120_000),
    syntheticAuthentication,
  };
}

export function redactSecurityValue(key: string, value: unknown): unknown {
  return /(token|secret|password|academicidentity|apaar|aadhaar|email|mobile)/i.test(key)
    ? '[REDACTED]'
    : value;
}
