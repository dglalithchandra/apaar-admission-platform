import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resolutionPlan } from './resolution-plan.js';
import { ResolutionPlan } from './ResolutionPlan.js';
const finding = (code: string, field: string | null = null) => ({
  code,
  field,
  message: 'SYNTH-ORIGINAL-FINDING',
});

describe('finding-specific resolution guidance', () => {
  it('keeps interacting constraints unresolved instead of promising acceptance', () => {
    const plan = resolutionPlan([
      finding('FIELD_REQUIRED', 'student_reference'),
      finding('TFW_CAPACITY_EXCEEDED'),
      finding('ELIGIBILITY_EVIDENCE_PENDING'),
    ]);
    expect(plan.map((p) => p.route)).toEqual([
      'CORRECT_AND_RESUBMIT',
      'GOVERNED_REVIEW',
      'GOVERNED_REVIEW',
    ]);
    expect(plan[0]?.action).toContain('student_reference');
    expect(plan[1]?.action).toContain('No automatic capacity repair');
    expect(plan[2]?.requiredEvidence).toContain('CSV VERIFIED');
  });
  it('does not reinterpret an overlap as fraud and preserves original findings', () => {
    for (const code of ['STUDENT_ADMISSION_DUPLICATE', 'STUDENT_ENROLMENT_OVERLAP_REVIEW']) {
      const step = resolutionPlan([finding(code)])[0];
      expect(step?.action).toContain('not proof of fraud');
      expect(step?.originalFinding).toBe('SYNTH-ORIGINAL-FINDING');
    }
  });
  it('routes provider recovery without substituting verification', () => {
    expect(resolutionPlan([finding('IDENTITY_PROVIDER_UNAVAILABLE')])[0]?.owner).toBe(
      'SERVICE_OPERATOR',
    );
  });
  it('fails closed for unknown rules and unresolved authority', () => {
    for (const code of ['SYNTH-NEW-RULE', 'APPROVAL_POLICY_UNRESOLVED', 'APPROVAL_NOT_FOUND'])
      expect(resolutionPlan([finding(code)])[0]?.route).toBe('GOVERNED_REVIEW');
  });
  it('does not mutate inputs or infer unresolved actions from the identity success code', () => {
    const findings = Object.freeze([Object.freeze(finding('IDENTITY_VERIFIED'))]);
    expect(resolutionPlan(findings)).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(resolutionPlan([finding('FIELD_REQUIRED')])[0]?.action).toContain('field named');
  });
  it('renders action boundaries, evidence and all remaining constraints', () => {
    render(
      <ResolutionPlan
        findings={[finding('FIELD_REQUIRED'), finding('ORDINARY_CAPACITY_EXCEEDED')]}
      />,
    );
    expect(screen.getByText(/2 finding-specific steps/)).toBeInTheDocument();
    expect(screen.getByText(/no acceptance is promised/)).toBeInTheDocument();
    expect(screen.getByText(/No automatic capacity repair/)).toBeInTheDocument();
  });
  it('does not certify a record with no actionable findings', () => {
    render(<ResolutionPlan findings={[]} />);
    expect(screen.getByText(/does not certify/)).toBeInTheDocument();
  });
});
