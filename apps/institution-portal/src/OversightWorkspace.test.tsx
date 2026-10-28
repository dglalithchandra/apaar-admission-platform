import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OversightWorkspace } from './OversightWorkspace.js';
import type { OversightClient, OversightRow } from './oversight-client.js';
const row: OversightRow = {
  allocationReference: 'SYNTH-ALLOCATION',
  institutionReference: 'SYNTH-INSTITUTION',
  academicYear: '2026-27',
  approvalReference: 'SYNTH-APPROVAL',
  courseReference: 'SYNTH-COURSE',
  bucket: 'ORDINARY',
  approvedCapacity: 60,
  counterUsed: 1,
  ledgerUsed: 1,
  drift: 0,
  acceptedRecords: 1,
  pendingReviewRecords: 0,
};
describe('capacity oversight', () => {
  it('shows institution-wide reconciliation and unlinked review outcomes', async () => {
    const client: OversightClient = {
      load: () =>
        Promise.resolve({
          rows: [row],
          nextOffset: null,
          institutionCapacities: [{ ...row, drift: 2 }],
          summary: {
            activeAdmissionRecords: 1,
            reviewOutcomes: 2,
            unlinkedReviewOutcomes: 1,
            retryableRows: 0,
          },
        }),
      exportPage: () => Promise.resolve(),
    };
    render(<OversightWorkspace role="AICTE_CHECKER" client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load report' }));
    expect(
      await screen.findByText('Institution-wide capacity buckets on this page'),
    ).toBeInTheDocument();
    expect(screen.getByText('Review outcomes without approval')).toBeInTheDocument();
    expect(screen.getByText('Review: 2')).toBeInTheDocument();
  });

  it('shows unavailable and restricted states without fetching', () => {
    const view = render(<OversightWorkspace role="AUTHORIZED_VERIFIER" />);
    expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
    view.rerender(<OversightWorkspace role="INSTITUTION_OPERATOR" />);
    expect(screen.getByRole('status')).toHaveTextContent('Connect the local gateway');
    expect(screen.getByRole('button', { name: 'Load report' })).toBeDisabled();
  });
  it('loads reconciled and discrepant rows, paginates and exports the current page', async () => {
    const load = vi
      .fn<OversightClient['load']>()
      .mockResolvedValueOnce({
        rows: [row, { ...row, allocationReference: 'SYNTH-DRIFT', drift: 1 }],
        nextOffset: 100,
      })
      .mockResolvedValueOnce({ rows: [], nextOffset: null })
      .mockResolvedValue({ rows: [row], nextOffset: null });
    const exportPage = vi.fn<OversightClient['exportPage']>().mockResolvedValue();
    render(<OversightWorkspace role="AICTE_REVIEWER" client={{ load, exportPage }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load report' }));
    expect(await screen.findByText('Review: 1')).toBeInTheDocument();
    expect(screen.getByText('Reconciled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export current page' }));
    await waitFor(() => expect(exportPage).toHaveBeenCalledWith('AICTE_REVIEWER', '2026-27', 0));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText(/No approval-linked capacity/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Reconciled')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Academic year'), { target: { value: '2027-28' } });
    expect(screen.getByRole('button', { name: 'Export current page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Load report' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith('AICTE_REVIEWER', '2027-28', 0));
  });
  it('reports loading and export failures', async () => {
    const load = vi
      .fn<OversightClient['load']>()
      .mockRejectedValueOnce(new Error('SYNTH-OUTAGE'))
      .mockResolvedValue({ rows: [row], nextOffset: null });
    const exportPage = vi
      .fn<OversightClient['exportPage']>()
      .mockRejectedValue(new Error('SYNTH-EXPORT-OUTAGE'));
    render(<OversightWorkspace role="AUDITOR" client={{ load, exportPage }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Load report' }));
    expect(await screen.findByText('Reconciled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export current page' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('could not be exported'),
    );
  });
});
