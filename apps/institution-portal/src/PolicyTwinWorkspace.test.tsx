import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runPolicyTwin } from './policy-twin-demo.js';
import { PolicyTwinWorkspace } from './PolicyTwinWorkspace.js';

describe('PolicyTwinWorkspace', () => {
  it('models occupied seats and labels order sensitivity without claiming a forecast', () => {
    render(<PolicyTwinWorkspace allowed />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Existing ordinary admissions' }), {
      target: { value: '60' },
    });
    expect(screen.getByLabelText('Simulation assumptions')).toHaveTextContent(
      '60 occupied ordinary seats',
    );
    expect(screen.getByLabelText('Simulation assumptions')).toHaveTextContent('not a forecast');
    fireEvent.click(screen.getByRole('button', { name: 'Example scenario' }));
    expect(screen.getByRole('spinbutton', { name: 'Existing ordinary admissions' })).toHaveValue(0);
  });

  it('shows a safe explainable comparison and recalculates a scenario', () => {
    render(<PolicyTwinWorkspace allowed />);

    expect(
      screen.getByRole('heading', { name: /compare admission outcomes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/zero live writes/i)).toBeInTheDocument();
    expect(screen.getByText('Scenario acceptance change').nextElementSibling).toHaveTextContent(
      '+8',
    );
    expect(screen.getByText(/deterministic “what-if” replay/i)).toBeInTheDocument();

    const intake = screen.getByRole('slider', { name: /approved intake/i });
    fireEvent.change(intake, { target: { value: '60' } });
    expect(screen.getByText('Scenario acceptance change').nextElementSibling).toHaveTextContent(
      '-65',
    );
    expect(screen.getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 67 transitions' }));
    expect(screen.getAllByRole('row')).toHaveLength(68);
    fireEvent.click(screen.getByRole('button', { name: 'Show first 10 transitions' }));
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  it('denies institution personas', () => {
    render(<PolicyTwinWorkspace allowed={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Policy Lab is restricted');
  });
});

it('has independently calculated source-aligned showcase totals and reproduces all changed records', () => {
  // 60 ordinary (including 3 NRI) + 3 TFW + 2 PM = 65.
  // Candidate: 63 ordinary + 4 NRI + 4 TFW + 2 PM = 73; two unverified stay in review.
  const result = runPolicyTwin({ ordinaryIntake: 80, nriLimit: 4, tfwCapacity: 4 });
  expect(result.baseline).toEqual({ accepted: 65, rejected: 17, manualReview: 2 });
  expect(result.proposed).toEqual({ accepted: 73, rejected: 9, manualReview: 2 });
  expect(result.transitions).toHaveLength(8);
  render(<PolicyTwinWorkspace allowed />);
  for (const transition of result.transitions)
    expect(screen.getByText(transition.studentKey)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Proposal status' }), {
    target: { value: 'HYPOTHETICAL_AMENDMENT' },
  });
  expect(screen.getByText(/NOT AUTHORIZED:/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Example scenario' }));
  expect(screen.getByRole('combobox', { name: 'Proposal status' })).toHaveValue(
    'CURRENT_RULE_CONFIGURATION',
  );
});
