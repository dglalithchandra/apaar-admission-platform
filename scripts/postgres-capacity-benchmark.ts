import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import {
  migrate,
  PostgresAdmissionStore,
  SubmitAdmissionService,
  ImportApprovalSnapshotService,
} from '@apaar-platform/admission-application';
import { asIsoDateTime } from '@apaar-platform/admission-domain';
import {
  syntheticApproval,
  syntheticCommand,
  SyntheticReferenceGenerator,
} from '../services/admission-application/test/fixtures.js';
const command = promisify(execFile);
const image =
  'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94';
const container = await new PostgreSqlContainer(image)
  .withDatabase('SYNTH_CAPACITY_BENCHMARK')
  .withUsername('SYNTH_USER')
  .withPassword('SYNTH_PASSWORD')
  .start();
let pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
const runs: unknown[] = [];
try {
  const version = (await pool.query<{ version: string }>('SELECT version()')).rows[0]?.version;
  for (const directory of [
    'admission-application',
    'batch-ingestion',
    'admission-casework',
    'integration-gateway',
  ])
    await migrate(pool, `services/${directory}/migrations`);
  for (const concurrency of [1, 2, 4]) {
    await pool.query(
      'TRUNCATE institutions,approval_import_batches,business_audit_events,outbox_events CASCADE',
    );
    const store = new PostgresAdmissionStore(pool);
    await new ImportApprovalSnapshotService(store).execute({
      snapshot: syntheticApproval({
        ordinaryIntake: 1,
        nri: { approved: false, maximumWithinOrdinary: 0 },
      }),
    });
    const service = new SubmitAdmissionService(
      { unitOfWork: store, clock: { now: () => asIsoDateTime('2026-10-28T08:00:00Z') } },
      new SyntheticReferenceGenerator(),
    );
    const latencies: number[] = [];
    const outcomes = { accepted: 0, rejected: 0, review: 0, failed: 0 };
    const errorCodes: Record<string, number> = {};
    let next = 0;
    const started = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < 40) {
          const index = next++;
          const at = performance.now();
          try {
            const result = await service.execute(
              syntheticCommand(`SYNTH-BENCH-${concurrency}-${index}`),
            );
            if (result.decision.outcome === 'ACCEPT') outcomes.accepted++;
            else if (result.decision.outcome === 'REJECT') outcomes.rejected++;
            else outcomes.review++;
          } catch (error) {
            outcomes.failed++;
            const code =
              error !== null &&
              typeof error === 'object' &&
              'code' in error &&
              typeof error.code === 'string' &&
              /^[A-Z0-9_]+$/.test(error.code)
                ? error.code
                : 'UNCLASSIFIED';
            errorCodes[code] = (errorCodes[code] ?? 0) + 1;
          } finally {
            latencies.push(performance.now() - at);
          }
        }
      }),
    );
    const elapsed = performance.now() - started;
    latencies.sort((a, b) => a - b);
    const invariant = await pool.query<{
      admissions: number;
      audit: number;
      outbox: number;
      overflow: number;
      used: number;
    }>(`SELECT
      (SELECT count(*)::integer FROM admissions) admissions,
      (SELECT count(*)::integer FROM business_audit_events WHERE aggregate_type='ADMISSION') audit,
      (SELECT count(*)::integer FROM outbox_events WHERE aggregate_type='ADMISSION') outbox,
      ((SELECT count(*)::integer FROM capacity_allocations WHERE used_quantity>capacity_quantity) + (SELECT count(*)::integer FROM institution_capacity_allocations WHERE used_quantity>capacity_quantity)) overflow,
      (SELECT used_quantity FROM capacity_allocations WHERE allocation_code='ORDINARY') used`);
    const evidence = invariant.rows[0];
    if (
      !evidence ||
      evidence.overflow !== 0 ||
      evidence.used !== 1 ||
      outcomes.accepted !== 1 ||
      evidence.admissions !== evidence.audit ||
      evidence.audit !== evidence.outbox
    )
      throw new Error(
        `Synthetic benchmark invariant failed: ${JSON.stringify({ evidence, outcomes })}`,
      );
    runs.push({
      concurrency,
      attempts: 40,
      elapsedMs: elapsed,
      attemptsPerSecond: 40 / (elapsed / 1000),
      p50Ms: latencies[Math.ceil(latencies.length * 0.5) - 1],
      p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
      p99Ms: latencies[Math.ceil(latencies.length * 0.99) - 1],
      outcomes,
      errorCodes,
      invariants: evidence,
    });
  }
  const before = (
    await pool.query<{ count: string }>('SELECT count(*)::text count FROM admissions')
  ).rows[0]?.count;
  await pool.end();
  await container.restart();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await pool.query('SELECT 1');
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error('Synthetic PostgreSQL did not recover after restart.');
  const after = (await pool.query<{ count: string }>('SELECT count(*)::text count FROM admissions'))
    .rows[0]?.count;
  if (before !== after) throw new Error('Synthetic records did not survive PostgreSQL restart.');
  const report = {
    measuredAtUtc: new Date().toISOString(),
    gitRevision: (await command('git', ['rev-parse', 'HEAD'])).stdout.trim(),
    workingTreeDirty: (await command('git', ['status', '--porcelain'])).stdout.trim().length > 0,
    image,
    postgresVersion: version,
    nodeVersion: process.version,
    host: {
      platform: platform(),
      logicalCpus: cpus().length,
      memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(1)),
    },
    workload:
      '40 distinct synthetic students compete for one ordinary seat, at each client concurrency level; service retries limited to five attempts with bounded backoff',
    runs,
    postgresRestartPersistence: { before, after, passed: true },
    limits: [
      'Local disposable PostgreSQL only; no official identity provider or national network.',
      'A small contention experiment, not a national throughput or disaster-recovery certification.',
      'Infrastructure failures and rejected policy outcomes are reported separately; failures are not silently retried by this harness.',
    ],
  };
  await mkdir('docs/assurance/evidence', { recursive: true });
  await writeFile(
    'docs/assurance/evidence/postgres-capacity-benchmark.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  await pool.end().catch(() => undefined);
  await container.stop();
}
