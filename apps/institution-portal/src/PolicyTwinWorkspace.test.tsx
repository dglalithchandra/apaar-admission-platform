import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PolicyTwinWorkspace } from './PolicyTwinWorkspace.js';

describe('PolicyTwinWorkspace', () => {
  it('shows a safe explainable comparison and recalculates a scenario', () => {
    render(<PolicyTwinWorkspace allowed />);

    expect(screen.getByRole('heading', { name: /human impact/i })).toBeInTheDocument();
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
