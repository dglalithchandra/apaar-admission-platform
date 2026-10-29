import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdmissionsWorkspace } from './AdmissionsWorkspace.js';
import { DemoPortalClient } from './demo-client.js';
import type { PortalClient } from './types.js';
const record = {
  id: 'SYNTH-ADMISSION-001',
  registration_reference: 'SYNTH-REGISTRATION-001',
  student_key: 'SYNTH-STUDENT-001',
  category: 'ORDINARY',
  academic_year_code: '2026-27',
  current_status: 'ACCEPTED',
};
function client(): PortalClient {
  return Object.assign(new DemoPortalClient(), {
    listAdmissions: vi.fn(async () => ({ items: [record], nextCursor: 'SYNTH-CURSOR' })),
    admissionEvidence: vi.fn(async () => ({
      registration_reference: record.registration_reference,
      evidence: {
        approval: {
          id: 'SYNTH-APPROVAL',
          source: 'SYNTHETIC',
          sourceRecord: 'SYNTH-SOURCE',
          ordinaryIntake: 60,
        },
        decisions: [
          {
            outcome: 'ACCEPT',
            ruleset_version: 'SYNTH-RULES',
            findings: [{ code: 'IDENTITY_VERIFIED', message: 'Synthetic check', field: null }],
          },
        ],
        history: [{ version: 1, status: 'ACTIVE', caseId: null }],
      },
    })),
  });
}
describe('admissions browsing', () => {
  it('finds stored evidence, searches, pages and preselects a governed request', async () => {
    const api = client();
    const request = vi.fn();
    render(<AdmissionsWorkspace client={api} allowed canRequest onRequest={request} />);
    await screen.findByText('SYNTH-STUDENT-001');
    fireEvent.change(screen.getByLabelText('Search reference or student key'), {
      target: { value: 'SYNTH-SEARCH' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search admissions' }));
    await waitFor(() => expect(api.listAdmissions).toHaveBeenLastCalledWith('SYNTH-SEARCH', ''));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.listAdmissions).toHaveBeenLastCalledWith('SYNTH-SEARCH', 'SYNTH-CURSOR'),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'View decision' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'View decision' }));
    expect(await screen.findByText('IDENTITY_VERIFIED')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create governed request' }));
    expect(request).toHaveBeenCalledWith(record.registration_reference);
    fireEvent.click(screen.getByRole('button', { name: 'First page' }));
    await waitFor(() => expect(api.listAdmissions).toHaveBeenLastCalledWith('SYNTH-SEARCH', ''));
  });
  it('denies verifier access without reading records', () => {
    const api = client();
    render(
      <AdmissionsWorkspace client={api} allowed={false} canRequest={false} onRequest={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Verifiers receive only scoped');
    expect(api.listAdmissions).not.toHaveBeenCalled();
  });
  it('shows failed and empty searches without inventing records', async () => {
    const api = client();
    api.listAdmissions = vi
      .fn()
      .mockRejectedValueOnce(new Error('SYNTH-DATABASE-UNAVAILABLE'))
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<AdmissionsWorkspace client={api} allowed canRequest={false} onRequest={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('SYNTH-DATABASE-UNAVAILABLE');
    fireEvent.click(screen.getByRole('button', { name: 'Search admissions' }));
    expect(await screen.findByText(/No matching admissions/)).toBeInTheDocument();
  });
  it('does not retain a previous record when evidence fails', async () => {
    const api = client();
    api.admissionEvidence = vi.fn().mockRejectedValue(new Error('SYNTH-NOT-FOUND'));
    render(<AdmissionsWorkspace client={api} allowed canRequest={false} onRequest={vi.fn()} />);
    await screen.findByText('SYNTH-STUDENT-001');
    fireEvent.click(screen.getByRole('button', { name: 'View decision' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SYNTH-NOT-FOUND');
  });
});
