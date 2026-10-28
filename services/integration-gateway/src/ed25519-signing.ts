import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { SigningPort } from './model.js';
import { GatewayProblem } from './model.js';

/** Independent local issuer; no government or accredited award authority is implied. */
export class Ed25519SigningAdapter implements SigningPort {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  public readonly keyId: string;
  public constructor(privateKeyPem: string) {
    this.privateKey = createPrivateKey(privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== 'ed25519')
      throw new TypeError('An Ed25519 private key is required.');
    this.publicKey = createPublicKey(this.privateKey);
    this.keyId = createHash('sha256')
      .update(this.publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
  }
  public exportPublicKey(): { readonly keyId: string; readonly pem: string } {
    return { keyId: this.keyId, pem: this.publicKeyPem() };
  }

  public publicKeyPem(): string {
    return this.publicKey.export({ type: 'spki', format: 'pem' });
  }
  public sign(
    payload: string,
  ): Promise<{ readonly algorithm: string; readonly keyId: string; readonly signature: string }> {
    return Promise.resolve({
      algorithm: 'Ed25519',
      keyId: this.keyId,
      signature: sign(null, Buffer.from(payload), this.privateKey).toString('base64url'),
    });
  }
  public verify(
    payload: string,
    signed: { readonly algorithm: string; readonly keyId: string; readonly signature: string },
  ): Promise<boolean> {
    if (
      signed.algorithm !== 'Ed25519' ||
      signed.keyId !== this.keyId ||
      !/^[A-Za-z0-9_-]{86}$/.test(signed.signature)
    )
      return Promise.resolve(false);
    return Promise.resolve(
      verify(
        null,
        Buffer.from(payload),
        this.publicKey,
        Buffer.from(signed.signature, 'base64url'),
      ),
    );
  }
}

/** Workers receive no receipt-signing key or signing capability. */
export class DisabledSigningAdapter implements SigningPort {
  public sign(): Promise<never> {
    return Promise.reject(
      new GatewayProblem(
        'SIGNING_DISABLED',
        503,
        'Receipt signing is unavailable in this process.',
      ),
    );
  }
  public verify(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
