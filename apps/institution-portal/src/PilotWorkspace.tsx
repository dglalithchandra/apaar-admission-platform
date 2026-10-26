import { useState, type JSX } from 'react';

export type PilotPreviewState =
  | 'LOADING'
  | 'EMPTY'
  | 'BLOCKED'
  | 'MANUAL_REVIEW'
  | 'READY'
  | 'APPROVED'
  | 'RUNNING'
  | 'DEGRADED'
  | 'PAUSED'
  | 'INCIDENT'
  | 'RECOVERING'
  | 'FAILED'
  | 'TERMINATED'
  | 'COMPLETED';

const COPY: Readonly<
  Record<PilotPreviewState, { readonly detail: string; readonly title: string }>
> = {
  APPROVED: {
    detail:
      'An independent checker approved this exact synthetic execution version. The scheduled window still applies.',
    title: 'Approved for synthetic start',
  },
  BLOCKED: {
    detail:
      'Approval-data freshness or reconciliation is blocking this institution. It cannot receive pilot exposure.',
    title: 'Go-live blocked',
  },
  COMPLETED: {
    detail:
      'Workers drained, totals reconcile, capacity and audit checks passed, and the completion report is immutable.',
    title: 'Synthetic execution completed',
  },
  DEGRADED: {
    detail:
      'The identity dependency is unavailable. Identity work remains pending and is never marked invalid.',
    title: 'Dependency degraded',
  },
  EMPTY: {
    detail: 'No synthetic institution is assigned to this execution cohort.',
    title: 'No cohort membership',
  },
  FAILED: {
    detail: 'A technical gate failed. Correct the evidence and create a new immutable assessment.',
    title: 'Execution gate failed',
  },
  INCIDENT: {
    detail:
      'An incident is active. Cohort exposure is stopped while accepted admission records remain unchanged.',
    title: 'Incident response active',
  },
  LOADING: {
    detail: 'Reading the latest immutable execution, worker and evidence records.',
    title: 'Loading execution control plane',
  },
  MANUAL_REVIEW: {
    detail:
      'Production authority has not been supplied. The local dress rehearsal remains explicitly synthetic only.',
    title: 'Authority review required',
  },
  PAUSED: {
    detail:
      'New cohort exposure is paused. Existing accepted records and capacity reservations are unchanged.',
    title: 'Execution safely paused',
  },
  READY: {
    detail:
      'Every blocking technical check passed. Independent maker-checker review is the next step.',
    title: 'Ready for go-live review',
  },
  RECOVERING: {
    detail:
      'Recovery evidence is being validated. Resume stays disabled until every blocking check passes.',
    title: 'Recovery validation in progress',
  },
  RUNNING: {
    detail:
      'Synthetic exposure is running within the approved cohort, schedule, limits and stop controls.',
    title: 'Synthetic execution running',
  },
  TERMINATED: {
    detail:
      'The execution ended without deleting its configuration, evidence, incidents, receipts or audit history.',
    title: 'Execution terminated',
  },
};

const STATES: readonly PilotPreviewState[] = [
  'READY',
  'MANUAL_REVIEW',
  'BLOCKED',
  'APPROVED',
  'RUNNING',
  'DEGRADED',
  'PAUSED',
  'INCIDENT',
  'RECOVERING',
  'FAILED',
  'TERMINATED',
  'COMPLETED',
  'EMPTY',
  'LOADING',
];

const INSTITUTIONS = [
  ['SYNTH-INSTITUTION-001', 'Ready institution', 'READY', '2 campuses'],
  ['SYNTH-INSTITUTION-002', 'Approval data requires refresh', 'BLOCKED', '1 campus'],
  ['SYNTH-INSTITUTION-003', 'Identity provider degraded', 'DEGRADED', '1 campus'],
  ['SYNTH-INSTITUTION-004', 'Locally paused', 'PAUSED', '1 campus'],
] as const;

