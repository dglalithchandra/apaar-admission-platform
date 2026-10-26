import {
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
} from 'node:crypto';
import type { JwtVerificationPort } from './auth.js';
import type { GatewayClock, GatewayRole, Principal } from './model.js';
import { GATEWAY_ROLES, GatewayProblem } from './model.js';

interface LocalClaims {
  readonly aud: string;
  readonly exp: number;
  readonly institution_id: string | null;
  readonly iss: string;
  readonly nbf: number;
  readonly organisation: string;
  readonly roles: readonly string[];
  readonly sub: string;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
}

export class LocalOidcIssuer {
  private readonly privateKeys = new Map<string, KeyObject>();
  private readonly publicKeys = new Map<string, KeyObject>();
  private activeKeyId: string;

  public constructor(
    environment: 'development' | 'test' | 'production',
    private readonly issuer: string,
    private readonly audience: string,
    initialKeyId = 'SYNTH-OIDC-KEY-001',
  ) {
    if (environment === 'production') {
      throw new GatewayProblem(
        'UNSAFE_PRODUCTION_CONFIGURATION',
        500,
        'The local OIDC issuer cannot run in production.',
      );
    }
    this.activeKeyId = initialKeyId;
    this.rotate(initialKeyId);
  }

  public rotate(keyId: string): void {
    const pair = generateKeyPairSync('ed25519');
    this.privateKeys.set(keyId, pair.privateKey);
    this.publicKeys.set(keyId, pair.publicKey);
    this.activeKeyId = keyId;
  }

  public retire(keyId: string): void {
    this.privateKeys.delete(keyId);
    this.publicKeys.delete(keyId);
  }

  public issue(input: {
    readonly actorReference: string;
    readonly expiresAtSeconds: number;
    readonly institutionId: string | null;
    readonly notBeforeSeconds: number;
    readonly organisationReference: string;
    readonly roles: readonly GatewayRole[];
  }): string {
    const header = encode({ alg: 'EdDSA', kid: this.activeKeyId, typ: 'JWT' });
    const payload = encode({
      aud: this.audience,
      exp: input.expiresAtSeconds,
      institution_id: input.institutionId,
      iss: this.issuer,
      nbf: input.notBeforeSeconds,
      organisation: input.organisationReference,
      roles: input.roles,
      sub: input.actorReference,
    } satisfies LocalClaims);
    const key = this.privateKeys.get(this.activeKeyId);
    if (key === undefined) {
      throw new GatewayProblem(
        'LOCAL_SIGNING_KEY_MISSING',
        500,
        'The local signing key is missing.',
      );
    }
    const signature = signBytes(null, Buffer.from(`${header}.${payload}`), key).toString(
      'base64url',
    );
    return `${header}.${payload}.${signature}`;
  }

  public verifier(clock: GatewayClock): LocalJwksVerifier {
    return new LocalJwksVerifier(this.issuer, this.audience, clock, this.publicKeys);
  }
}

export class LocalJwksVerifier implements JwtVerificationPort {
  public constructor(
    private readonly issuer: string,
    private readonly audience: string,
    private readonly clock: GatewayClock,
    private readonly keys: ReadonlyMap<string, KeyObject>,
  ) {}

  public verify(token: string): Promise<Principal | null> {
    try {
      const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
      if (
        encodedHeader === undefined ||
        encodedPayload === undefined ||
        encodedSignature === undefined ||
        extra !== undefined
      ) {
        return Promise.resolve(null);
      }
      const header = decode(encodedHeader) as { readonly alg?: unknown; readonly kid?: unknown };
      if (header.alg !== 'EdDSA' || typeof header.kid !== 'string') return Promise.resolve(null);
      const key = this.keys.get(header.kid);
      if (key === undefined) return Promise.resolve(null);
      const valid = verifyBytes(
        null,
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        key,
        Buffer.from(encodedSignature, 'base64url'),
      );
      if (!valid) return Promise.resolve(null);
      const claims = decode(encodedPayload) as Partial<LocalClaims>;
      const now = Math.floor(Date.parse(this.clock.now()) / 1_000);
      if (
        claims.iss !== this.issuer ||
        claims.aud !== this.audience ||
        typeof claims.sub !== 'string' ||
        typeof claims.organisation !== 'string' ||
        typeof claims.exp !== 'number' ||
        typeof claims.nbf !== 'number' ||
        claims.exp <= now ||
        claims.nbf > now ||
        !Array.isArray(claims.roles) ||
        !claims.roles.every(
          (role): role is GatewayRole =>
            typeof role === 'string' && GATEWAY_ROLES.includes(role as GatewayRole),
        ) ||
        !(claims.institution_id === null || typeof claims.institution_id === 'string')
      ) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        actorReference: claims.sub,
        institutionId: claims.institution_id,
        organisationReference: claims.organisation,
        roles: claims.roles,
      });
    } catch {
      return Promise.resolve(null);
    }
  }
}
