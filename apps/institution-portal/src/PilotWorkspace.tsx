import { useState, type JSX } from 'react';

export type PilotPreviewState =
  | 'LOADING'
  | 'EMPTY'
  | 'BLOCKED'
  | 'DEGRADED'
  | 'PAUSED'
  | 'READY'
  | 'ACTIVE'
  | 'FAILED'
  | 'COMPLETED';

const COPY: Readonly<
  Record<PilotPreviewState, { readonly detail: string; readonly title: string }>
> = {
  ACTIVE: {
    detail:
      'Cohort exposure is active. Regulatory validation and capacity controls remain mandatory.',
    title: 'Pilot active',
  },
  BLOCKED: {
    detail:
      'Approval data and one accountable policy decision are still required. Activation is disabled.',
    title: 'Activation blocked',
  },
  COMPLETED: {
    detail: 'Exit reconciliation has zero drift and the immutable pilot record is complete.',
    title: 'Pilot completed',
  },
  DEGRADED: {
    detail:
      'The identity dependency is unavailable. Records remain pending and are not marked invalid.',
    title: 'Dependency degraded',
  },
  EMPTY: {
    detail: 'No synthetic institution is assigned to this cohort yet.',
    title: 'No cohort membership',
  },
  FAILED: {
    detail: 'The migration gate failed. Correct the rejected rows and run another dry run.',
    title: 'Migration failed',
  },
  LOADING: {
    detail: 'Reading the latest immutable rollout state.',
    title: 'Loading pilot readiness',
  },
  PAUSED: {
    detail: 'New pilot exposure is paused. Previously accepted admission records are unchanged.',
    title: 'Pilot safely paused',
  },
  READY: {
    detail: 'All local readiness checks passed. Independent checker approval is still required.',
    title: 'Ready for checker review',
  },
};

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
        <p>This synthetic persona has no controlled-rollout responsibility.</p>
      </div>
    );
  }
  const current = COPY[state];
  return (
    <div className="pilot-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Synthetic controlled rollout</p>
          <h1>{mode === 'AICTE' ? 'Pilot cohort management' : 'Institution onboarding'}</h1>
          <p>
            Prepare, reconcile and gate a pilot without activating a real institution or processing
            real student data.
          </p>
        </div>
        <span className="template-badge">Stage 7A · local only</span>
      </div>

      <div className="integration-warning" role="note">
        <strong>No live rollout</strong>
        <span>
          Every institution, identity, approval and migration reference on this page is synthetic.
        </span>
      </div>

      <section aria-labelledby="pilot-state-heading" className="panel pilot-state-panel">
        <div className="section-heading">
          <div>
            <p className="step">Current rollout gate</p>
            <h2 id="pilot-state-heading">{current.title}</h2>
          </div>
          <span className={`status status--${state.toLowerCase()}`}>{state.toLowerCase()}</span>
        </div>
        <p aria-live="polite">{current.detail}</p>
        <div aria-label="Preview rollout states" className="integration-actions" role="group">
          {(
            [
              'READY',
              'BLOCKED',
              'DEGRADED',
              'PAUSED',
              'ACTIVE',
              'FAILED',
              'COMPLETED',
              'EMPTY',
              'LOADING',
            ] as const
          ).map((value) => (
            <button
              className="button button--secondary"
              key={value}
              onClick={() => {
                setState(value);
              }}
              type="button"
            >
              Preview {value.toLowerCase()}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Pilot readiness scorecard" className="pilot-scorecard">
        {[
          ['Configuration', 'PASS', 'Cohort, campuses, window and limits recorded'],
          [
            'Approval data',
            state === 'BLOCKED' ? 'FAIL' : 'PASS',
            'Effective synthetic approval snapshot',
          ],
          [
            'Migration',
            state === 'FAILED' ? 'FAIL' : 'PASS',
            'Dry run reconciled with explicit corrections',
          ],
          [
            'Dependencies',
            state === 'DEGRADED' ? 'REVIEW' : 'PASS',
            'Outages fail pending, never falsely invalid',
          ],
          ['Security & recovery', 'PASS', 'Container, access and restore checks passed'],
          [
            'Independent approval',
            state === 'ACTIVE' || state === 'COMPLETED' ? 'PASS' : 'REVIEW',
            'Maker-checker separation',
          ],
        ].map(([label, result, detail]) => (
          <article className="panel" key={label}>
            <span>{label}</span>
            <strong>{result}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section aria-labelledby="migration-heading" className="panel">
        <div className="section-heading">
          <div>
            <p className="step">Migration receipt</p>
            <h2 id="migration-heading">SYNTH-MIGRATION-PORTAL-001</h2>
          </div>
          <span className="status status--dry_run_completed">dry run completed</span>
        </div>
        <dl className="receipt-details">
          <div>
            <dt>Total rows</dt>
            <dd>120</dd>
          </div>
          <div>
            <dt>Accepted</dt>
            <dd>118</dd>
          </div>
          <div>
            <dt>Explicit corrections</dt>
            <dd>2</dd>
          </div>
          <div>
            <dt>Reconciliation drift</dt>
            <dd>0</dd>
          </div>
        </dl>
        <p className="guidance">
          Identity and regulatory values are never silently corrected. Staged data can be rolled
          back only before activation.
        </p>
      </section>
    </div>
  );
}
