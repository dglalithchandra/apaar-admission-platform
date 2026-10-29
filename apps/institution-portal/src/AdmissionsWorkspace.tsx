import { useEffect, useRef, useState, type JSX } from 'react';
import type { AdmissionListItem, AdmissionEvidence, PortalClient } from './types.js';
import { createEvidenceBundle } from './evidence-integrity.js';
import { ResolutionPlan } from './ResolutionPlan.js';
import { resolutionPlan } from './resolution-plan.js';

export function AdmissionsWorkspace({
  client,
  allowed,
  canRequest,
  onRequest,
}: {
  readonly client: PortalClient;
  readonly allowed: boolean;
  readonly canRequest: boolean;
  readonly onRequest: (reference: string) => void;
}): JSX.Element {
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<readonly AdmissionListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdmissionEvidence | null>(null);
  useEffect(() => {
    if (detail) detailHeading.current?.focus();
  }, [detail]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [evidenceRoot, setEvidenceRoot] = useState('');
  async function exportEvidence(): Promise<void> {
    if (!detail) return;
    setBusy(true);
    setError('');
    try {
      const bundle = await createEvidenceBundle({
        registrationReference: detail.registration_reference,
        ...detail.evidence,
        resolutionGuidance: {
          version: 'niyamsetu-resolution-guidance/1',
          decisions: detail.evidence.decisions.map((decision) => ({
            rulesetVersion: decision.ruleset_version,
            steps: resolutionPlan(decision.findings),
          })),
        },
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'niyamsetu-admission-evidence.json';
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
      setEvidenceRoot(bundle.root);
    } catch {
      setError('Evidence export failed. A secure browser with SHA-256 support is required.');
    } finally {
      setBusy(false);
    }
  }
  async function load(after = ''): Promise<void> {
    setBusy(true);
    setError('');
    setDetail(null);
    setEvidenceRoot('');
    try {
      if (!client.listAdmissions)
        throw new Error('Admission browsing requires the connected local gateway.');
      const page = await client.listAdmissions(search.trim(), after);
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Records could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (allowed) void load();
  }, [client, allowed]);
  async function inspect(reference: string): Promise<void> {
    setBusy(true);
    setError('');
    setDetail(null);
    setEvidenceRoot('');
    try {
      if (!client.admissionEvidence) throw new Error('Stored evidence is unavailable.');
      setDetail(await client.admissionEvidence(reference));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evidence could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <div className="error-summary" role="alert">
        Admission records are available to institution and case-review accounts only. Verifiers
        receive only scoped verification claims.
      </div>
    );
  return (
    <div className="admissions-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admission registry</p>
          <h1>Admissions and decision evidence</h1>
          <p>
            Find an institution record, read its stored decision and follow its governed changes.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-summary">
          {error}
        </p>
      )}
      <section className="panel">
        <form
          className="filters"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label>
            Search reference or student key
            <input
              value={search}
              maxLength={128}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>
          <button className="button" disabled={busy} type="submit">
            Search admissions
          </button>
        </form>
        {busy && <p role="status">Loading stored records…</p>}
        {!busy && items.length === 0 && (
          <p>No matching admissions. Try another search or upload a synthetic CSV.</p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student key</th>
                <th>Category</th>
                <th>Current status</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.student_key}</td>
                  <td>{item.category}</td>
                  <td>{item.current_status}</td>
                  <td>
                    <button
                      className="button button--secondary"
                      disabled={busy}
                      onClick={() => {
                        void inspect(item.registration_reference ?? item.id);
                      }}
                    >
                      View decision
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-actions">
          <button
            className="button button--secondary"
            disabled={busy}
            onClick={() => {
              void load();
            }}
          >
            First page
          </button>
          {cursor && (
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                void load(cursor);
              }}
            >
              Next page
            </button>
          )}
        </div>
      </section>
      {detail && (
        <section className="panel" aria-label="Stored decision evidence">
          <h2 tabIndex={-1} ref={detailHeading}>
            {detail.registration_reference ?? 'Unregistered admission decision'}
          </h2>
          {detail.evidence.decisions.map((decision, i) => (
            <div key={i}>
              <h3>
                {decision.outcome} · decision {i + 1}
              </h3>
              <p>Ruleset: {decision.ruleset_version}</p>
              <ResolutionPlan findings={decision.findings} />
              {decision.findings.map((finding, j) => (
                <p key={j}>
                  <strong>{finding.code}</strong>: {finding.message}
                </p>
              ))}
            </div>
          ))}
          <p>Approval: {detail.evidence.approval?.id ?? 'No effective approval recorded'}</p>
          <p>
            Source: {detail.evidence.approval?.source ?? 'Unavailable'} ·{' '}
            {detail.evidence.approval?.sourceRecord ?? 'No source reference'}
          </p>
          <h3>Governed history</h3>
          {detail.evidence.history.length === 0 ? (
            <p>No governed changes recorded.</p>
          ) : (
            <ol>
              {detail.evidence.history.map((h) => (
                <li key={h.version}>
                  Version {h.version}: {h.status}
                  {h.caseId ? ` · Case ${h.caseId}` : ''}
                </li>
              ))}
            </ol>
          )}
          <p>
            These are stored historical findings and references; the original outcome has not been
            recomputed under the latest rules. Historical counter values and replay are not
            inferred.
          </p>
          {canRequest && detail.registration_reference && (
            <button
              className="button"
              onClick={() => {
                if (detail.registration_reference) onRequest(detail.registration_reference);
              }}
            >
              Create governed request
            </button>
          )}
          <details>
            <summary>Recorded input, source and reservation details</summary>
            <pre className="evidence-json">{JSON.stringify(detail.evidence, null, 2)}</pre>
          </details>
          <h3>Evidence integrity</h3>
          <p>
            Export this stored snapshot with SHA-256 section checksums and a Merkle root. Keep the
            root separately to detect later edits. This is not an issuer signature, a complete
            database audit or proof of an event’s real-world time. The file contains record
            evidence; share it only with authorized recipients.
          </p>
          <button
            className="button button--secondary"
            disabled={busy}
            onClick={() => {
              void exportEvidence();
            }}
          >
            Download evidence bundle
          </button>
          {evidenceRoot && (
            <p role="status">
              Retain this root independently: <code>{evidenceRoot}</code>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
