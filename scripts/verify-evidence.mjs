import { readFile } from 'node:fs/promises';
import { verifyEvidenceBundle } from '../apps/institution-portal/src/evidence-integrity.ts';
const console = {
  log: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
};

const [file, expectedRoot] = process.argv.slice(2);
if (!file || !expectedRoot) {
  console.error(
    'Usage: node scripts/verify-evidence.mjs <bundle.json> <independently-retained-root>',
  );
  process.exitCode = 2;
} else {
  try {
    const valid = await verifyEvidenceBundle(
      JSON.parse(await readFile(file, 'utf8')),
      expectedRoot,
    );
    console.log(
      valid
        ? 'MATCH: snapshot matches the retained root.'
        : 'MISMATCH: do not trust this snapshot.',
    );
    console.log('This does not establish issuer identity, completeness, or a trusted event time.');
    process.exitCode = valid ? 0 : 1;
  } catch {
    console.error('Unable to read or verify evidence.');
    process.exitCode = 1;
  }
}
