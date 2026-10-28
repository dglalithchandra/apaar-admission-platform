import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { PortalBatch, PortalClient, PortalRow } from './types.js';

const batch: PortalBatch = {
  batchId: 'SYNTH-BATCH-0001',
  receiptReference: 'SYNTH-RECEIPT-0001',
  receivedAt: '2026-08-01T09:00:00.000Z',
  sha256: 'a'.repeat(64),
  status: 'NEEDS_ACTION',
  totals: {
    accepted: 1,
    failed: 0,
    invalid: 0,
    manualReview: 0,
    pending: 0,
    rejected: 0,
    retryable: 1,
    total: 2,
  },
};

const accepted: PortalRow = {
  admissionReference: 'SYNTH-REGISTRATION-0001',
  findings: [],
  recordKey: 'SYNTH-RECORD-0001',
  rowNumber: 2,
  status: 'ACCEPTED',
};

const retryable: PortalRow = {
  admissionReference: null,
  findings: [
    {
      code: 'IDENTITY_PROVIDER_RETRYABLE',
      field: null,
      message: 'The synthetic provider is temporarily unavailable.',
    },
  ],
  recordKey: 'SYNTH-RECORD-0002',
  rowNumber: 3,
  status: 'FAILED_RETRYABLE',
};

function client(overrides: Partial<PortalClient> = {}): PortalClient {
  return {
    correctionCsv: vi.fn(async () => 'record_key,error_codes\n'),
    createBatch: vi.fn(async () => batch),
    listRows: vi.fn(async () => [accepted, retryable]),
    retryRow: vi.fn(async (): Promise<PortalRow> => ({ ...retryable, status: 'MANUAL_REVIEW' })),
    templateCsv: vi.fn(async () => 'template_version,record_key\n'),
    ...overrides,
  };
}

async function uploadCsv(api: PortalClient): Promise<void> {
  const user = userEvent.setup();
  render(<App client={api} />);
  await user.upload(
    screen.getByLabelText('Choose a CSV file'),
    new File(['template_version,record_key\n'], 'synthetic.csv', { type: 'text/csv' }),
  );
  await user.click(screen.getByRole('button', { name: 'Upload and validate' }));
  await screen.findByText('SYNTH-RECEIPT-0001');
}

describe('institution batch workspace', () => {
  it('exposes the policy digital twin only to regulator personas', async () => {
    const user = userEvent.setup();
    render(<App client={client()} />);
    await user.click(screen.getByRole('button', { name: /Policy Lab/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Policy Lab is restricted');
    await user.selectOptions(screen.getByLabelText('Preview role'), 'AICTE_REVIEWER');
    expect(
      screen.getByRole('heading', { name: /compare admission outcomes/i }),
    ).toBeInTheDocument();
  });

  it('starts with an accessible empty upload workflow', () => {
    render(<App client={client()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Upload student admission data',
    );
    expect(screen.getByLabelText('Choose a CSV file')).toHaveAttribute('accept');
    expect(screen.getByText('No batch selected')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Institution navigation' })).toBeInTheDocument();
  });

  it('reports an invalid selection in a linked alert', async () => {
    render(<App client={client()} />);
    fireEvent.change(screen.getByLabelText('Choose a CSV file'), {
      target: { files: [new File(['{}'], 'synthetic.json', { type: 'application/json' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a file ending in .csv');
    expect(screen.queryByText('synthetic.json')).not.toBeInTheDocument();
  });

  it.each([
    [new File([], 'empty.csv', { type: 'text/csv' }), 'empty'],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.csv', { type: 'text/csv' }), '5 MB'],
    [new File(['x'], 'synthetic.csv', { type: 'application/json' }), 'not recognised'],
  ])('rejects unsafe file selections before upload', (file, explanation) => {
    render(<App client={client()} />);
    fireEvent.change(screen.getByLabelText('Choose a CSV file'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent(explanation);
  });

  it('requires a selected file and lets the operator remove a valid selection', async () => {
    const user = userEvent.setup();
    render(<App client={client()} />);
    await user.click(screen.getByRole('button', { name: 'Upload and validate' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Select a valid version 1.0 CSV');
    await user.upload(
      screen.getByLabelText('Choose a CSV file'),
      new File(['x'], 'synthetic.csv', { type: 'text/csv' }),
    );
    expect(screen.getByText('synthetic.csv')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('synthetic.csv')).not.toBeInTheDocument();
  });

  it('shows the receipt, reconciled totals and row-level explanations', async () => {
    await uploadCsv(client());
    expect(screen.getByRole('heading', { name: '2 uploaded rows' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Admission batch row results' });
    expect(within(table).getByText('SYNTH-RECORD-0001')).toBeInTheDocument();
    expect(within(table).getByText('IDENTITY_PROVIDER_RETRYABLE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry row' })).toBeInTheDocument();
  });

  it('filters results and retries only a retryable row', async () => {
    const api = client();
    await uploadCsv(api);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Result'), 'FAILED_RETRYABLE');
    expect(screen.queryByText('SYNTH-RECORD-0001')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry row' }));
    await waitFor(() => expect(api.retryRow).toHaveBeenCalledOnce());
    await user.selectOptions(screen.getByLabelText('Result'), 'ALL');
    expect(screen.getByRole('table').querySelector('.status--manual_review')).toHaveTextContent(
      'manual review',
    );
  });

  it('searches by stable record key and shows a no-results state', async () => {
    await uploadCsv(client());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search record key'), 'does-not-exist');
    expect(screen.getByRole('status')).toHaveTextContent('No rows match');
  });

  it('downloads the product-owned template and correction CSV', async () => {
    const api = client();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<App client={api} />);
    await user.click(screen.getByRole('button', { name: 'Download template v1.0' }));
    expect(api.templateCsv).toHaveBeenCalledOnce();

    await user.upload(
      screen.getByLabelText('Choose a CSV file'),
      new File(['x'], 'synthetic.csv', { type: 'text/csv' }),
    );
    await user.click(screen.getByRole('button', { name: 'Upload and validate' }));
    await screen.findByText('SYNTH-RECEIPT-0001');
    await user.click(screen.getByRole('button', { name: 'Download correction CSV' }));
    expect(api.correctionCsv).toHaveBeenCalledWith('SYNTH-BATCH-0001');
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('supports drag and drop and reports transport failure without claiming acceptance', async () => {
    const api = client({ createBatch: vi.fn(async () => Promise.reject(new Error('offline'))) });
    render(<App client={api} />);
    const input = screen.getByLabelText('Choose a CSV file');
    const dropzone = input.parentElement;
    expect(dropzone).not.toBeNull();
    fireEvent.drop(dropzone!, {
      dataTransfer: {
        files: [new File(['x'], 'synthetic.csv', { type: 'text/csv' })],
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Upload and validate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('has not been accepted');
  });
});
