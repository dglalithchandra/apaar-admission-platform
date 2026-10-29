import type { JSX } from 'react';
import type { PortalFinding } from './types.js';
import { resolutionPlan } from './resolution-plan.js';

export function ResolutionPlan({
  findings,
}: {
  readonly findings: readonly PortalFinding[];
}): JSX.Element {
  const steps = resolutionPlan(findings);
  return (
    <details>
      <summary>Resolution planner: {String(steps.length)} finding-specific steps</summary>
      <p>
        Guidance from these recorded findings. No changes have been applied and no acceptance is
        promised. Resolving one finding does not clear the others. Current server validation must
        run again before any admission or seat change.
      </p>
      {steps.length === 0 ? (
        <p>
          No action is derived from these findings. This does not certify the current record or
          independently verify eligibility.
        </p>
      ) : (
        <ol>
          {steps.map((step, index) => (
            <li key={`${step.code}-${String(index)}`}>
              <strong>
                Rule: {step.code}
                {step.field ? ` · ${step.field}` : ''}
              </strong>
              <p>Recorded finding: {step.originalFinding}</p>
              <p>
                Responsible actor: {step.owner}. Route: {step.route}.
              </p>
              <p>{step.action}</p>
              <p>Required evidence: {step.requiredEvidence}</p>
            </li>
          ))}
        </ol>
      )}
      <p>
        For an existing registered admission, use Create governed request below when available.
        Failed upload rows use correction and resubmission; this panel does not create an
        unsupported case for an unregistered row.
      </p>
    </details>
  );
}
