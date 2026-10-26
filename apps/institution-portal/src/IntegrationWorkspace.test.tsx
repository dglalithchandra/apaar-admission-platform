import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DemoIntegrationClient } from './demo-integration-client.js';
import { IntegrationWorkspace } from './IntegrationWorkspace.js';

describe('IntegrationWorkspace', () => {
  it('shows honest readiness and disabled external dependencies', async () => {
    render(<IntegrationWorkspace client={new DemoIntegrationClient()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check readiness' }));
    expect(await screen.findByRole('region', { name: 'Dependency readiness' })).toHaveTextContent(
      'databaseUPapaarDISABLEDnotificationsDISABLED',
    );
  });

  it('classifies provider outage without calling the identity invalid', async () => {
    render(<IntegrationWorkspace client={new DemoIntegrationClient()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Preview provider outage' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'temporarily unavailable, never an invalid identity',
    );
  });

  it.each([
    ['Preview unauthenticated', 'unauthenticated', 'Sign in'],
    ['Preview forbidden', 'forbidden', 'cannot perform'],
  ])('renders the %s access state', async (button, code, message) => {
    render(<IntegrationWorkspace client={new DemoIntegrationClient()} />);
    await userEvent.click(screen.getByRole('button', { name: button }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(code);
    expect(alert).toHaveTextContent(message);
  });

  it('shows a minimal expiring synthetic receipt', async () => {
    render(<IntegrationWorkspace client={new DemoIntegrationClient()} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Issue synthetic verification receipt' }),
    );
    const receipt = await screen.findByRole('region', { name: 'SYNTH-VERIFICATION-PORTAL-001' });
    expect(receipt).toHaveTextContent('ADMISSION_EXISTS, CURRENT_STATUS');
    expect(receipt).toHaveTextContent('SYNTHETIC-SHA256-NOT-FOR-PRODUCTION');
  });
});
