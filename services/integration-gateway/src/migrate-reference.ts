import { readDatabaseConfig } from '@apaar-platform/admission-application';
import { createReferencePool, runReferenceMigrations } from './reference-persistence.js';

const pool = createReferencePool(readDatabaseConfig(process.env));
const applied = await runReferenceMigrations(pool);
await pool.end();
process.stdout.write(`migrations=${applied.join(',') || 'current'}\n`);
