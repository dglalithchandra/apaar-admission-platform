import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DisabledSigningAdapter, Ed25519SigningAdapter } from '../../src/ed25519-signing.js';
function key() {
  return generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
}
describe('independent Ed25519 signing', () => {
  it('supports public-key verification, persistent key reload and tamper rejection', async () => {
    const pem = key();
    const signer = new Ed25519SigningAdapter(pem);
    const signature = await signer.sign('SYNTH-PAYLOAD');
    expect(await signer.verify('SYNTH-PAYLOAD', signature)).toBe(true);
    expect(
      verify(
        null,
        Buffer.from('SYNTH-PAYLOAD'),
        createPublicKey(signer.publicKeyPem()),
        Buffer.from(signature.signature, 'base64url'),
      ),
    ).toBe(true);
    expect(await new Ed25519SigningAdapter(pem).verify('SYNTH-PAYLOAD', signature)).toBe(true);
    expect(await signer.verify('SYNTH-TAMPERED', signature)).toBe(false);
    expect(await new Ed25519SigningAdapter(key()).verify('SYNTH-PAYLOAD', signature)).toBe(false);
    expect(await signer.verify('SYNTH-PAYLOAD', { ...signature, algorithm: 'SYNTH-INVALID' })).toBe(
      false,
    );
    expect(await signer.verify('SYNTH-PAYLOAD', { ...signature, signature: 'invalid' })).toBe(
      false,
    );
    expect(await signer.verify('SYNTH-PAYLOAD', { ...signature, signature: 'A'.repeat(86) })).toBe(
      false,
    );
  });
  it('rejects other key types', () => {
    const pem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    });
    expect(() => new Ed25519SigningAdapter(pem)).toThrow('Ed25519');
  });
  it('provides no signing capability to workers', async () => {
    const signer = new DisabledSigningAdapter();
    await expect(signer.sign()).rejects.toMatchObject({ code: 'SIGNING_DISABLED' });
    expect(await signer.verify()).toBe(false);
  });
});
