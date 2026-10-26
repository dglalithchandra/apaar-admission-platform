import { describe, expect, it } from 'vitest';
import { LocalOidcIssuer, type GatewayClock, type GatewayRole } from '../../src/index.js';

const clock: GatewayClock = { now: () => '2026-10-26T12:00:00.000Z' };
const now = Math.floor(Date.parse(clock.now()) / 1_000);
const roles: readonly GatewayRole[] = [
  'INSTITUTION_OPERATOR',
  'INSTITUTION_ADMINISTRATOR',
  'AICTE_REVIEWER',
  'AICTE_CHECKER',
  'AUDITOR',
  'AUTHORIZED_VERIFIER',
  'SERVICE_INTEGRATION_CLIENT',
];

describe('local OIDC/JWKS harness', () => {
  it('verifies all roles, audience, issuer and temporal claims', async () => {
    const issuer = new LocalOidcIssuer(
      'test',
      'https://synthetic-issuer.invalid',
      'SYNTH-AUDIENCE',
    );
    for (const role of roles) {
      const verifier = issuer.verifier(clock);
      const token = issuer.issue({
        actorReference: `SYNTH-ACTOR-${role}`,
        expiresAtSeconds: now + 60,
        institutionId: role.startsWith('INSTITUTION_') ? 'SYNTH-INSTITUTION-001' : null,
        notBeforeSeconds: now - 1,
        organisationReference: 'SYNTH-ORGANISATION-001',
        roles: [role],
      });
      await expect(verifier.verify(token)).resolves.toMatchObject({ roles: [role] });
    }
  });

  it('rejects malformed, expired, future, tampered, retired and wrong-audience tokens', async () => {
    const issuer = new LocalOidcIssuer(
      'test',
      'https://synthetic-issuer.invalid',
      'SYNTH-AUDIENCE',
    );
    const verifierBeforeRotation = issuer.verifier(clock);
    const validInput = {
      actorReference: 'SYNTH-ACTOR-001',
      expiresAtSeconds: now + 60,
      institutionId: null,
      notBeforeSeconds: now - 1,
      organisationReference: 'SYNTH-ORGANISATION-001',
      roles: ['AUDITOR'] as const,
    };
    const valid = issuer.issue(validInput);
    await expect(verifierBeforeRotation.verify('not-a-token')).resolves.toBeNull();
    await expect(verifierBeforeRotation.verify(`${valid}x`)).resolves.toBeNull();
    await expect(
      verifierBeforeRotation.verify(issuer.issue({ ...validInput, expiresAtSeconds: now })),
    ).resolves.toBeNull();
    await expect(
      verifierBeforeRotation.verify(issuer.issue({ ...validInput, notBeforeSeconds: now + 60 })),
    ).resolves.toBeNull();
    issuer.rotate('SYNTH-OIDC-KEY-002');
    const rotated = issuer.issue(validInput);
    await expect(verifierBeforeRotation.verify(rotated)).resolves.toMatchObject({
      roles: ['AUDITOR'],
    });
    issuer.retire('SYNTH-OIDC-KEY-001');
    await expect(verifierBeforeRotation.verify(valid)).resolves.toBeNull();
    const wrongAudience = new LocalOidcIssuer(
      'test',
      'https://synthetic-issuer.invalid',
      'SYNTH-WRONG-AUDIENCE',
    );
    await expect(
      verifierBeforeRotation.verify(wrongAudience.issue(validInput)),
    ).resolves.toBeNull();
  });

  it('cannot be enabled in production', () => {
    expect(
      () => new LocalOidcIssuer('production', 'https://synthetic-issuer.invalid', 'SYNTH-AUDIENCE'),
    ).toThrow(expect.objectContaining({ code: 'UNSAFE_PRODUCTION_CONFIGURATION' }));
  });
});
