import { describe, expect, it, vi } from 'vitest';
import { HttpOversightClient } from './oversight-client.js';
describe('oversight HTTP client', () => {
  it('loads and exports an authenticated report page', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'SYNTH-TOKEN' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [], nextOffset: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'SYNTH-TOKEN' })))
      .mockResolvedValueOnce(new Response('SYNTH-CSV'));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const client = new HttpOversightClient('', fetcher);
    expect(await client.load('AUDITOR', '2026-27', 0)).toEqual({ rows: [], nextOffset: null });
    await client.exportPage('AUDITOR', '2026-27', 100);
    expect(fetcher.mock.calls[3]?.[0]).toContain('capacity.csv?academicYear=2026-27&offset=100');
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
  it('rejects failed report requests', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'SYNTH-TOKEN' })))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(
      new HttpOversightClient('', fetcher).load('AUTHORIZED_VERIFIER', '2026-27', 0),
    ).rejects.toThrow('unavailable');
  });
});
