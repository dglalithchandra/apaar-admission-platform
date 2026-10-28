import { describe, expect, it, vi } from 'vitest';
import { HttpPortalClient, syntheticSessionToken } from './http-portal-client.js';
const token = () => Promise.resolve('SYNTH-TOKEN');
describe('connected batch client', () => {
  it('uploads multipart content, reconciles totals, lists rows, retries and exports corrections', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('SYNTH-TEMPLATE'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ batchId: 'SYNTH-BATCH' })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            batchId: 'SYNTH-BATCH',
            status: 'COMPLETED',
            totals: { accepted: 1, failedFinal: 0, total: 1 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ recordKey: 'SYNTH-ROW', status: 'ACCEPTED' }] })),
      )
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ recordKey: 'SYNTH-ROW', status: 'ACCEPTED' })),
      )
      .mockResolvedValueOnce(new Response('SYNTH-CORRECTIONS'))
      .mockResolvedValueOnce(new Response('<html>SYNTH-RECORD</html>'));
    const client = new HttpPortalClient({ baseUrl: '', fetch: fetcher, token });
    expect(await client.templateCsv()).toBe('SYNTH-TEMPLATE');
    expect(
      (await client.createBatch(new File(['SYNTH-CSV'], 'SYNTH-FILE.csv', { type: 'text/csv' })))
        .totals.failed,
    ).toBe(0);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBeInstanceOf(FormData);
    expect(await client.listRows('SYNTH-BATCH')).toEqual([
      { recordKey: 'SYNTH-ROW', status: 'ACCEPTED' },
    ]);
    expect(await client.retryRow('SYNTH-BATCH', 'SYNTH-ROW')).toMatchObject({ status: 'ACCEPTED' });
    expect(await client.correctionCsv('SYNTH-BATCH')).toBe('SYNTH-CORRECTIONS');
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await client.printableRecord('SYNTH-REGISTRATION');
    expect(click).toHaveBeenCalled();
    click.mockRestore();
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer SYNTH-TOKEN',
    );
  });
  it('preserves structured errors and safely handles non-JSON failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'SYNTH-DENIED' }), { status: 403 }),
      )
      .mockResolvedValueOnce(new Response('SYNTH-NOT-JSON', { status: 502 }));
    const client = new HttpPortalClient({ baseUrl: '', fetch: fetcher, token });
    await expect(client.templateCsv()).rejects.toThrow('SYNTH-DENIED');
    await expect(client.templateCsv()).rejects.toThrow('connected gateway');
  });
  it('bounds polling when durable workers or retry jobs do not settle', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({ batchId: 'SYNTH-BATCH' })))
        .mockImplementation(() =>
          Promise.resolve(new Response(JSON.stringify({ status: 'PROCESSING' }))),
        );
      const client = new HttpPortalClient({ baseUrl: '', fetch: fetcher, token });
      const upload = expect(client.createBatch(new File(['SYNTH'], 'SYNTH.csv'))).rejects.toThrow(
        'worker did not settle',
      );
      await vi.runAllTimersAsync();
      await upload;
      const retry = expect(client.retryRow('SYNTH-BATCH', 'SYNTH-ROW')).rejects.toThrow(
        'retry did not settle',
      );
      await vi.runAllTimersAsync();
      await retry;
    } finally {
      vi.useRealTimers();
    }
  });
  it('caches a synthetic session and fails on denied session issuance', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'SYNTH-CACHED' })));
    const session = syntheticSessionToken('', 'AUDITOR', fetcher);
    expect(await session()).toBe('SYNTH-CACHED');
    expect(await session()).toBe('SYNTH-CACHED');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      syntheticSessionToken(
        '',
        'AUDITOR',
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 })),
      )(),
    ).rejects.toThrow('session is unavailable');
  });
});
