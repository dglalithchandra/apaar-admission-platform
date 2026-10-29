import { useEffect, useMemo, useState, type JSX } from 'react';
import type {
  CaseworkClient,
  CaseworkRole,
  PortalCase,
  PortalCaseState,
  PortalCaseType,
} from './casework-types.js';

const TYPE_LABELS: Readonly<Record<PortalCaseType, string>> = {
  ADMISSION_CANCELLATION: 'Admission cancellation',
  ADMISSION_CORRECTION: 'Admission correction',
  INSTITUTION_TRANSFER: 'Institution transfer',
  PROGRAMME_OR_COURSE_TRANSFER: 'Programme or course transfer',
};

const ROLE_COPY: Readonly<
  Record<
    CaseworkRole,
    { readonly eyebrow: string; readonly heading: string; readonly intro: string }
  >
> = {
  INSTITUTION_OPERATOR: {
    eyebrow: 'Institution casework',
    heading: 'Requests and responses',
    intro:
      'Create a governed request, track its exact state and answer reviewer questions without changing the original admission.',
  },
  AICTE_REVIEWER: {
    eyebrow: 'Reviewer work queue',
    heading: 'Assess submitted cases',
    intro:
      'Declare conflicts, examine the stated evidence and send a reasoned recommendation to an independent checker.',
  },
  AICTE_CHECKER: {
    eyebrow: 'Independent checker queue',
    heading: 'Decisions and implementation',
    intro:
      'Review the recommendation and policy provenance before deciding or implementing an approved action.',
  },
};

