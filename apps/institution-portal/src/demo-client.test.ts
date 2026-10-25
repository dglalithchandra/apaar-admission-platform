import { describe, expect, it } from 'vitest';
import { DemoPortalClient } from './demo-client.js';

describe('synthetic portal adapter', () => {
  it('provides a complete deterministic local workflow without external services', async () => {
    const client = new DemoPortalClient();
    const batch = await client.createBatch(new File(['SYNTH'], 'synthetic.csv'));
    const rows = await client.listRows(batch.batchId);

    expect(batch.batchId).toMatch(/^SYNTH-/);
    expect(rows).toHaveLength(3);
    await expect(client.retryRow(batch.batchId, 'SYNTH-RECORD-0001')).resolves.toMatchObject({
      status: 'ACCEPTED',
    });
    await expect(client.retryRow(batch.batchId, 'SYNTH-MISSING')).rejects.toThrow(
      'Synthetic row not found',
    );
    await expect(client.templateCsv()).resolves.toContain('academic_identity_reference');
    await expect(client.correctionCsv(batch.batchId)).resolves.toContain(
      'CATEGORY_STATUS_MISMATCH',
    );
  });
});
