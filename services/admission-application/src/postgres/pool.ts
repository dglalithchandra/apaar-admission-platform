import { Pool } from 'pg';
import type { DatabaseConfig } from './config.js';

export function createPostgresPool(config: DatabaseConfig): Pool {
  return new Pool({
    application_name: config.applicationName,
    connectionString: config.connectionString,
    max: config.maxConnections,
    ssl: config.ssl ? { rejectUnauthorized: true } : false,
    statement_timeout: config.statementTimeoutMs,
  });
}
