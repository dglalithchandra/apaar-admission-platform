import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const tracked = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
});
if (tracked.status !== 0) throw new Error(tracked.stderr);

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const findings = [];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:client_secret|api_key|access_token)\s*[:=]\s*["'][^"']+["']/i,
  /\bpassword\s*[:=]\s*["'][^"']+["']/i,
];

for (const file of tracked.stdout.split(/\r?\n/).filter(Boolean)) {
  if (!textExtensions.has(extname(file))) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('SYNTH-') || line.trimStart().startsWith('#')) return;
    for (const pattern of patterns) {
      if (pattern.test(line)) findings.push(`${file}:${String(index + 1)}:${pattern.source}`);
    }
  });
}

if (findings.length > 0) {
  process.stderr.write(`Potential secrets found:\n${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('No credential-shaped values found in repository text files.\n');
}
