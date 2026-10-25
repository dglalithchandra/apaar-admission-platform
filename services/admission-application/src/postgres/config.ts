import { InvalidDatabaseConfigurationError } from '../errors.js';

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly ssl: boolean;
  readonly maxConnections: number;
  readonly statementTimeoutMs: number;
  readonly applicationName: string;
}

function integerBetween(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new InvalidDatabaseConfigurationError(
      `Expected an integer between ${String(min)} and ${String(max)}.`,
    );
  }
  return parsed;
}

export function readDatabaseConfig(environment: NodeJS.ProcessEnv): DatabaseConfig {
  const connectionString = environment['DATABASE_URL'];
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new InvalidDatabaseConfigurationError('DATABASE_URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new InvalidDatabaseConfigurationError('DATABASE_URL must be a valid URL.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new InvalidDatabaseConfigurationError(
      'DATABASE_URL must use postgres:// or postgresql://.',
    );
  }
  if (parsed.hostname.length === 0 || parsed.pathname.length <= 1) {
    throw new InvalidDatabaseConfigurationError(
      'DATABASE_URL must include a host and database name.',
    );
  }

  const sslValue = environment['DATABASE_SSL'] ?? 'false';
  if (sslValue !== 'true' && sslValue !== 'false') {
    throw new InvalidDatabaseConfigurationError('DATABASE_SSL must be true or false.');
  }
  const applicationName = environment['DATABASE_APPLICATION_NAME'] ?? 'apaar-admission-application';
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(applicationName)) {
    throw new InvalidDatabaseConfigurationError(
      'DATABASE_APPLICATION_NAME has invalid characters.',
    );
  }

  return {
    applicationName,
    connectionString,
    maxConnections: integerBetween(environment['DATABASE_MAX_CONNECTIONS'], 10, 1, 100),
    ssl: sslValue === 'true',
    statementTimeoutMs: integerBetween(
      environment['DATABASE_STATEMENT_TIMEOUT_MS'],
      15_000,
      1_000,
      120_000,
    ),
  };
}

export function assertNonProductionTestDatabase(connectionString: string): void {
  const parsed = new URL(connectionString);
  const database = parsed.pathname.slice(1).toLowerCase();
  if (!database.includes('test') && !database.includes('synth')) {
    throw new InvalidDatabaseConfigurationError(
      'Integration tests require a database name containing test or synth.',
    );
  }
}
