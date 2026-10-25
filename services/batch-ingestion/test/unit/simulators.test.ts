import { describe, expect, it } from 'vitest';
import {
  DeterministicAcademicIdentityVerifier,
  DeterministicMalwareScanner,
  InMemoryObjectStorage,
} from '../../src/simulators.js';
import { UuidBatchReferenceGenerator } from '../../src/references.js';
import { admissionRow } from '../fixtures.js';

describe('local development adapters', () => {
  it.each([
    ['VERIFIED', 'VERIFIED'],
    ['NOT-FOUND', 'NOT_FOUND'],
    ['MISMATCH', 'MISMATCH'],
    ['NOT-ELIGIBLE', 'NOT_ELIGIBLE_FOR_APAAR'],
    ['MANUAL', 'MANUAL_REVIEW'],
    ['RATE-LIMITED', 'RATE_LIMITED'],
    ['OUTAGE', 'TEMPORARILY_UNAVAILABLE'],
  ])('maps synthetic identity scenario %s to %s', async (scenario, expected) => {
    const row = admissionRow('0001');
    const result = await new DeterministicAcademicIdentityVerifier().verify({
      academicIdentityReference: `SYNTH-IDENTITY-${scenario}`,
      correlationReference: 'SYNTH-CORRELATION-0001',
      studentKey: row.studentKey,
    });
    expect(result.status).toBe(expected);
  });

  it('classifies clean, infected and unavailable scanner fixtures', async () => {
    const scanner = new DeterministicMalwareScanner();
    await expect(scanner.scan([Buffer.from('SYNTH-CLEAN')])).resolves.toBe('CLEAN');
    await expect(scanner.scan([Buffer.from('SYNTH-MALWARE-MARKER')])).resolves.toBe('INFECTED');
    await expect(scanner.scan([Buffer.from('SYNTH-SCANNER-UNAVAILABLE')])).resolves.toBe(
      'UNAVAILABLE',
    );
  });

  it('copies stored buffers and creates collision-resistant typed references', async () => {
    const storage = new InMemoryObjectStorage();
    const source = Buffer.from('SYNTH-CONTENT');
    await storage.put('SYNTH-OBJECT-0001', [source], {});
    source.fill(0);
    expect(storage.objects.get('SYNTH-OBJECT-0001')?.[0]?.toString()).toBe('SYNTH-CONTENT');
    expect(new UuidBatchReferenceGenerator().next('BATCH')).toMatch(/^BATCH-[0-9a-f-]+$/);
  });
});
