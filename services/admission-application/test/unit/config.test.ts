import { describe, expect, it } from 'vitest';
import { InvalidDatabaseConfigurationError } from '../../src/errors.js';
import { assertNonProductionTestDatabase, readDatabaseConfig } from '../../src/postgres/config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  DATABASE_APPLICATION_NAME: 'SYNTH_application',
  DATABASE_MAX_CONNECTIONS: '12',
  DATABASE_SSL: 'true',
  DATABASE_STATEMENT_TIMEOUT_MS: '20000',
  DATABASE_URL: 'postgresql://SYNTH_USER:SYNTH_PASSWORD@127.0.0.1:5432/SYNTH_TEST',
};

describe('database configuration', () => {
  it('parses an explicit PostgreSQL configuration', () => {
    expect(readDatabaseConfig(validEnvironment)).toEqual({
      applicationName: 'SYNTH_application',
      connectionString: validEnvironment['DATABASE_URL'],
      maxConnections: 12,
      ssl: true,
      statementTimeoutMs: 20_000,
    });
  });

  it('applies safe non-secret defaults', () => {
    expect(
      readDatabaseConfig({ DATABASE_URL: 'postgres://SYNTH_USER@localhost/SYNTH_DATABASE' }),
    ).toMatchObject({
      applicationName: 'apaar-admission-application',
      maxConnections: 10,
      ssl: false,
      statementTimeoutMs: 15_000,
    });
  });

  it.each([
    [{}, 'DATABASE_URL is required'],
    [{ DATABASE_URL: 'not a URL' }, 'valid URL'],
    [{ DATABASE_URL: 'https://example.invalid/database' }, 'must use postgres'],
    [{ DATABASE_URL: 'postgresql://localhost' }, 'host and database'],
    [{ ...validEnvironment, DATABASE_SSL: 'sometimes' }, 'DATABASE_SSL'],
    [{ ...validEnvironment, DATABASE_APPLICATION_NAME: 'invalid name' }, 'invalid characters'],
    [{ ...validEnvironment, DATABASE_MAX_CONNECTIONS: '0' }, 'integer between'],
    [{ ...validEnvironment, DATABASE_STATEMENT_TIMEOUT_MS: 'not-an-integer' }, 'integer between'],
  ] as const)('rejects invalid environment input', (environment, message) => {
    expect(() => readDatabaseConfig(environment)).toThrow(message);
  });

  it('refuses a production-looking database during integration tests', () => {
    expect(() => {
      assertNonProductionTestDatabase('postgresql://SYNTH_USER@localhost/production');
    }).toThrow(InvalidDatabaseConfigurationError);
    expect(() => {
      assertNonProductionTestDatabase('postgresql://SYNTH_USER@localhost/SYNTH_TEST');
    }).not.toThrow();
  });
});
