import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { CaseworkWorkspace } from './CaseworkWorkspace.js';
import type { CaseworkClient, PortalCase } from './casework-types.js';
import { DemoCaseworkClient } from './demo-casework-client.js';

describe('casework portal journeys', () => {
  it('navigates from batch upload to the role-specific casework workspace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Casework' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Requests and responses');
    await user.selectOptions(screen.getByLabelText('Preview role'), 'AICTE_REVIEWER');
    expect(
      await screen.findByRole('heading', { name: 'Assess submitted cases' }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Preview role'), 'AICTE_CHECKER');
    expect(
      await screen.findByRole('heading', { name: 'Decisions and implementation' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Batch upload' }));
    expect(screen.getByRole('alert')).toHaveTextContent('institution accounts only');
    await user.selectOptions(screen.getByLabelText('Preview role'), 'INSTITUTION_OPERATOR');
    expect(
      screen.getByRole('heading', { name: 'Upload student admission data' }),
    ).toBeInTheDocument();
  });

  it('lets an institution create a draft and submit it separately', async () => {
    const user = userEvent.setup();
    render(<CaseworkWorkspace client={new DemoCaseworkClient()} role="INSTITUTION_OPERATOR" />);
    await screen.findByRole('button', { name: /SYNTH-CASE-REF-0101/i });
    await user.click(screen.getByRole('button', { name: 'Create request' }));
    await user.type(screen.getByLabelText('Admission reference'), 'SYNTH-REGISTRATION-NEW-001');
    await user.selectOptions(screen.getByLabelText('Request type'), 'ADMISSION_CANCELLATION');
    await user.type(
      screen.getByLabelText('Reason for the request'),
      'Synthetic withdrawal request.',
    );
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(screen.getByRole('status')).toHaveTextContent('has not been submitted');
    expect(screen.getAllByText('SYNTH-REGISTRATION-NEW-001')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(screen.getByRole('status')).toHaveTextContent('submitted for review');
    expect(
      within(screen.getByRole('button', { name: /SYNTH-CASE-REF-9001/i })).getByText('submitted'),
    ).toBeInTheDocument();
  });

  it('lets an institution answer a bounded information request', async () => {
    const user = userEvent.setup();
    render(<CaseworkWorkspace client={new DemoCaseworkClient()} role="INSTITUTION_OPERATOR" />);
    await user.click(await screen.findByRole('button', { name: /SYNTH-CASE-REF-0102/i }));
    await user.type(screen.getByLabelText('Information response'), 'SYNTH-EVIDENCE-RESPONSE-001');
    await user.click(screen.getByRole('button', { name: 'Supply information' }));
    expect(screen.getByRole('status')).toHaveTextContent('returned to the review queue');
  });

  it('requires reviewer conflict clearance before recommendation', async () => {
    const user = userEvent.setup();
    render(<CaseworkWorkspace client={new DemoCaseworkClient()} role="AICTE_REVIEWER" />);
    await user.click(await screen.findByRole('button', { name: /SYNTH-CASE-REF-0201/i }));
    await user.click(await screen.findByRole('button', { name: 'Start review' }));
    expect(screen.getByText(/conflict declaration is now required/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Declare no conflict' }));
    await user.type(
      screen.getByLabelText('Reasoned explanation'),
      'Synthetic evidence is complete.',
    );
    await user.click(screen.getByRole('button', { name: 'Recommend approval' }));
    expect(screen.getByRole('status')).toHaveTextContent('independent checker');
    expect(
      within(screen.getByRole('button', { name: /SYNTH-CASE-REF-0201/i })).getByText('recommended'),
    ).toBeInTheDocument();
  });

  it('stops a conflicted reviewer from making a recommendation', async () => {
    const user = userEvent.setup();
    render(<CaseworkWorkspace client={new DemoCaseworkClient()} role="AICTE_REVIEWER" />);
    await user.click(await screen.findByRole('button', { name: /SYNTH-CASE-REF-0201/i }));
    await user.click(await screen.findByRole('button', { name: 'Start review' }));
    await user.click(screen.getByRole('button', { name: 'Declare conflict' }));
    expect(screen.getByText(/This reviewer cannot continue/i)).toHaveTextContent(
      'must reassign the case',
    );
    expect(screen.queryByRole('button', { name: 'Recommend approval' })).not.toBeInTheDocument();
  });

  it('separates checker decision from confirmed implementation and shows a receipt', async () => {
    const user = userEvent.setup();
    render(<CaseworkWorkspace client={new DemoCaseworkClient()} role="AICTE_CHECKER" />);
    await screen.findByRole('button', { name: /SYNTH-CASE-REF-0301/i });
    await user.type(screen.getByLabelText('Reasoned explanation'), 'Synthetic checker approval.');
    await user.click(screen.getByRole('button', { name: 'Approve case' }));
    expect(screen.getByRole('status')).toHaveTextContent('separate action');
    await user.click(screen.getByRole('button', { name: 'Review implementation' }));
    const confirmation = screen.getByRole('alert');
    expect(confirmation).toHaveTextContent('original admission decision remains unchanged');
    await user.click(
      within(confirmation).getByRole('button', { name: 'Keep approved without implementing' }),
    );
    expect(screen.queryByText('Confirm the governed implementation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review implementation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm implementation' }));
    expect(await screen.findByText(/SYNTH-IMPLEMENTATION-RECEIPT/)).toBeInTheDocument();
    expect(screen.getByText('SYNTH-REGISTRATION-TARGET-9001')).toBeInTheDocument();
  });

  it('supports queue search, filtering, empty state and a safe loading failure', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CaseworkWorkspace client={new DemoCaseworkClient()} role="INSTITUTION_OPERATOR" />,
    );
    await screen.findByRole('button', { name: /SYNTH-CASE-REF-0101/i });
    await user.type(screen.getByLabelText('Search references'), 'does-not-exist');
    expect(screen.getByRole('status')).toHaveTextContent('No cases match');
    await user.clear(screen.getByLabelText('Search references'));
    await user.selectOptions(screen.getByLabelText('State'), 'IMPLEMENTED');
    expect(screen.getByRole('status')).toHaveTextContent('No cases match');
    unmount();

    const failing = {
      listCases: vi.fn(async (): Promise<readonly PortalCase[]> =>
        Promise.reject(new Error('offline')),
      ),
    } as unknown as CaseworkClient;
    render(<CaseworkWorkspace client={failing} role="AICTE_CHECKER" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No case data was changed');
  });
});
