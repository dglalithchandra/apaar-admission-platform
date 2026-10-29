/** Portable snapshot integrity, not an issuer signature or trusted timestamp. */
export const EVIDENCE_FORMAT = 'niyamsetu-evidence/1';

export interface EvidenceBundle {
  readonly format: typeof EVIDENCE_FORMAT;
  readonly sections: readonly {
    readonly name: string;
    readonly value: unknown;
    readonly digest: string;
  }[];
  readonly root: string;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  throw new Error('Evidence must contain finite JSON values only.');
}

async function hash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function createEvidenceBundle(
  values: Readonly<Record<string, unknown>>,
): Promise<EvidenceBundle> {
  const names = Object.keys(values).sort();
  if (names.length === 0) throw new Error('Evidence must contain at least one section.');
  const sections = await Promise.all(
    names.map(async (name) => ({
      name,
      value: values[name],
      digest: await hash(`leaf:${canonicalJson({ name, value: values[name] })}`),
    })),
  );
  let level = sections.map((section) => section.digest);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (!left) throw new Error('Missing evidence digest.');
      next.push(right ? await hash(`node:${left}:${right}`) : left);
    }
    level = next;
  }
  const treeRoot = level[0];
  if (!treeRoot) throw new Error('Missing evidence root.');
  const root = await hash(`${EVIDENCE_FORMAT}:${String(sections.length)}:${treeRoot}`);
  return { format: EVIDENCE_FORMAT, sections, root };
}

/** expectedRoot must be retained independently of the file under verification. */
export async function verifyEvidenceBundle(value: unknown, expectedRoot: string): Promise<boolean> {
  try {
    if (!/^[a-f0-9]{64}$/.test(expectedRoot)) return false;
    if (!value || typeof value !== 'object') return false;
    const bundle = value as Record<string, unknown>;
    if (Object.keys(bundle).sort().join(',') !== 'format,root,sections') return false;
    if (bundle['format'] !== EVIDENCE_FORMAT || bundle['root'] !== expectedRoot) return false;
    if (!Array.isArray(bundle['sections']) || bundle['sections'].length === 0) return false;
    const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const digests: string[] = [];
    let previous: string | undefined;
    for (const item of bundle['sections'] as unknown[]) {
      if (!item || typeof item !== 'object') return false;
      const section = item as Record<string, unknown>;
      if (Object.keys(section).sort().join(',') !== 'digest,name,value') return false;
      const name = section['name'];
      if (typeof name !== 'string' || (previous !== undefined && name <= previous)) return false;
      previous = name;
      if (typeof section['digest'] !== 'string') return false;
      values[name] = section['value'];
      digests.push(section['digest']);
    }
    const calculated = await createEvidenceBundle(values);
    return (
      calculated.root === expectedRoot &&
      calculated.sections.every((section, index) => section.digest === digests[index])
    );
  } catch {
    return false;
  }
}
