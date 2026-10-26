import { spawnSync } from 'node:child_process';

const image = 'apaar-platform-gateway:stage6';
const name = 'apaar-stage6-smoke';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout?.trim() ?? '';
}

if (run('docker', ['ps', '-aq', '--filter', `name=^${name}$`]) !== '') {
  throw new Error(`Refusing to replace existing container ${name}`);
}

run('docker', ['build', '-t', image, '.'], { stdio: 'inherit' });
run('docker', [
  'run',
  '--rm',
  '-d',
  '--name',
  name,
  '--read-only',
  '--tmpfs',
  '/tmp',
  '--cap-drop',
  'ALL',
  '-p',
  '127.0.0.1:18080:8080',
  '-e',
  'NODE_ENV=test',
  '-e',
  'SYNTHETIC_AUTH_ENABLED=true',
  '-e',
  'APAAR_MODE=simulator',
  '-e',
  'GATEWAY_HOST=0.0.0.0',
  image,
]);

try {
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = run('docker', ['inspect', '--format', '{{.State.Health.Status}}', name]);
    if (state === 'healthy') {
      healthy = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!healthy)
    throw new Error(`Container did not become healthy\n${run('docker', ['logs', name])}`);
  const response = await fetch('http://127.0.0.1:18080/health');
  if (!response.ok || (await response.text()) !== '{"status":"UP"}') {
    throw new Error('Container health response was invalid');
  }
  const inspection = run('docker', [
    'inspect',
    '--format',
    'User={{.Config.User}} Readonly={{.HostConfig.ReadonlyRootfs}} Health={{.State.Health.Status}}',
    name,
  ]);
  if (inspection !== 'User=node Readonly=true Health=healthy') {
    throw new Error(`Container hardening check failed: ${inspection}`);
  }
  process.stdout.write(`${inspection}\n`);
} finally {
  run('docker', ['stop', '--time', '10', name]);
}
