import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { PersistenceInvariantError } from '../errors.js';

interface MigrationFile {
  readonly version: string;
  readonly sql: string;
  readonly checksum: string;
}

async function loadMigrations(directory: string): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    names.map(async (version) => {
      const sql = await readFile(join(directory, version), 'utf8');
      return { checksum: createHash('sha256').update(sql).digest('hex'), sql, version };
    }),
  );
}

export async function migrate(pool: Pool, directory: string): Promise<readonly string[]> {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [824_462_263]);
    for (const migration of migrations) {
      const table = await client.query<{ exists: boolean }>(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists",
      );
      const exists = table.rows[0]?.exists === true;
      if (exists) {
        const prior = await client.query<{ checksum_sha256: string }>(
          'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
          [migration.version],
        );
        if (prior.rowCount === 1) {
          if (prior.rows[0]?.checksum_sha256 !== migration.checksum) {
            throw new PersistenceInvariantError(`Migration ${migration.version} checksum changed.`);
          }
          continue;
        }
      }

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
          [migration.version, migration.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
      applied.push(migration.version);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [824_462_263]).catch(() => undefined);
    client.release();
  }
  return applied;
}
