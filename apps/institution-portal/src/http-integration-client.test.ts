import { describe, expect, it, vi } from 'vitest';
import { HttpIntegrationClient } from './http-integration-client.js';

describe('HttpIntegrationClient', () => {
  it('uses the public readiness route without a bearer token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          apaar: 'DISABLED',
          database: 'UP',
          notifications: 'DISABLED',
          status: 'UP',
        }),
        { status: 200 },
      ),
    );
    const client = new HttpIntegrationClient({
      baseUrl: 'http://127.0.0.1:8080',
      fetch: fetcher,
      token: vi.fn().mockResolvedValue('SYNTH-TOKEN'),
    });
    await expect(client.readiness()).resolves.toMatchObject({ status: 'UP' });
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('authorization');
  });

  it('uses bearer authentication and maps stable gateway problems', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            algorithm: 'SYNTHETIC-SHA256-NOT-FOR-PRODUCTION',
            claims: { ADMISSION_EXISTS: true },
            expiresAt: '2026-10-26T12:15:00.000Z',
            keyId: 'SYNTH-KEY-001',
            verificationReference: 'SYNTH-VERIFICATION-001',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: 'The provider is unavailable.',
            errors: [{ code: 'DEPENDENCY_UNAVAILABLE' }],
          }),
          { status: 503 },
        ),
      );
    const client = new HttpIntegrationClient({
      baseUrl: 'http://127.0.0.1:8080',
      fetch: fetcher,
      token: vi.fn().mockResolvedValue('SYNTH-TOKEN'),
    });
    await expect(client.createSyntheticVerification()).resolves.toMatchObject({
      verificationReference: 'SYNTH-VERIFICATION-001',
    });
    await expect(client.simulateProviderOutage()).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer SYNTH-TOKEN',
    );
  });

  it('does not pretend production HTTP can simulate access failures', async () => {
    const client = new HttpIntegrationClient({
      baseUrl: 'http://127.0.0.1:8080',
      fetch,
      token: vi.fn().mockResolvedValue(null),
    });
    await expect(client.simulateAccess('FORBIDDEN')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
