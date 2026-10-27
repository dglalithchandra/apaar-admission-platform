import { readDatabaseConfig } from '@apaar-platform/admission-application';
import { createReferencePool } from './reference-persistence.js';

const config = readDatabaseConfig(process.env);
const parsed = new URL(config.connectionString);
const databaseName = parsed.pathname.slice(1).toLowerCase();
if (process.env['CONFIRM_SYNTHETIC_RESET'] !== 'true') {
  throw new Error('Set CONFIRM_SYNTHETIC_RESET=true to reset the local synthetic database.');
}
if (!databaseName.includes('synth') && !databaseName.includes('local')) {
  throw new Error('Synthetic reset refuses a database whose name lacks synth or local.');
}
if (!['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname.toLowerCase())) {
  throw new Error('Synthetic reset refuses a nonlocal database host.');
}

const pool = createReferencePool(config);
await pool.query('DROP SCHEMA public CASCADE');
await pool.query('CREATE SCHEMA public');
await pool.end();
process.stdout.write('synthetic_reference_reset=complete\n');
