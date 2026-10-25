import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresPool } from './pool.js';
import { readDatabaseConfig } from './config.js';
import { migrate } from './migrations.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(here, '../../migrations');
const pool = createPostgresPool(readDatabaseConfig(process.env));

try {
  const applied = await migrate(pool, migrationsDirectory);
  process.stdout.write(`Applied ${String(applied.length)} migration(s).\n`);
} finally {
  await pool.end();
}
