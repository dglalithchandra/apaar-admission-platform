import { describe, expect, it } from 'vitest';
import { DemoCaseworkClient } from './demo-casework-client.js';

describe('synthetic casework adapter', () => {
  it('runs an institution draft and information-response journey with version guards', async () => {
    const client = new DemoCaseworkClient();
    const created = await client.createCase({
      admissionReference: 'SYNTH-REGISTRATION-TEST-001',
      caseType: 'ADMISSION_CORRECTION',
      reason: 'Synthetic correction reason.',
    });
    expect(created).toMatchObject({ state: 'DRAFT', version: 1 });
    const submitted = await client.submitCase(created.caseId, 1);
    expect(submitted).toMatchObject({ state: 'SUBMITTED', version: 2 });
    await expect(client.submitCase(created.caseId, 1)).rejects.toThrow('stale');
    await expect(client.submitCase(created.caseId, 2)).rejects.toThrow('not valid');

    const informationCase = (await client.listCases('INSTITUTION_OPERATOR')).find(
      (item) => item.state === 'MORE_INFORMATION_REQUIRED',
    );
    expect(informationCase).toBeDefined();
    await expect(
      client.supplyInformation(informationCase!.caseId, informationCase!.version, '   '),
    ).rejects.toThrow('required');
    await expect(
      client.supplyInformation(
        informationCase!.caseId,
        informationCase!.version,
        'SYNTH-EVIDENCE-REFERENCE-001',
      ),
    ).resolves.toMatchObject({ state: 'SUBMITTED' });
  });

  it('enforces reviewer conflict declaration before a recommendation', async () => {
    const client = new DemoCaseworkClient();
    const submitted = (await client.listCases('AICTE_REVIEWER')).find(
      (item) => item.state === 'SUBMITTED',
    );
    expect(submitted).toBeDefined();
    const reviewing = await client.startReview(submitted!.caseId, submitted!.version);
    await expect(
      client.recommendCase(reviewing.caseId, reviewing.version, 'APPROVE', 'Synthetic reason.'),
    ).rejects.toThrow('conflict declaration');
    const conflicted = await client.declareConflict(reviewing.caseId, reviewing.version, true);
    await expect(
      client.recommendCase(conflicted.caseId, conflicted.version, 'APPROVE', 'Synthetic reason.'),
    ).rejects.toThrow('conflict declaration');
  });

  it('supports clear review, information request, decision and implementation outcomes', async () => {
    const client = new DemoCaseworkClient();
    const submitted = (await client.listCases('AICTE_REVIEWER')).find(
      (item) => item.state === 'SUBMITTED',
    )!;
    const reviewing = await client.startReview(submitted.caseId, submitted.version);
    const clear = await client.declareConflict(reviewing.caseId, reviewing.version, false);
    await expect(client.recommendCase(clear.caseId, clear.version, 'APPROVE', '')).rejects.toThrow(
      'explanation',
    );
    await expect(
      client.recommendCase(
        clear.caseId,
        clear.version,
        'MORE_INFORMATION_REQUIRED',
        'Supply synthetic supporting evidence.',
      ),
    ).resolves.toMatchObject({ state: 'MORE_INFORMATION_REQUIRED' });

    const recommended = (await client.listCases('AICTE_CHECKER')).find(
      (item) => item.state === 'RECOMMENDED',
    )!;
    await expect(
      client.decideCase(recommended.caseId, recommended.version, 'APPROVED', ''),
    ).rejects.toThrow('explanation');
    const approved = await client.decideCase(
      recommended.caseId,
      recommended.version,
      'APPROVED',
      'Synthetic independent approval.',
    );
    const implemented = await client.implementCase(approved.caseId, approved.version);
    expect(implemented).toMatchObject({
      implementationReceipt: {
        implementationType: 'TRANSFER',
        targetAdmissionReference: 'SYNTH-REGISTRATION-TARGET-9001',
      },
      state: 'IMPLEMENTED',
    });

    const cancellation = (await client.listCases('AICTE_CHECKER')).find(
      (item) => item.caseType === 'ADMISSION_CANCELLATION' && item.state === 'APPROVED',
    )!;
    await expect(
      client.implementCase(cancellation.caseId, cancellation.version),
    ).resolves.toMatchObject({
      implementationReceipt: {
        implementationType: 'CANCELLATION',
        targetAdmissionReference: null,
      },
    });
  });

  it('rejects missing cases and exposes role-limited queues', async () => {
    const client = new DemoCaseworkClient();
    expect(await client.listCases('INSTITUTION_OPERATOR')).toHaveLength(5);
    expect(await client.listCases('AICTE_REVIEWER')).toHaveLength(2);
    expect(await client.listCases('AICTE_CHECKER')).toHaveLength(2);
    await expect(client.startReview('SYNTH-MISSING-CASE', 1)).rejects.toThrow('not found');
  });
});
