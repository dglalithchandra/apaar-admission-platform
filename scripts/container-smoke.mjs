import './prepare-local-signing-key.mjs';
import { spawnSync } from 'node:child_process';

const compose = ['compose', '-f', 'infra/compose/compose.yaml'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout?.trim() ?? '';
}

run('docker', [...compose, 'up', '--build', '--wait'], { stdio: 'inherit' });
const ready = await fetch('http://127.0.0.1:5173/ready');
const readiness = await ready.json();
if (!ready.ok || readiness.status !== 'UP') {
  throw new Error(`Integrated readiness failed: ${JSON.stringify(readiness)}`);
}

for (const service of [
  'gateway',
  'batch-worker',
  'outbox-worker',
  'notification-worker',
  'pilot-worker',
  'portal',
]) {
  const container = run('docker', [...compose, 'ps', '-q', service]);
  const inspection = run('docker', [
    'inspect',
    '--format',
    'User={{.Config.User}} Readonly={{.HostConfig.ReadonlyRootfs}} Health={{.State.Health.Status}} CapDrop={{json .HostConfig.CapDrop}}',
    container,
  ]);
  if (
    !inspection.includes('User=node') ||
    !inspection.includes('Readonly=true') ||
    !inspection.includes('Health=healthy') ||
    !inspection.includes('ALL')
  ) {
    throw new Error(`${service} hardening check failed: ${inspection}`);
  }
  process.stdout.write(`${service} ${inspection}\n`);
}

for (const service of ['migrate', 'seed']) {
  const container = run('docker', [...compose, 'ps', '-aq', service]);
  const exitCode = run('docker', ['inspect', '--format', '{{.State.ExitCode}}', container]);
  if (exitCode !== '0') throw new Error(`${service} job exited ${exitCode}`);
}

process.stdout.write(`readiness=${JSON.stringify(readiness.dependencies)}\n`);