export function PilotWorkspace({
  mode,
}: {
  readonly mode: 'INSTITUTION' | 'AICTE' | 'UNAVAILABLE';
}): JSX.Element {
  const [state, setState] = useState<PilotPreviewState>('READY');
  if (mode === 'UNAVAILABLE') {
    return (
      <div className="error-summary" role="alert">
        <strong>Pilot access is not available</strong>
        <p>This synthetic persona has no execution-control responsibility.</p>
      </div>
    );
  }
  const current = COPY[state];
  const executionStopped = ['PAUSED', 'INCIDENT', 'TERMINATED', 'COMPLETED'].includes(state);
  return (
    <div className="pilot-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Synthetic pilot execution · no live institutions</p>
          <h1>
            {mode === 'AICTE' ? 'Pilot execution control plane' : 'Institution pilot operations'}
          </h1>
          <p>
            {mode === 'AICTE'
              ? 'Review the cohort, approve exact versions, operate stop controls and reconcile the technical exit.'
              : 'Track onboarding, blockers, submissions, dependencies, incidents and required actions for your tenant.'}
          </p>
        </div>
        <span className="template-badge">Stage 7B · synthetic only</span>
      </div>

      <div className="integration-warning" role="note">
        <strong>Production authority not supplied</strong>
        <span>
          The dress rehearsal is locally executable, but a real rollout remains blocked. All
          references and evidence here are synthetic.
        </span>
      </div>

      <section aria-labelledby="pilot-state-heading" className="panel pilot-state-panel">
        <div className="section-heading">
          <div>
            <p className="step">SYNTH-EXECUTION-PORTAL-001 · version 8</p>
            <h2 id="pilot-state-heading">{current.title}</h2>
          </div>
          <span className={`status status--${state.toLowerCase()}`}>
            {state.toLowerCase().replace('_', ' ')}
          </span>
        </div>
        <p aria-live="polite">{current.detail}</p>
        <div
          aria-label="Preview execution states"
          className="integration-actions pilot-state-actions"
          role="group"
        >
          {STATES.map((value) => (
            <button
              aria-pressed={state === value}
              className="button button--secondary"
              key={value}
              onClick={() => {
                setState(value);
              }}
              type="button"
            >
              Preview {value.toLowerCase().replace('_', ' ')}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Execution summary" className="pilot-scorecard">
        {[
          [
            'Onboarding',
            state === 'BLOCKED' ? '75%' : '100%',
            'Three ready or contained; one freshness blocker',
          ],
          [
            'Submission success',
            state === 'DEGRADED' ? '91%' : '97%',
            'Rejected rows retain stable rule codes',
          ],
          [
            'Reconciliation drift',
            state === 'FAILED' ? '2' : '0',
            'Source, decisions, capacity, audit and outbox',
          ],
          [
            'Pending identity',
            state === 'DEGRADED' || state === 'INCIDENT' ? '18' : '2',
            'Retryable; never falsely invalid',
          ],
          [
            'Open incidents',
            state === 'INCIDENT' || state === 'RECOVERING' ? '1' : '0',
            'Synthetic owner and recovery checklist assigned',
          ],
          [
            'Worker dead letters',
            state === 'FAILED' ? '1' : '0',
            'Durable checkpoints and bounded retries',
          ],
        ].map(([label, result, detail]) => (
          <article className="panel" key={label}>
            <span>{label}</span>
            <strong>{result}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      {mode === 'AICTE' ? (
        <section aria-labelledby="cohort-heading" className="panel pilot-section">
          <div className="section-heading">
            <div>
              <p className="step">Cohort overview</p>
              <h2 id="cohort-heading">Four synthetic institutions</h2>
            </div>
            <span className="status status--manual_review">authority review</span>
          </div>
          <div className="pilot-institution-grid">
            {INSTITUTIONS.map(([reference, label, readiness, campuses]) => (
              <article key={reference}>
                <span>{reference}</span>
                <strong>{label}</strong>
                <small>{campuses}</small>
                <span className={`status status--${readiness.toLowerCase()}`}>
                  {readiness.toLowerCase()}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section aria-labelledby="onboarding-heading" className="panel pilot-section">
          <div className="section-heading">
            <div>
              <p className="step">Institution onboarding</p>
              <h2 id="onboarding-heading">SYNTH-INSTITUTION-001</h2>
            </div>
            <span className="status status--ready">ready</span>
          </div>
          <ol className="pilot-checklist">
            <li>
              <strong>Membership confirmed</strong>
              <span>Two synthetic campuses match the approved tenant.</span>
            </li>
            <li>
              <strong>Migration reconciled</strong>
              <span>120 source rows · 118 accepted · 2 explicit corrections · zero drift.</span>
            </li>
            <li>
              <strong>Training complete</strong>
              <span>Operator and administrator task checks recorded.</span>
            </li>
            <li>
              <strong>Action if degraded</strong>
              <span>
                Keep identity work pending and use the incident reference; do not retry manually.
              </span>
            </li>
          </ol>
        </section>
      )}

      <div className="pilot-two-column">
        <section aria-labelledby="go-no-go-heading" className="panel pilot-section">
          <div className="section-heading">
            <div>
              <p className="step">Go / no-go</p>
              <h2 id="go-no-go-heading">Fail-closed decision package</h2>
            </div>
          </div>
          <ul className="pilot-gate-list">
            {[
              [
                'Configuration, membership and approval freshness',
                state === 'BLOCKED' ? 'FAIL' : 'PASS',
              ],
              ['Migration, reconciliation and rollback', state === 'FAILED' ? 'FAIL' : 'PASS'],
              ['Security, recovery, accessibility and training', 'PASS'],
              [
                'Identity, support, observability and incident owner',
                state === 'DEGRADED' ? 'FAIL' : 'PASS',
              ],
              ['Production authority', 'MANUAL REVIEW'],
            ].map(([label, result]) => (
              <li key={label}>
                <span>{label}</span>
                <strong>{result}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="controls-heading" className="panel pilot-section">
          <div className="section-heading">
            <div>
              <p className="step">Operational controls</p>
              <h2 id="controls-heading">Stop, recover and resume safely</h2>
            </div>
          </div>
          <dl className="receipt-details">
            <div>
              <dt>Global stop</dt>
              <dd>{state === 'TERMINATED' ? 'On' : 'Off'}</dd>
            </div>
            <div>
              <dt>Cohort stop</dt>
              <dd>{executionStopped ? 'On' : 'Off'}</dd>
            </div>
            <div>
              <dt>Lease health</dt>
              <dd>{state === 'FAILED' ? 'Attention' : 'Healthy'}</dd>
            </div>
            <div>
              <dt>Last checkpoint</dt>
              <dd>SYNTH-WORK-018 · row 100</dd>
            </div>
          </dl>
          <p className="guidance">
            Start, resume, expansion and completion require optimistic versions and independent
            approval. Analytics never overrides admission policy.
          </p>
        </section>
      </div>

      <section aria-labelledby="incident-heading" className="panel pilot-section">
        <div className="section-heading">
          <div>
            <p className="step">Incident and recovery</p>
            <h2 id="incident-heading">SYNTH-INCIDENT-PORTAL-001 · identity provider outage</h2>
          </div>
          <span
            className={`status status--${state === 'INCIDENT' ? 'incident' : state === 'RECOVERING' ? 'recovering' : 'completed'}`}
          >
            {state === 'INCIDENT' ? 'active' : state === 'RECOVERING' ? 'recovering' : 'resolved'}
          </span>
        </div>
        <div className="pilot-timeline" aria-label="Incident timeline">
          <span>
            <strong>12:04</strong> outage detected; identity requests changed to pending
          </span>
          <span>
            <strong>12:05</strong> cohort stop applied; accepted admissions preserved
          </span>
          <span>
            <strong>12:19</strong> provider recovered; checkpoint replay verified
          </span>
          <span>
            <strong>12:22</strong> independent checker approved safe resume
          </span>
        </div>
      </section>

      <section
        aria-labelledby="completion-heading"
        className="panel pilot-section completion-panel"
      >
        <div className="section-heading">
          <div>
            <p className="step">Exit reconciliation and recommendation</p>
            <h2 id="completion-heading">Authority review required</h2>
          </div>
          <span className="status status--manual_review">not a rollout decision</span>
        </div>
        <p>
          The technical record has zero drift, valid capacity counters, consistent audit/outbox
          events and no unresolved incident. One authority-controlled policy item remains.
        </p>
        <p className="guidance">
          Software may recommend <strong>AUTHORITY_REVIEW_REQUIRED</strong>; only an accountable
          authority can decide whether to extend, expand or terminate a real pilot.
        </p>
      </section>
    </div>
  );
}
