import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AuthorizedAcademicIdentityAdapter,
  type AuthorizedProviderTranslator,
  type GatewayClock,
} from '../../src/index.js';

let server: Server | null = null;

afterEach(async () => {
  if (server?.listening === true) {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
  server = null;
});

describe('controlled provider contract server', () => {
  it('retries with bounded jitter, propagates correlation and recovers half-open', async () => {
    let calls = 0;
    const correlations: string[] = [];
    server = createServer((request, response) => {
      calls += 1;
      correlations.push(String(request.headers['x-correlation-id']));
      if (calls <= 2) {
        response.writeHead(503).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"state":"ok"}');
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('SYNTH server failed');
    let clockValue = '2026-10-26T12:00:00.000Z';
    const clock: GatewayClock = { now: () => clockValue };
    const waited: number[] = [];
    const translator: AuthorizedProviderTranslator = {
      decode: (_status, _body, checkedAt) => ({
        checkedAt,
        providerContractVersion: 'SYNTH-CONTRACT-001',
        providerRequestReference: 'SYNTH-PROVIDER-001',
        status: 'VERIFIED',
      }),
      encode: () => ({ opaque: 'SYNTH-OPAQUE' }),
      validate: (_status, body) => {
        if ((body as { state?: unknown }).state !== 'ok') throw new Error('malformed');
      },
    };
    const adapter = new AuthorizedAcademicIdentityAdapter({
      allowInsecureLoopbackForTests: true,
      clock,
      fetch,
      maximumAttempts: 2,
      openAfterFailures: 1,
      openDurationMs: 1_000,
      operationUrl: `http://127.0.0.1:${String(address.port)}/verify`,
      random: () => 0.75,
      retryBaseDelayMs: 100,
      retryJitterRatio: 0.2,
      timeoutMs: 1_000,
      translator,
      wait: (milliseconds) => {
        waited.push(milliseconds);
        return Promise.resolve();
      },
    });
    const input = {
      academicIdentity: 'SYNTH-VERIFIED',
      correlationReference: 'SYNTH-CORRELATION-MOCK-001',
      purpose: 'ADMISSION_LINKING' as const,
    };
    await expect(adapter.verify(input)).resolves.toMatchObject({
      status: 'TEMPORARILY_UNAVAILABLE',
    });
    expect(waited).toEqual([110]);
    await expect(adapter.verify(input)).resolves.toMatchObject({
      status: 'TEMPORARILY_UNAVAILABLE',
    });
    expect(calls).toBe(2);
    clockValue = '2026-10-26T12:00:02.000Z';
    await expect(adapter.verify(input)).resolves.toMatchObject({ status: 'VERIFIED' });
    expect(correlations).toEqual([
      'SYNTH-CORRELATION-MOCK-001',
      'SYNTH-CORRELATION-MOCK-001',
      'SYNTH-CORRELATION-MOCK-001',
    ]);
  });

  it('treats malformed JSON as unavailable without leaking provider content', async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{');
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('SYNTH server failed');
    const adapter = new AuthorizedAcademicIdentityAdapter({
      allowInsecureLoopbackForTests: true,
      clock: { now: () => '2026-10-26T12:00:00.000Z' },
      fetch,
      maximumAttempts: 1,
      openAfterFailures: 1,
      openDurationMs: 1_000,
      operationUrl: `http://127.0.0.1:${String(address.port)}/verify`,
      random: () => 0.5,
      retryBaseDelayMs: 1,
      retryJitterRatio: 0,
      timeoutMs: 1_000,
      translator: {
        decode: () => {
          throw new Error('not reached');
        },
        encode: () => ({ opaque: 'SYNTH-OPAQUE' }),
        validate: () => undefined,
      },
      wait: () => Promise.resolve(),
    });
    await expect(
      adapter.verify({
        academicIdentity: 'SYNTH-MALFORMED',
        correlationReference: 'SYNTH-CORRELATION-MOCK-002',
        purpose: 'CORRECTION_REVIEW',
      }),
    ).resolves.toMatchObject({
      providerRequestReference: null,
      status: 'TEMPORARILY_UNAVAILABLE',
    });
  });
});
