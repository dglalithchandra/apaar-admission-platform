import type { PortalBatch, PortalClient, PortalRow } from './types.js';

const rows: PortalRow[] = [
  {
    admissionReference: 'SYNTH-REGISTRATION-0001',
    findings: [],
    recordKey: 'SYNTH-RECORD-0001',
    rowNumber: 2,
    status: 'ACCEPTED',
  },
  {
    admissionReference: null,
    findings: [
      {
        code: 'CATEGORY_STATUS_MISMATCH',
        field: 'nri',
        message: 'The NRI category does not match the declared student status.',
      },
    ],
    recordKey: 'SYNTH-RECORD-0002',
    rowNumber: 3,
    status: 'REJECTED',
  },
  {
    admissionReference: null,
    findings: [
      {
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
        field: null,
        message: 'Identity verification is temporarily unavailable after three attempts.',
      },
    ],
    recordKey: 'SYNTH-RECORD-0003',
    rowNumber: 4,
    status: 'MANUAL_REVIEW',
  },
];

const batch: PortalBatch = {
  batchId: 'SYNTH-BATCH-DEMO-0001',
  receivedAt: '2026-08-01T09:00:00.000Z',
  receiptReference: 'SYNTH-RECEIPT-DEMO-0001',
  sha256: '2e71e2a937d183a6068e5e7bf133da69fa28fba3b648853de44c435a6f0c9a14',
  status: 'NEEDS_ACTION',
  totals: {
    accepted: 1,
    failed: 0,
    invalid: 0,
    manualReview: 1,
    pending: 0,
    rejected: 1,
    retryable: 0,
    total: 3,
  },
};

export class DemoPortalClient implements PortalClient {
  public correctionCsv(_batchId: string): Promise<string> {
    return Promise.resolve(
      'record_key,error_codes,error_messages\nSYNTH-RECORD-0002,CATEGORY_STATUS_MISMATCH,Correct the NRI declaration\n',
    );
  }

  public createBatch(_file: File): Promise<PortalBatch> {
    return Promise.resolve(batch);
  }

  public listRows(_batchId: string): Promise<readonly PortalRow[]> {
    return Promise.resolve(rows);
  }

  public retryRow(_batchId: string, recordKey: string): Promise<PortalRow> {
    const row = rows.find((candidate) => candidate.recordKey === recordKey);
    return row === undefined
      ? Promise.reject(new Error('Synthetic row not found.'))
      : Promise.resolve(row);
  }

  public templateCsv(): Promise<string> {
    return Promise.resolve(
      'template_version,record_key,student_reference,academic_identity_reference,institution_id,campus_id,programme_id,course_id,academic_year,admission_date,category,lateral_capacity_source,nri,oci,foreign_national,gulf_worker_child,eligibility_evidence\n',
    );
  }
}
