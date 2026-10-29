import { HANDBOOK_SOURCE } from '@apaar-platform/admission-domain';
import { useMemo, useState, type JSX } from 'react';
import { BASELINE_LEVERS, runPolicyTwin } from './policy-twin-demo.js';

function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element {
  return (
    <article className="twin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function PolicyTwinWorkspace({ allowed }: { readonly allowed: boolean }): JSX.Element {
  const [showAllTransitions, setShowAllTransitions] = useState(false);
  const [ordinaryOccupied, setOrdinaryOccupied] = useState(0);
  const [ordinaryIntake, setOrdinaryIntake] = useState(80);
  const [nriLimit, setNriLimit] = useState(4);
  const [tfwCapacity, setTfwCapacity] = useState(4);
  const [kind, setKind] = useState<'CURRENT_RULE_CONFIGURATION' | 'HYPOTHETICAL_AMENDMENT'>(
    'CURRENT_RULE_CONFIGURATION',
  );
  const result = useMemo(
    () => runPolicyTwin({ nriLimit, ordinaryIntake, tfwCapacity }, ordinaryOccupied, kind),
    [nriLimit, ordinaryIntake, tfwCapacity, ordinaryOccupied, kind],
  );
  const maximum = Math.max(result.baseline.accepted, result.proposed.accepted, 1);

  if (!allowed) {
    return (
      <div className="error-summary" role="alert">
        <strong>Policy Lab is restricted</strong>
        <p>Only AICTE reviewers, checkers and auditors can run advisory policy simulations.</p>
      </div>
    );
  }

  return (
    <div className="twin-page">
      <div className="page-heading twin-heading">
        <div>
          <p className="eyebrow">Admission Policy Digital Twin</p>
          <h1>Compare admission outcomes before changing a rule</h1>
          <p>
            Replay one synthetic cohort through a source-aligned synthetic baseline and a proposed
            configuration. The live admission ledger is never touched.
          </p>
        </div>
        <span className="twin-safety">Advisory only · zero live writes</span>
      </div>

      <section className="panel twin-provenance" aria-label="Policy provenance">
        <p>
          Baseline: synthetic approval of 60 ordinary seats, three NRI seats within intake and three
          separate TFW seats.
        </p>
        <p>
          <a href={HANDBOOK_SOURCE.url}>AICTE handbook 2024–27</a> · PDF pages 34, 35, 70, 71, 75
          and 76. Fixture: {result.baselineApprovalSnapshotId}, effective 1 January 2026. This is
          source-aligned fictional data, not an official institution approval.
        </p>
        <label>
          Proposal status
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as typeof kind);
            }}
          >
            <option value="CURRENT_RULE_CONFIGURATION">Configuration within current rules</option>
            <option value="HYPOTHETICAL_AMENDMENT">Hypothetical regulatory amendment</option>
          </select>
        </label>
        <p>
          {kind === 'HYPOTHETICAL_AMENDMENT'
            ? 'NOT AUTHORIZED: explores proposed 10% NRI and TFW ceilings. No live admission uses these rules.'
            : 'Proposed configuration only, not an approved change. Current-rule ceilings apply. Inconsistent settings are blocked; fractional limits require review.'}
        </p>
      </section>
      {result.proposedConfigurationFindings.length > 0 && (
        <section className="error-summary" role="alert">
          <strong>Proposal cannot be treated as authorized capacity</strong>
          {result.proposedConfigurationFindings.map((f, i) => (
            <p key={i}>
              {f.code}: {f.message}
            </p>
          ))}
        </section>
      )}
      <details className="panel">
        <summary>Recorded inputs and source provenance — reproduce this result</summary>
        <pre style={{ overflowX: 'auto', maxHeight: '24rem' }}>
          {JSON.stringify(result.reproduction, null, 2)}
        </pre>
      </details>
      <aside className="twin-note" aria-label="Simulation assumptions">
        <strong>Scenario evidence, not a forecast.</strong> This replay starts with{' '}
        {ordinaryOccupied} occupied ordinary seats; other capacity buckets start empty and uses a
        fixed synthetic cohort in file order. Reversing that order changes{' '}
        {result.orderingSensitivity.baselineChangedStudents} baseline outcomes and{' '}
        {result.orderingSensitivity.proposedChangedStudents} proposed outcomes. This compares two
        orders only and does not establish fairness or merit priority.
      </aside>
      <section aria-labelledby="scenario-heading" className="panel twin-controls">
        <div className="section-heading">
          <div>
            <p className="step">Synthetic cohort · 84 admissions</p>
            <h2 id="scenario-heading">Build a policy scenario</h2>
          </div>
          <button
            className="button button--secondary"
            onClick={() => {
              setKind('CURRENT_RULE_CONFIGURATION');
              setOrdinaryOccupied(0);
              setOrdinaryIntake(80);
              setNriLimit(4);
              setTfwCapacity(4);
            }}
            type="button"
          >
            Example scenario
          </button>
        </div>
        <label className="twin-occupancy">
          Existing ordinary admissions
          <input
            type="number"
            min="0"
            max={BASELINE_LEVERS.ordinaryIntake}
            step="1"
            value={ordinaryOccupied}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              setOrdinaryOccupied(
                Number.isFinite(value)
                  ? Math.max(0, Math.min(BASELINE_LEVERS.ordinaryIntake, Math.floor(value)))
                  : 0,
              );
            }}
          />
        </label>
        <div className="twin-levers">
          <label>
            <span>
              Approved intake <strong>{ordinaryIntake}</strong>
            </span>
            <input
              aria-label="Proposed approved intake"
              max="120"
              min="20"
              onChange={(event) => {
                setOrdinaryIntake(Number(event.currentTarget.value));
              }}
              type="range"
              value={ordinaryIntake}
            />
            <small>Current: {BASELINE_LEVERS.ordinaryIntake}</small>
          </label>
          <label>
            <span>
              NRI limit within intake <strong>{nriLimit}</strong>
            </span>
            <input
              aria-label="Proposed NRI limit"
              max="10"
              min="0"
              onChange={(event) => {
                setNriLimit(Number(event.currentTarget.value));
              }}
              type="range"
              value={nriLimit}
            />
            <small>Current: {BASELINE_LEVERS.nriLimit}</small>
          </label>
          <label>
            <span>
              TFW opportunity seats <strong>{tfwCapacity}</strong>
            </span>
            <input
              aria-label="Proposed TFW capacity"
              max="12"
              min="0"
              onChange={(event) => {
                setTfwCapacity(Number(event.currentTarget.value));
              }}
              type="range"
              value={tfwCapacity}
            />
            <small>Current: {BASELINE_LEVERS.tfwCapacity}</small>
          </label>
        </div>
      </section>

      <section aria-label="Simulation outcome" className="twin-metrics">
        <Metric
          detail="admissions under selected assumptions"
          label="Scenario acceptance change"
          value={signed(result.acceptedSeatDelta)}
        />
        <Metric
          detail="exhausted buckets only; excludes invalid configuration"
          label="Capacity rejections"
          value={String(result.preventedExcessAdmissions)}
        />
        <Metric
          detail="sent to accountable humans"
          label="Manual review"
          value={String(result.proposed.manualReview)}
        />
        <Metric
          detail="versioned rules; proposal status above"
          label="Ruleset"
          value={result.rulesetVersion}
        />
      </section>

      <div className="twin-grid">
        <section aria-labelledby="comparison-heading" className="panel twin-comparison">
          <div className="section-heading">
            <div>
              <p className="step">Counterfactual comparison</p>
              <h2 id="comparison-heading">Baseline versus proposal</h2>
            </div>
          </div>
          {[
            ['Source-aligned synthetic baseline', result.baseline.accepted, 'baseline'],
            ['Proposed policy', result.proposed.accepted, 'proposed'],
          ].map(([label, count, kind]) => (
            <div className="twin-bar-row" key={String(label)}>
              <div>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
              <div className="twin-bar-track">
                <span
                  className={`twin-bar twin-bar--${String(kind)}`}
                  style={{ width: `${String((Number(count) / maximum) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="twin-note">
            This is a deterministic “what-if” replay—not an AI guess. Every changed outcome can be
            traced to a machine-readable policy rule.
          </p>
        </section>

        <section aria-labelledby="impact-heading" className="panel twin-impact">
          <div className="section-heading">
            <div>
              <p className="step">Distribution check</p>
              <h2 id="impact-heading">Who gains access?</h2>
            </div>
          </div>
          <div className="impact-list">
            {result.categoryImpacts.map((impact) => (
              <div key={impact.category}>
                <span>{impact.category.replaceAll('_', ' ')}</span>
                <strong className={impact.delta > 0 ? 'positive' : ''}>
                  {signed(impact.delta)}
                </strong>
                <small>
                  {impact.baselineAccepted} → {impact.proposedAccepted} accepted
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="evidence-heading" className="panel twin-evidence">
        <div className="section-heading">
          <div>
            <p className="step">Explainable evidence</p>
            <h2 id="evidence-heading">Why outcomes changed</h2>
          </div>
          <span className="template-badge">{result.transitions.length} transitions</span>
        </div>
        {result.transitions.length > 10 && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setShowAllTransitions(!showAllTransitions);
            }}
          >
            {showAllTransitions
              ? 'Show first 10 transitions'
              : `Show all ${String(result.transitions.length)} transitions`}
          </button>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {(showAllTransitions ? result.transitions : result.transitions.slice(0, 10)).map(
                (transition) => (
                  <tr key={transition.studentKey}>
                    <td>
                      <small>{transition.studentKey}</small>
                      <br />
                      {transition.category.replaceAll('_', ' ')}
                    </td>
                    <td>{transition.baseline}</td>
                    <td>
                      <span className="status">{transition.proposed}</span>
                    </td>
                    <td>
                      {transition.explanation}
                      <small>
                        Before codes: {transition.baselineRuleCodes.join(', ')}
                        <br />
                        After codes: {transition.proposedRuleCodes.join(', ')}
                      </small>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
