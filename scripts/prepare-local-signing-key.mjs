import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
const directory = new URL('../private-inputs/local-signing/', import.meta.url);
const file = new URL('issuer-private.pem', directory);
await mkdir(directory, { recursive: true });
try {
  const existing = createPrivateKey(await readFile(file, 'utf8'));
  if (existing.asymmetricKeyType !== 'ed25519')
    throw new Error(
      'Local issuer key is not Ed25519. Preserve the existing file and resolve configuration.',
    );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const { privateKey } = generateKeyPairSync('ed25519');
  await writeFile(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    flag: 'wx',
    mode: 0o600,
  });
}
process.stdout.write(
  `Independent local signing key ready in ignored directory: ${fileURLToPath(directory)}\n`,
);
