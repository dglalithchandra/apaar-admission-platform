import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PilotWorkspace } from './PilotWorkspace.js';

describe('pilot workspace', () => {
  it('shows institution readiness and every honest rollout state', async () => {
    const user = userEvent.setup();
    render(<PilotWorkspace mode="INSTITUTION" />);
    expect(screen.getByRole('heading', { name: 'Institution onboarding' })).toBeVisible();
    for (const state of [
      'blocked',
      'degraded',
      'paused',
      'active',
      'failed',
      'completed',
      'empty',
      'loading',
    ]) {
      await user.click(screen.getByRole('button', { name: `Preview ${state}` }));
      expect(screen.getByText(state, { selector: '.status' })).toBeVisible();
    }
  });

  it('shows AICTE management and denies unrelated personas', () => {
    const { rerender } = render(<PilotWorkspace mode="AICTE" />);
    expect(screen.getByRole('heading', { name: 'Pilot cohort management' })).toBeVisible();
    rerender(<PilotWorkspace mode="UNAVAILABLE" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Pilot access is not available');
  });
});
