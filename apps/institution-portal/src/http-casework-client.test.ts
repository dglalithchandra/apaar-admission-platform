import { expect, it, vi } from 'vitest';
import { HttpCaseworkClient } from './http-casework-client.js';
it('reads the persisted actor conflict declaration after declaring no conflict', async () => {
  const item = {
    admissionId: 'SYNTH-ADMISSION',
    caseId: 'SYNTH-CASE',
    caseReference: 'SYNTH-CASE-REF',
    caseType: 'ADMISSION_CORRECTION',
    institutionId: 'SYNTH-INSTITUTION-001',
    policyVersion: 'SYNTH-POLICY',
    priority: 'NORMAL',
    state: 'UNDER_REVIEW',
    version: 3,
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(item)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...item, conflictStatus: 'CLEAR' })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ registration_reference: 'SYNTH-REGISTRATION' })),
    );
  const api = new HttpCaseworkClient({
    baseUrl: '',
    fetch: fetcher,
    token: async () => 'SYNTH-TOKEN',
  });
  expect((await api.declareConflict('SYNTH-CASE', 2, false)).conflictStatus).toBe('CLEAR');
  expect(fetcher.mock.calls[1]?.[0]).toBe('/v1/cases/SYNTH-CASE');
});
