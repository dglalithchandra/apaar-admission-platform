import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByText('Access created').nextElementSibling).toHaveTextContent('+9');
    expect(screen.getByText(/deterministic “what-if” replay/i)).toBeInTheDocument();

    const intake = screen.getByRole('slider', { name: /approved intake/i });
    fireEvent.change(intake, { target: { value: '60' } });
    expect(screen.getByText('Access created').nextElementSibling).toHaveTextContent('+3');
  });

  it('denies institution personas', () => {
    render(<PolicyTwinWorkspace allowed={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Policy Lab is restricted');
  });
});
