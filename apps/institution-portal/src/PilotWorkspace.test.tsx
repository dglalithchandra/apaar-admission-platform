import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PilotWorkspace } from './PilotWorkspace.js';

describe('pilot workspace', () => {
  it('shows institution readiness and every honest rollout state', async () => {
    const user = userEvent.setup();
    render(<PilotWorkspace mode="INSTITUTION" />);
    expect(screen.getByRole('heading', { name: 'Institution pilot operations' })).toBeVisible();
    for (const state of [
      'manual review',
      'blocked',
      'approved',
      'running',
      'degraded',
      'paused',
      'incident',
      'recovering',
      'failed',
      'terminated',
      'completed',
      'empty',
      'loading',
    ]) {
      await user.click(screen.getByRole('button', { name: `Preview ${state}` }));
      expect(
        within(document.getElementById('pilot-state-heading')!.closest('section')!).getByText(
          state,
          {
            selector: '.status',
          },
        ),
      ).toBeVisible();
    }
  });

  it('shows AICTE management and denies unrelated personas', () => {
    const { rerender } = render(<PilotWorkspace mode="AICTE" />);
    expect(screen.getByRole('heading', { name: 'Pilot execution control plane' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Four synthetic institutions' })).toBeVisible();
    expect(screen.getByText('not a rollout decision')).toBeVisible();
    rerender(<PilotWorkspace mode="UNAVAILABLE" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Pilot access is not available');
  });
});
