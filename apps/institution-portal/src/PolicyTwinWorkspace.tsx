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
  const [ordinaryIntake, setOrdinaryIntake] = useState(66);
  const [nriLimit, setNriLimit] = useState(7);
  const [tfwCapacity, setTfwCapacity] = useState(9);
  const result = useMemo(
    () => runPolicyTwin({ nriLimit, ordinaryIntake, tfwCapacity }),
    [nriLimit, ordinaryIntake, tfwCapacity],
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
          <h1>See the human impact before changing a rule</h1>
          <p>
            Replay one synthetic cohort through the approved baseline and a proposed policy. The
            live admission ledger is never touched.
          </p>
        </div>
        <span className="twin-safety">Advisory only · zero live writes</span>
      </div>

      <section aria-labelledby="scenario-heading" className="panel twin-controls">
        <div className="section-heading">
          <div>
            <p className="step">Synthetic cohort · 84 admissions</p>
            <h2 id="scenario-heading">Build a policy scenario</h2>
          </div>
          <button
            className="button button--secondary"
            onClick={() => {
              setOrdinaryIntake(66);
              setNriLimit(7);
              setTfwCapacity(9);
            }}
            type="button"
          >
            Winning scenario
          </button>
        </div>
        <div className="twin-levers">
          <label>
            <span>
              Approved intake <strong>{ordinaryIntake}</strong>
            </span>
            <input
              aria-label="Proposed approved intake"
              max="72"
              min="50"
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
          detail="policy-valid admissions"
          label="Access created"
          value={signed(result.acceptedSeatDelta)}
        />
        <Metric
          detail="still safely blocked"
          label="Excess prevented"
          value={String(result.preventedExcessAdmissions)}
        />
        <Metric
          detail="sent to accountable humans"
          label="Manual review"
          value={String(result.proposed.manualReview)}
        />
        <Metric detail="same source-confirmed engine" label="Ruleset" value="2026.10" />
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
            ['Approved baseline', result.baseline.accepted, 'baseline'],
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
              {result.transitions.slice(0, 8).map((transition) => (
                <tr key={transition.studentKey}>
                  <td>{transition.category.replaceAll('_', ' ')}</td>
                  <td>{transition.baseline}</td>
                  <td>
                    <span className="status status--accept">{transition.proposed}</span>
                  </td>
                  <td>{transition.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
