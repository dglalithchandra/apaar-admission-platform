import { createHash, webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { canonicalJson, createEvidenceBundle, verifyEvidenceBundle } from './evidence-integrity.js';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());
const values = {
  approval: { id: 'SYNTH-APPROVAL', intake: 60 },
  decision: 'SYNTH-ACCEPT',
  history: [],
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('portable evidence integrity', () => {
  it('matches an independent three-leaf expected value, including odd-leaf promotion', async () => {
    const a = sha('leaf:{"name":"approval","value":{"id":"SYNTH-APPROVAL","intake":60}}');
    const b = sha('leaf:{"name":"decision","value":"SYNTH-ACCEPT"}');
    const c = sha('leaf:{"name":"history","value":[]}');
    const expected = sha(`niyamsetu-evidence/1:3:${sha(`node:${sha(`node:${a}:${b}`)}:${c}`)}`);
    const bundle = await createEvidenceBundle(values);
    expect(bundle.root).toBe(expected);
    expect(await verifyEvidenceBundle(JSON.parse(JSON.stringify(bundle)), expected)).toBe(true);
  });
  it('canonicalizes object key order but preserves array order and exact strings', async () => {
    expect(canonicalJson({ b: 1, a: 'SYNTH-α' })).toBe('{"a":"SYNTH-α","b":1}');
    expect((await createEvidenceBundle({ b: 1, a: 2 })).root).toBe(
      (await createEvidenceBundle({ a: 2, b: 1 })).root,
    );
    expect((await createEvidenceBundle({ a: [1, 2] })).root).not.toBe(
      (await createEvidenceBundle({ a: [2, 1] })).root,
    );
  });
  it('handles one leaf and rejects empty or non-JSON values', async () => {
    const bundle = await createEvidenceBundle({ 'SYNTH-RECORD': null });
    expect(await verifyEvidenceBundle(bundle, bundle.root)).toBe(true);
    await expect(createEvidenceBundle({})).rejects.toThrow();
    for (const value of [undefined, NaN, Infinity, new Date()])
      expect(() => canonicalJson(value)).toThrow();
  });
  it.each(['edit', 'delete', 'reorder', 'duplicate', 'digest', 'format', 'extra', 'rename'])(
    'rejects %s tampering',
    async (mutation) => {
      const original = await createEvidenceBundle(values);
      const copy = JSON.parse(JSON.stringify(original)) as {
        format: string;
        root: string;
        sections: { name: string; digest: string; value: { intake: number } }[];
        unprotectedTimestamp?: string;
      };
      if (mutation === 'edit') copy.sections[0]!.value.intake = 61;
      if (mutation === 'delete') copy.sections.pop();
      if (mutation === 'reorder') copy.sections.reverse();
      if (mutation === 'duplicate') copy.sections.push(copy.sections[0]!);
      if (mutation === 'digest') copy.sections[0]!.digest = '0'.repeat(64);
      if (mutation === 'format') copy.format = 'SYNTH-UNKNOWN';
      if (mutation === 'extra') copy.unprotectedTimestamp = 'SYNTH-TIME';
      if (mutation === 'rename') copy.sections[0]!.name = 'SYNTH-RENAMED';
      expect(await verifyEvidenceBundle(copy, original.root)).toBe(false);
    },
  );
  it('rejects wholesale recomputation against the independently retained original root', async () => {
    const original = await createEvidenceBundle(values);
    const replacement = await createEvidenceBundle({ ...values, decision: 'SYNTH-REPLACED' });
    expect(await verifyEvidenceBundle(replacement, original.root)).toBe(false);
    // Without an external commitment an attacker can replace both file and root.
    expect(await verifyEvidenceBundle(replacement, replacement.root)).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    { format: 'niyamsetu-evidence/1', root: '0'.repeat(64), sections: [null] },
  ])('rejects malformed input', async (value) => {
    expect(await verifyEvidenceBundle(value, '0'.repeat(64))).toBe(false);
    expect(await verifyEvidenceBundle(value, '')).toBe(false);
  });
});
