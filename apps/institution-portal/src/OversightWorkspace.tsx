import { useState, type JSX } from 'react';
import type { OversightClient, OversightPage } from './oversight-client.js';
export function OversightWorkspace({
  client,
  role,
}: {
  readonly client?: OversightClient;
  readonly role: string;
}): JSX.Element {
  const [year, setYear] = useState('2026-27');
  const [page, setPage] = useState<OversightPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = [
    'INSTITUTION_OPERATOR',
    'INSTITUTION_ADMINISTRATOR',
    'AICTE_REVIEWER',
    'AICTE_CHECKER',
    'AUDITOR',
  ].includes(role);
  async function load(next = 0): Promise<void> {
    if (!client) return;
    setBusy(true);
    setError(null);
    setPage(null);
    try {
      const result = await client.load(role, year, next);
      setPage(result);
      setOffset(next);
    } catch {
      setError('The report could not be loaded. Check the academic year and service availability.');
    } finally {
      setBusy(false);
    }
  }
  async function exportPage(): Promise<void> {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await client.exportPage(role, year, offset);
    } catch {
      setError('The current page could not be exported. Try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!allowed)
    return (
      <div className="error-summary" role="alert">
        Capacity oversight is unavailable for this role.
      </div>
    );
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Approval evidence</p>
          <h1>Capacity oversight</h1>
          <p>
            Compare stored capacity counters with reservations after releases. Institution accounts
            see only their own records.
          </p>
        </div>
      </div>
      <section className="panel" aria-label="Capacity report">
        <div className="panel-actions">
          <label>
            Academic year
            <input
              value={year}
              onChange={(event) => {
                setYear(event.currentTarget.value);
                setPage(null);
              }}
              placeholder="2026-27"
            />
          </label>
          <button
            className="button"
            disabled={busy || !client}
            onClick={() => void load()}
            type="button"
          >
            Load report
          </button>
          <button
            className="button button--secondary"
            disabled={busy || page === null}
            onClick={() => void exportPage()}
            type="button"
          >
            Export current page
          </button>
        </div>
        {!client && (
          <p role="status">Connect the local gateway to load stored capacity evidence.</p>
        )}
        {busy && <p role="status">Loading capacity evidence…</p>}
        {error !== null && (
          <div className="error-summary" role="alert">
            {error}
          </div>
        )}
        {page !== null && (
          <>
            {page.summary !== undefined && (
              <dl className="receipt-details">
                <div>
                  <dt>Active admission records</dt>
                  <dd>{page.summary.activeAdmissionRecords}</dd>
                </div>
                <div>
                  <dt>Review outcomes</dt>
                  <dd>{page.summary.reviewOutcomes}</dd>
                </div>
                <div>
                  <dt>Review outcomes without approval</dt>
                  <dd>{page.summary.unlinkedReviewOutcomes}</dd>
                </div>
                <div>
                  <dt>Retryable upload rows</dt>
                  <dd>{page.summary.retryableRows}</dd>
                </div>
              </dl>
            )}
            {page.institutionCapacities !== undefined && page.institutionCapacities.length > 0 && (
              <div className="table-scroll">
                <table>
                  <caption>Institution-wide capacity buckets on this page</caption>
                  <thead>
                    <tr>
                      <th>Institution / bucket</th>
                      <th>Approved</th>
                      <th>Counter</th>
                      <th>Ledger</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.institutionCapacities.map((row, index) => (
                      <tr key={`${row.institutionReference}-${row.bucket}-${String(index)}`}>
                        <td>
                          {row.institutionReference} / {row.bucket}
                        </td>
                        <td>{row.approvedCapacity}</td>
                        <td>{row.counterUsed}</td>
                        <td>{row.ledgerUsed}</td>
                        <td>{row.drift === 0 ? 'Reconciled' : `Review: ${String(row.drift)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p role="status">
              {page.rows.length} course buckets and {page.institutionCapacities?.length ?? 0}{' '}
              institution buckets on this page.{' '}
              {page.rows.filter((row) => row.drift !== 0).length +
                (page.institutionCapacities?.filter((row) => row.drift !== 0).length ?? 0)}{' '}
              reconciliation differences.
            </p>
            <div className="table-scroll">
              <table>
                <caption>
                  Approval-linked capacity; historical snapshots are included. Student counts repeat
                  per bucket and must not be added together.
                </caption>
                <thead>
                  <tr>
                    <th>Institution / course</th>
                    <th>Approval / bucket</th>
                    <th>Approved</th>
                    <th>Counter</th>
                    <th>Ledger</th>
                    <th>Difference</th>
                    <th>Active records</th>
                    <th>Review records</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.allocationReference}>
                      <td>
                        {row.institutionReference}
                        <br />
                        {row.courseReference}
                      </td>
                      <td>
                        {row.approvalReference}
                        <br />
                        {row.bucket}
                      </td>
                      <td>{row.approvedCapacity}</td>
                      <td>{row.counterUsed}</td>
                      <td>{row.ledgerUsed}</td>
                      <td>{row.drift === 0 ? 'Reconciled' : `Review: ${String(row.drift)}`}</td>
                      <td>{row.acceptedRecords}</td>
                      <td>{row.pendingReviewRecords}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {page.rows.length === 0 && (
              <p>No approval-linked capacity was found for this academic year.</p>
            )}
            <div className="panel-actions">
              <button
                className="button button--secondary"
                disabled={busy || offset === 0}
                onClick={() => void load(Math.max(0, offset - 100))}
                type="button"
              >
                Previous page
              </button>
              <button
                className="button button--secondary"
                disabled={busy || page.nextOffset === null}
                onClick={() => void load(page.nextOffset ?? 0)}
                type="button"
              >
                Next page
              </button>
            </div>
          </>
        )}
        <p>
          Live aggregates include course buckets and institution-wide scheme caps. Unlinked review
          outcomes appear in the summary. CSV exports contain the selected course page only.
        </p>
      </section>
    </div>
  );
}
