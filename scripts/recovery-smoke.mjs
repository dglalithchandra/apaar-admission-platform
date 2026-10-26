import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const name = 'apaar-stage6-recovery';
const image =
  'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94';
const password = 'SYNTH-RECOVERY-POSTGRES-ONLY';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

if (run('docker', ['ps', '-aq', '--filter', `name=^${name}$`]) !== '') {
  throw new Error(`Refusing to replace existing container ${name}`);
}
run('docker', [
  'run',
  '--rm',
  '-d',
  '--name',
  name,
  '-e',
  `POSTGRES_PASSWORD=${password}`,
  '-e',
  'POSTGRES_DB=apaar',
  '-e',
  'POSTGRES_USER=apaar_local_admin',
  image,
]);

const started = performance.now();
try {
  let ready = false;
  let consecutive = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync('docker', [
      'exec',
      name,
      'psql',
      '-At',
      '-U',
      'apaar_local_admin',
      '-d',
      'apaar',
      '-c',
      'SELECT 1;',
    ]);
    if (probe.status === 0) {
      consecutive += 1;
      if (consecutive >= 3) {
        ready = true;
        break;
      }
    } else {
      consecutive = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Recovery PostgreSQL did not become ready');
  run('docker', [
    'exec',
    name,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'apaar_local_admin',
    '-d',
    'apaar',
    '-c',
    "CREATE TABLE synthetic_recovery(id text PRIMARY KEY); INSERT INTO synthetic_recovery VALUES('SYNTH-RECOVERY-001');",
  ]);
  const roleSql = readFileSync('infra/postgres/create-roles.sql', 'utf8');
  run(
    'docker',
    ['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'apaar_local_admin', '-d', 'apaar'],
    { input: roleSql },
  );
  const roleCheck = run('docker', [
    'exec',
    name,
    'psql',
    '-At',
    '-U',
    'apaar_local_admin',
    '-d',
    'apaar',
    '-c',
    "SELECT rolname||':'||rolsuper||':'||rolcanlogin FROM pg_roles WHERE rolname IN ('apaar_migrator','apaar_runtime') ORDER BY rolname",
  ]);
  if (roleCheck !== 'apaar_migrator:false:false\napaar_runtime:false:false') {
    throw new Error(`Least-privilege role check failed: ${roleCheck}`);
  }
  const dump = run('docker', [
    'exec',
    name,
    'pg_dump',
    '--no-owner',
    '--no-privileges',
    '-U',
    'apaar_local_admin',
    '-d',
    'apaar',
  ]);
  run('docker', [
    'exec',
    name,
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'apaar_local_admin',
    '-d',
    'apaar',
    '-c',
    'DROP TABLE synthetic_recovery;',
  ]);
  run(
    'docker',
    ['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'apaar_local_admin', '-d', 'apaar'],
    { input: dump },
  );
  const restored = run('docker', [
    'exec',
    name,
    'psql',
    '-At',
    '-U',
    'apaar_local_admin',
    '-d',
    'apaar',
    '-c',
    'SELECT id FROM synthetic_recovery;',
  ]);
  if (restored !== 'SYNTH-RECOVERY-001') throw new Error('Restored data did not match');
  process.stdout.write(
    `backup_restore=passed roles=least-privilege elapsed_ms=${String(Math.round(performance.now() - started))}\n`,
  );
} finally {
  run('docker', ['stop', '--time', '10', name]);
}
