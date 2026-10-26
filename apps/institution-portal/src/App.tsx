import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type JSX } from 'react';
import { CaseworkWorkspace } from './CaseworkWorkspace.js';
import type { CaseworkClient, CaseworkRole } from './casework-types.js';
import { DemoCaseworkClient } from './demo-casework-client.js';
import { DemoIntegrationClient } from './demo-integration-client.js';
import { DemoPortalClient } from './demo-client.js';
import { IntegrationWorkspace } from './IntegrationWorkspace.js';
import type { IntegrationClient } from './integration-types.js';
import type { PortalBatch, PortalClient, PortalRow, RowStatus } from './types.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILTERS: readonly { label: string; value: 'ALL' | RowStatus }[] = [
  { label: 'All rows', value: 'ALL' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Manual review', value: 'MANUAL_REVIEW' },
  { label: 'Retryable', value: 'FAILED_RETRYABLE' },
  { label: 'Invalid file rows', value: 'INVALID' },
];
type PreviewRole = CaseworkRole | 'INSTITUTION_ADMINISTRATOR' | 'AUDITOR' | 'AUTHORIZED_VERIFIER';

function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readableStatus(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function fileError(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.csv')) return 'Choose a file ending in .csv.';
  if (file.size === 0) return 'The selected CSV is empty.';
  if (file.size > MAX_FILE_BYTES) return 'The CSV is larger than the 5 MB upload limit.';
  if (file.type !== '' && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
    return 'The selected file is not recognised as CSV content.';
  }
  return null;
}

function StatusPill({ status }: { readonly status: string }): JSX.Element {
  return <span className={`status status--${status.toLowerCase()}`}>{readableStatus(status)}</span>;
}

function Summary({ batch }: { readonly batch: PortalBatch }): JSX.Element {
  const items = [
    ['Accepted', batch.totals.accepted, 'Records registered successfully'],
    ['Rejected', batch.totals.rejected, 'Correct the source data before resubmitting'],
    ['Manual review', batch.totals.manualReview, 'Requires authorised human review'],
    ['Retryable', batch.totals.retryable, 'A temporary dependency can be retried'],
  ] as const;
  return (
    <section aria-labelledby="summary-heading" className="summary-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reconciled result</p>
          <h2 id="summary-heading">{batch.totals.total} uploaded rows</h2>
        </div>
        <StatusPill status={batch.status} />
      </div>
      <div className="summary-grid">
        {items.map(([label, value, detail]) => (
          <article className="summary-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <dl className="receipt-details">
        <div>
          <dt>Receipt</dt>
          <dd>{batch.receiptReference}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{new Date(batch.receivedAt).toLocaleString('en-IN')}</dd>
        </div>
        <div>
          <dt>File SHA-256</dt>
          <dd className="hash">{batch.sha256}</dd>
        </div>
      </dl>
    </section>
  );
}

export function App({
  client,
  caseworkClient,
  integrationClient,
  initialRole = 'INSTITUTION_OPERATOR',
  initialView = 'BATCH',
}: {
  readonly client?: PortalClient;
  readonly caseworkClient?: CaseworkClient;
  readonly integrationClient?: IntegrationClient;
  readonly initialRole?: PreviewRole;
  readonly initialView?: 'BATCH' | 'CASEWORK' | 'INTEGRATIONS';
}): JSX.Element {
  const batchClient = useMemo(() => client ?? new DemoPortalClient(), [client]);
  const governedCaseworkClient = useMemo(
    () => caseworkClient ?? new DemoCaseworkClient(),
    [caseworkClient],
  );
  const governedIntegrationClient = useMemo(
    () => integrationClient ?? new DemoIntegrationClient(),
    [integrationClient],
  );
  const [view, setView] = useState<'BATCH' | 'CASEWORK' | 'INTEGRATIONS'>(initialView);
  const [role, setRole] = useState<PreviewRole>(initialRole);
  const caseworkRole: CaseworkRole | null =
    role === 'INSTITUTION_ADMINISTRATOR'
      ? 'INSTITUTION_OPERATOR'
      : role === 'AUDITOR' || role === 'AUTHORIZED_VERIFIER'
        ? null
        : role;
  const [selected, setSelected] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<PortalBatch | null>(null);
  const [rows, setRows] = useState<readonly PortalRow[]>([]);
  const [filter, setFilter] = useState<'ALL' | RowStatus>('ALL');
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (filter === 'ALL' || row.status === filter) &&
          row.recordKey.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [filter, query, rows],
  );

  function selectFile(file: File | undefined): void {
    if (file === undefined) return;
    const problem = fileError(file);
    setError(problem);
    setSelected(problem === null ? file : null);
  }

  function fileChanged(event: ChangeEvent<HTMLInputElement>): void {
    selectFile(event.currentTarget.files?.[0]);
  }

  function dropped(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0]);
  }

  async function submit(): Promise<void> {
    if (selected === null) {
      setError('Select a valid version 1.0 CSV before uploading.');
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await batchClient.createBatch(selected);
      setBatch(created);
      setRows(await batchClient.listRows(created.batchId));
    } catch {
      setError('The upload could not be completed. Your file has not been accepted; try again.');
    } finally {
      setBusy(false);
    }
  }

  async function template(): Promise<void> {
    downloadText('student-admission-template-v1.0.csv', await batchClient.templateCsv());
  }

  async function correction(): Promise<void> {
    if (batch !== null) {
      downloadText(
        `corrections-${batch.receiptReference}.csv`,
        await batchClient.correctionCsv(batch.batchId),
      );
    }
  }

  async function retry(row: PortalRow): Promise<void> {
    if (batch === null || row.status !== 'FAILED_RETRYABLE') return;
    const updated = await batchClient.retryRow(batch.batchId, row.recordKey);
    setRows((current) =>
      current.map((item) => (item.recordKey === row.recordKey ? updated : item)),
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          AR
        </div>
        <div className="brand-copy">
          <strong>Admission Registry</strong>
          <span>Institution workspace · Synthetic environment</span>
        </div>
        <div className="session">
          <span>Synthetic Institute of Technology</span>
          <label className="role-switcher">
            <span className="sr-only">Preview role</span>
            <select
              aria-label="Preview role"
              onChange={(event) => {
                const next = event.currentTarget.value as PreviewRole;
                setRole(next);
                if (next === 'AUDITOR' || next === 'AUTHORIZED_VERIFIER') {
                  setView('INTEGRATIONS');
                }
              }}
              value={role}
            >
              <option value="INSTITUTION_OPERATOR">Institution operator</option>
              <option value="INSTITUTION_ADMINISTRATOR">Institution administrator</option>
              <option value="AICTE_REVIEWER">AICTE reviewer</option>
              <option value="AICTE_CHECKER">AICTE checker</option>
              <option value="AUDITOR">Auditor</option>
              <option value="AUTHORIZED_VERIFIER">Authorized verifier</option>
            </select>
          </label>
        </div>
      </header>
      <div className="workspace">
        <nav aria-label="Institution navigation" className="sidebar">
          <p className="nav-label">Admissions</p>
          <button
            aria-current={view === 'BATCH' ? 'page' : undefined}
            onClick={() => {
              setView('BATCH');
            }}
            type="button"
          >
            Batch upload
          </button>
          <button
            aria-current={view === 'CASEWORK' ? 'page' : undefined}
            onClick={() => {
              setView('CASEWORK');
            }}
            type="button"
          >
            Casework
          </button>
          <button
            aria-current={view === 'INTEGRATIONS' ? 'page' : undefined}
            onClick={() => {
              setView('INTEGRATIONS');
            }}
            type="button"
          >
            Integration assurance
          </button>
          <div className="support-note">
            <strong>Need help?</strong>
            <span>Keep the receipt reference when contacting support.</span>
          </div>
        </nav>
        <main id="main-content">
          {view === 'CASEWORK' ? (
            caseworkRole === null ? (
              <div className="error-summary" role="alert">
                <strong>Casework access is not available</strong>
                <p>This synthetic persona has purpose-limited integration access only.</p>
              </div>
            ) : (
              <CaseworkWorkspace client={governedCaseworkClient} role={caseworkRole} />
            )
          ) : view === 'INTEGRATIONS' ? (
            <IntegrationWorkspace client={governedIntegrationClient} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">2026–27 admission cycle</p>
                  <h1>Upload student admission data</h1>
                  <p>
                    Validate a product-owned CSV template, receive an immutable receipt and correct
                    only the rows requiring action.
                  </p>
                </div>
                <button
                  className="button button--secondary"
                  onClick={() => void template()}
                  type="button"
                >
                  Download template v1.0
                </button>
              </div>

              {error !== null && (
                <div aria-labelledby="error-title" className="error-summary" role="alert">
                  <strong id="error-title">There is a problem</strong>
                  <p>{error}</p>
                </div>
              )}

              <section aria-labelledby="upload-heading" className="panel upload-panel" id="upload">
                <div className="section-heading">
                  <div>
                    <p className="step">Step 1 of 2</p>
                    <h2 id="upload-heading">Select the completed CSV</h2>
                  </div>
                  <span className="template-badge">Template 1.0</span>
                </div>
                <p className="guidance">
                  Maximum 5 MB and 10,000 rows. Use UTF-8 CSV. Do not include names, dates of birth,
                  Aadhaar numbers or contact details.
                </p>
                <div
                  className="dropzone"
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={dropped}
                >
                  <div className="upload-icon" aria-hidden="true">
                    ↑
                  </div>
                  <label htmlFor="batch-file">Choose a CSV file</label>
                  <span>or drag and drop it here</span>
                  <input
                    accept=".csv,text/csv"
                    id="batch-file"
                    onChange={fileChanged}
                    ref={input}
                    type="file"
                  />
                </div>
                {selected !== null && (
                  <div className="selected-file" aria-live="polite">
                    <div>
                      <strong>{selected.name}</strong>
                      <span>
                        {Math.max(1, Math.round(selected.size / 1024))} KB · ready to upload
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setSelected(null);
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="panel-actions">
                  <span>Receipt creation does not mean every row is accepted.</span>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => void submit()}
                    type="button"
                  >
                    {busy ? 'Uploading…' : 'Upload and validate'}
                  </button>
                </div>
              </section>

              {batch === null ? (
                <section className="empty-state" id="results">
                  <span aria-hidden="true">≡</span>
                  <h2>No batch selected</h2>
                  <p>Upload a CSV to see reconciled totals and row-level results.</p>
                </section>
              ) : (
                <>
                  <Summary batch={batch} />
                  <section
                    aria-labelledby="rows-heading"
                    className="panel results-panel"
                    id="results"
                  >
                    <div className="section-heading">
                      <div>
                        <p className="step">Step 2 of 2</p>
                        <h2 id="rows-heading">Review row results</h2>
                      </div>
                      <button
                        className="button button--secondary"
                        onClick={() => void correction()}
                        type="button"
                      >
                        Download correction CSV
                      </button>
                    </div>
                    <div className="filters">
                      <label>
                        Search record key
                        <input
                          onChange={(event) => {
                            setQuery(event.currentTarget.value);
                          }}
                          placeholder="SYNTH-RECORD-…"
                          type="search"
                          value={query}
                        />
                      </label>
                      <label>
                        Result
                        <select
                          onChange={(event) => {
                            setFilter(event.currentTarget.value as 'ALL' | RowStatus);
                          }}
                          value={filter}
                        >
                          {FILTERS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <caption className="sr-only">Admission batch row results</caption>
                        <thead>
                          <tr>
                            <th scope="col">Row</th>
                            <th scope="col">Record key</th>
                            <th scope="col">Result</th>
                            <th scope="col">Explanation</th>
                            <th scope="col">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((row) => (
                            <tr key={row.recordKey}>
                              <td>{row.rowNumber}</td>
                              <td className="record-key">{row.recordKey}</td>
                              <td>
                                <StatusPill status={row.status} />
                              </td>
                              <td>
                                {row.findings.length === 0 ? (
                                  <span className="muted">No issues</span>
                                ) : (
                                  <div className="finding">
                                    <strong>{row.findings[0]?.code}</strong>
                                    <span>{row.findings[0]?.message}</span>
                                  </div>
                                )}
                              </td>
                              <td>
                                {row.status === 'FAILED_RETRYABLE' ? (
                                  <button
                                    className="text-button"
                                    onClick={() => void retry(row)}
                                    type="button"
                                  >
                                    Retry row
                                  </button>
                                ) : row.admissionReference !== null ? (
                                  <span className="reference">{row.admissionReference}</span>
                                ) : (
                                  <span className="muted">Use correction file</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {visibleRows.length === 0 && (
                      <p className="no-results" role="status">
                        No rows match the current filters.
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