function words(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function CaseState({ state }: { readonly state: PortalCaseState }): JSX.Element {
  return <span className={`status status--${state.toLowerCase()}`}>{words(state)}</span>;
}

interface CaseworkWorkspaceProps {
  readonly client: CaseworkClient;
  readonly initialAdmissionReference?: string;
  readonly role: CaseworkRole;
}

export function CaseworkWorkspace({
  client,
  role,
  initialAdmissionReference = '',
}: CaseworkWorkspaceProps): JSX.Element {
  const [cases, setCases] = useState<readonly PortalCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<'ALL' | PortalCaseState>('ALL');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(initialAdmissionReference !== '');
  const [admissionReference, setAdmissionReference] = useState(initialAdmissionReference);
  const [caseType, setCaseType] =
    useState<Exclude<PortalCaseType, 'INSTITUTION_TRANSFER'>>('ADMISSION_CORRECTION');
  const [reason, setReason] = useState('');
  const [explanation, setExplanation] = useState('');
  const [confirmingImplementation, setConfirmingImplementation] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setConfirmingImplementation(false);
    void client
      .listCases(role)
      .then((items) => {
        if (!active) return;
        setCases(items);
        setSelectedId(items[0]?.caseId ?? null);
      })
      .catch(() => {
        if (active) setError('The case queue could not be loaded. No case data was changed.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return (): void => {
      active = false;
    };
  }, [client, role]);

  const visibleCases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter(
      (item) =>
        (stateFilter === 'ALL' || item.state === stateFilter) &&
        (needle === '' ||
          item.caseReference.toLowerCase().includes(needle) ||
          item.admissionReference.toLowerCase().includes(needle)),
    );
  }, [cases, query, stateFilter]);
  const selected = cases.find((item) => item.caseId === selectedId) ?? null;
  const copy = ROLE_COPY[role];

  function replace(updated: PortalCase, message: string): void {
    setCases((current) => {
      const exists = current.some((item) => item.caseId === updated.caseId);
      return exists
        ? current.map((item) => (item.caseId === updated.caseId ? updated : item))
        : [updated, ...current];
    });
    setSelectedId(updated.caseId);
    setNotice(message);
    setError(null);
    setExplanation('');
    setConfirmingImplementation(false);
  }

  async function command(action: () => Promise<PortalCase>, message: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      replace(await action(), message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function createCase(): Promise<void> {
    if (admissionReference.trim() === '' || reason.trim() === '') {
      setError('Enter an admission reference and reason before creating the draft.');
      return;
    }
    await command(
      () =>
        client.createCase({
          admissionReference: admissionReference.trim(),
          caseType,
          reason: reason.trim(),
        }),
      'Draft case created. It has not been submitted for review.',
    );
    setAdmissionReference('');
    setReason('');
    setShowCreate(false);
  }

  const needsExplanation =
    selected !== null &&
    ((role === 'INSTITUTION_OPERATOR' && selected.state === 'MORE_INFORMATION_REQUIRED') ||
      (role === 'AICTE_REVIEWER' &&
        selected.state === 'UNDER_REVIEW' &&
        selected.conflictStatus === 'CLEAR') ||
      (role === 'AICTE_CHECKER' && selected.state === 'RECOMMENDED'));

  return (
    <div className="casework-page">
      <div className="page-heading casework-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.heading}</h1>
          <p>{copy.intro}</p>
        </div>
        {role === 'INSTITUTION_OPERATOR' && (
          <button
            aria-expanded={showCreate}
            className="button"
            onClick={() => {
              setShowCreate((current) => !current);
              setError(null);
            }}
            type="button"
          >
            {showCreate ? 'Close form' : 'Create request'}
          </button>
        )}
      </div>

      {error !== null && (
        <div className="error-summary" role="alert">
          <strong>Action not completed</strong>
          <p>{error}</p>
        </div>
      )}
      {notice !== null && (
        <div className="success-summary" role="status">
          <strong>Case updated</strong>
          <p>{notice}</p>
        </div>
      )}

      {showCreate && role === 'INSTITUTION_OPERATOR' && (
        <section aria-labelledby="create-case-heading" className="panel case-create-panel">
          <div className="section-heading">
            <div>
              <p className="step">New governed request</p>
              <h2 id="create-case-heading">Create a draft case</h2>
            </div>
            <span className="template-badge">Not yet submitted</span>
          </div>
          <div className="case-form-grid">
            <label>
              Admission reference
              <input
                onChange={(event) => {
                  setAdmissionReference(event.currentTarget.value);
                }}
                placeholder="SYNTH-REGISTRATION-…"
                value={admissionReference}
              />
            </label>
            <label>
              Request type
              <select
                onChange={(event) => {
                  setCaseType(
                    event.currentTarget.value as Exclude<PortalCaseType, 'INSTITUTION_TRANSFER'>,
                  );
                }}
                value={caseType}
              >
                <option value="ADMISSION_CORRECTION">Admission correction</option>
                <option value="ADMISSION_CANCELLATION">Admission cancellation</option>
                <option value="PROGRAMME_OR_COURSE_TRANSFER">Programme or course transfer</option>
              </select>
            </label>
            <label className="case-form-reason">
              Reason for the request
              <textarea
                maxLength={500}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                }}
                rows={3}
                value={reason}
              />
            </label>
          </div>
          <div className="panel-actions">
            <span>Creating a draft does not change the admission or consume capacity.</span>
            <button
              className="button"
              disabled={busy}
              onClick={() => void createCase()}
              type="button"
            >
              Create draft
            </button>
          </div>
        </section>
      )}

      <section aria-label="Casework queue" className="casework-layout">
        <div className="case-queue panel">
          <div className="case-queue-title">
            <div>
              <p className="step">Work queue</p>
              <h2>{cases.length} visible cases</h2>
            </div>
          </div>
          <div className="case-filters">
            <label>
              Search references
              <input
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                }}
                placeholder="Case or admission reference"
                type="search"
                value={query}
              />
            </label>
            <label>
              State
              <select
                onChange={(event) => {
                  setStateFilter(event.currentTarget.value as 'ALL' | PortalCaseState);
                }}
                value={stateFilter}
              >
                <option value="ALL">All states</option>
                {[
                  'DRAFT',
                  'SUBMITTED',
                  'UNDER_REVIEW',
                  'MORE_INFORMATION_REQUIRED',
                  'RECOMMENDED',
                  'APPROVED',
                  'REJECTED',
                  'IMPLEMENTED',
                ].map((state) => (
                  <option key={state} value={state}>
                    {words(state)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading ? (
            <p aria-live="polite" className="queue-message">
              Loading case queue…
            </p>
          ) : visibleCases.length === 0 ? (
            <p className="queue-message" role="status">
              No cases match this queue and filter.
            </p>
          ) : (
            <ul className="case-list">
              {visibleCases.map((item) => (
                <li key={item.caseId}>
                  <button
                    aria-pressed={selectedId === item.caseId}
                    className="case-list-item"
                    onClick={() => {
                      setSelectedId(item.caseId);
                      setError(null);
                      setNotice(null);
                      setExplanation('');
                      setConfirmingImplementation(false);
                    }}
                    type="button"
                  >
                    <span className="case-list-topline">
                      <strong>{item.caseReference}</strong>
                      <CaseState state={item.state} />
                    </span>
                    <span>{TYPE_LABELS[item.caseType]}</span>
                    <small>{item.admissionReference}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="case-detail panel">
          {selected === null ? (
            <div className="case-detail-empty">
              <span aria-hidden="true">◇</span>
              <h2>Select a case</h2>
              <p>Choose a queue item to see its governed actions and policy provenance.</p>
            </div>
          ) : (
            <>
              <div className="section-heading case-detail-heading">
                <div>
                  <p className="step">{TYPE_LABELS[selected.caseType]}</p>
                  <h2>{selected.caseReference}</h2>
                </div>
                <CaseState state={selected.state} />
              </div>
              <p className="case-summary">{selected.summary}</p>
              <dl className="case-metadata">
                <div>
                  <dt>Admission</dt>
                  <dd>{selected.admissionReference}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{words(selected.priority)}</dd>
                </div>
                <div>
                  <dt>Case version</dt>
                  <dd>{selected.version}</dd>
                </div>
                <div>
                  <dt>Assigned reviewer</dt>
                  <dd>{selected.assignedReviewer ?? 'Not assigned'}</dd>
                </div>
              </dl>
              <div className="policy-strip">
                <div>
                  <span>Policy version</span>
                  <strong>{selected.policyVersion}</strong>
                </div>
                <div>
                  <span>Authority</span>
                  <strong>{words(selected.policyAuthority)}</strong>
                </div>
              </div>
              <div className="case-timeline">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Latest recorded action</strong>
                  <p>{selected.lastAction}</p>
                </div>
              </div>

              {needsExplanation && (
                <label className="explanation-field">
                  {role === 'INSTITUTION_OPERATOR'
                    ? 'Information response'
                    : 'Reasoned explanation'}
                  <textarea
                    maxLength={4000}
                    onChange={(event) => {
                      setExplanation(event.currentTarget.value);
                    }}
                    rows={4}
                    value={explanation}
                  />
                </label>
              )}

              <div className="case-actions" aria-label="Available case actions">
                {role === 'INSTITUTION_OPERATOR' && selected.state === 'DRAFT' && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void command(
                        () => client.submitCase(selected.caseId, selected.version),
                        'Case submitted for review.',
                      )
                    }
                    type="button"
                  >
                    Submit for review
                  </button>
                )}
                {role === 'INSTITUTION_OPERATOR' &&
                  selected.state === 'MORE_INFORMATION_REQUIRED' && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void command(
                          () =>
                            client.supplyInformation(
                              selected.caseId,
                              selected.version,
                              explanation,
                            ),
                          'Information supplied and case returned to the review queue.',
                        )
                      }
                      type="button"
                    >
                      Supply information
                    </button>
                  )}
                {role === 'AICTE_REVIEWER' && selected.state === 'SUBMITTED' && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void command(
                        () => client.startReview(selected.caseId, selected.version),
                        'Review started. A conflict declaration is now required.',
                      )
                    }
                    type="button"
                  >
                    Start review
                  </button>
                )}
                {role === 'AICTE_REVIEWER' &&
                  selected.state === 'UNDER_REVIEW' &&
                  selected.conflictStatus === 'NOT_DECLARED' && (
                    <>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void command(
                            () => client.declareConflict(selected.caseId, selected.version, false),
                            'No conflict declared. Recommendation actions are available.',
                          )
                        }
                        type="button"
                      >
                        Declare no conflict
                      </button>
                      <button
                        className="button button--danger-secondary"
                        disabled={busy}
                        onClick={() =>
                          void command(
                            () => client.declareConflict(selected.caseId, selected.version, true),
                            'Conflict declared. This case must be reassigned.',
                          )
                        }
                        type="button"
                      >
                        Declare conflict
                      </button>
                    </>
                  )}
                {role === 'AICTE_REVIEWER' &&
                  selected.state === 'UNDER_REVIEW' &&
                  selected.conflictStatus === 'CLEAR' && (
                    <>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void command(
                            () =>
                              client.recommendCase(
                                selected.caseId,
                                selected.version,
                                'APPROVE',
                                explanation,
                              ),
                            'Approval recommendation sent to the independent checker.',
                          )
                        }
                        type="button"
                      >
                        Recommend approval
                      </button>
                      <button
                        className="button button--secondary"
                        disabled={busy}
                        onClick={() =>
                          void command(
                            () =>
                              client.recommendCase(
                                selected.caseId,
                                selected.version,
                                'MORE_INFORMATION_REQUIRED',
                                explanation,
                              ),
                            'Information request sent to the institution.',
                          )
                        }
                        type="button"
                      >
                        Request information
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void command(
                            () =>
                              client.recommendCase(
                                selected.caseId,
                                selected.version,
                                'REJECT',
                                explanation,
                              ),
                            'Rejection recommendation sent to the independent checker.',
                          )
                        }
                        type="button"
                      >
                        Recommend rejection
                      </button>
                    </>
                  )}
                {role === 'AICTE_REVIEWER' && selected.conflictStatus === 'DECLARED' && (
                  <p className="action-note" role="status">
                    This reviewer cannot continue. An independent checker must reassign the case.
                  </p>
                )}
                {role === 'AICTE_CHECKER' && selected.state === 'RECOMMENDED' && (
                  <>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void command(
                          () =>
                            client.decideCase(
                              selected.caseId,
                              selected.version,
                              'APPROVED',
                              explanation,
                            ),
                          'Case approved. Implementation remains a separate action.',
                        )
                      }
                      type="button"
                    >
                      Approve case
                    </button>
                    <button
                      className="button button--danger-secondary"
                      disabled={busy}
                      onClick={() =>
                        void command(
                          () =>
                            client.decideCase(
                              selected.caseId,
                              selected.version,
                              'REJECTED',
                              explanation,
                            ),
                          'Case rejected with an independently recorded reason.',
                        )
                      }
                      type="button"
                    >
                      Reject case
                    </button>
                  </>
                )}
                {role === 'AICTE_CHECKER' &&
                  selected.state === 'APPROVED' &&
                  !confirmingImplementation && (
                    <button
                      className="button"
                      onClick={() => {
                        setConfirmingImplementation(true);
                      }}
                      type="button"
                    >
                      Review implementation
                    </button>
                  )}
              </div>

              {role === 'AICTE_CHECKER' &&
                selected.state === 'APPROVED' &&
                confirmingImplementation && (
                  <div className="implementation-confirmation" role="alert">
                    <strong>Confirm the governed implementation</strong>
                    <p>
                      This creates an immutable receipt and changes capacity only inside one
                      transaction. The original admission decision remains unchanged.
                    </p>
                    <div>
                      <button
                        className="button button--danger"
                        disabled={busy}
                        onClick={() =>
                          void command(
                            () => client.implementCase(selected.caseId, selected.version),
                            'Approved action implemented and receipt recorded.',
                          )
                        }
                        type="button"
                      >
                        Confirm implementation
                      </button>
                      <button
                        className="button button--secondary"
                        onClick={() => {
                          setConfirmingImplementation(false);
                        }}
                        type="button"
                      >
                        Keep approved without implementing
                      </button>
                    </div>
                  </div>
                )}

              {selected.implementationReceipt !== null && (
                <div className="implementation-receipt">
                  <p className="step">Immutable implementation receipt</p>
                  <h3>{selected.implementationReceipt.receiptReference}</h3>
                  <dl>
                    <div>
                      <dt>Action</dt>
                      <dd>{words(selected.implementationReceipt.implementationType)}</dd>
                    </div>
                    <div>
                      <dt>Reservations released</dt>
                      <dd>{selected.implementationReceipt.releasedReservationCount}</dd>
                    </div>
                    {selected.implementationReceipt.targetAdmissionReference !== null && (
                      <div>
                        <dt>Target admission</dt>
                        <dd>{selected.implementationReceipt.targetAdmissionReference}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
