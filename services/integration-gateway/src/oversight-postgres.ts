import type { Pool } from 'pg';
import type { Principal } from './model.js';
import { GatewayProblem } from './model.js';
import { authorize } from './auth.js';

export interface OversightCapacityRow {
  readonly allocationReference: string;
  readonly institutionReference: string;
  readonly academicYear: string;
  readonly approvalReference: string;
  readonly courseReference: string;
  readonly bucket: string;
  readonly approvedCapacity: number;
  readonly counterUsed: number;
  readonly ledgerUsed: number;
  readonly drift: number;
  readonly acceptedRecords: number;
  readonly pendingReviewRecords: number;
}

export class PostgresOversightRepository {
  public constructor(private readonly pool: Pool) {}
  public async read(
    principal: Principal,
    academicYear: string,
    offset = 0,
  ): Promise<{
    rows: readonly OversightCapacityRow[];
    nextOffset: number | null;
    institutionCapacities: readonly {
      institutionReference: string;
      bucket: string;
      approvedCapacity: number;
      counterUsed: number;
      ledgerUsed: number;
      drift: number;
    }[];
    summary: {
      activeAdmissionRecords: number;
      reviewOutcomes: number;
      unlinkedReviewOutcomes: number;
      retryableRows: number;
    };
  }> {
    authorize(principal, 'OVERSIGHT_READ');
    if (
      principal.roles.some(
        (role) => role === 'INSTITUTION_OPERATOR' || role === 'INSTITUTION_ADMINISTRATOR',
      ) &&
      principal.institutionId === null
    )
      throw new GatewayProblem('TENANT_SCOPE_REQUIRED', 403, 'An institution scope is required.');
    if (
      !/^20\d{2}-\d{2}$/.test(academicYear) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    ) {
      throw new GatewayProblem(
        'OVERSIGHT_FILTER_INVALID',
        422,
        'Choose a valid academic year and page.',
      );
    }
    const result = await this.pool.query<OversightCapacityRow>(
      `
      SELECT c.id AS "allocationReference", a.institution_id AS "institutionReference",
        a.academic_year_code AS "academicYear", a.id AS "approvalReference", a.course_id AS "courseReference",
        c.allocation_code AS bucket, c.capacity_quantity AS "approvedCapacity", c.used_quantity AS "counterUsed",
        COALESCE(r.units,0)::integer AS "ledgerUsed", (c.used_quantity-COALESCE(r.units,0))::integer AS drift,
        (SELECT count(*)::integer FROM admissions m WHERE m.approval_snapshot_id=a.id AND m.lifecycle_status='ACCEPTED'
          AND NOT EXISTS(SELECT 1 FROM admission_versions v WHERE v.admission_id=m.id AND v.is_current AND v.lifecycle_status<>'ACTIVE')) AS "acceptedRecords",
        (SELECT count(*)::integer FROM admissions m WHERE m.approval_snapshot_id=a.id AND m.lifecycle_status='UNDER_REVIEW') AS "pendingReviewRecords"
      FROM capacity_allocations c JOIN approval_snapshots a ON a.id=c.approval_snapshot_id
      LEFT JOIN LATERAL (SELECT SUM(r.units-COALESCE(x.units,0)) AS units FROM capacity_reservations r
        LEFT JOIN capacity_releases x ON x.reservation_id=r.id WHERE r.capacity_allocation_id=c.id) r ON true
      WHERE a.academic_year_code=$1 AND ($2::text IS NULL OR a.institution_id=$2)
      ORDER BY a.institution_id,a.course_id,a.id,c.id LIMIT 101 OFFSET $3`,
      [academicYear, principal.institutionId, offset],
    );
    const institutional = await this.pool.query<{
      institutionReference: string;
      bucket: string;
      approvedCapacity: number;
      counterUsed: number;
      ledgerUsed: number;
      drift: number;
    }>(
      `
      SELECT c.institution_id AS "institutionReference",c.allocation_code AS bucket,c.capacity_quantity AS "approvedCapacity",c.used_quantity AS "counterUsed",
        COALESCE(r.units,0)::integer AS "ledgerUsed",(c.used_quantity-COALESCE(r.units,0))::integer AS drift
      FROM institution_capacity_allocations c
      LEFT JOIN LATERAL(SELECT SUM(r.units-COALESCE(x.units,0)) AS units FROM capacity_reservations r
        LEFT JOIN capacity_releases x ON x.reservation_id=r.id WHERE r.institution_capacity_allocation_id=c.id) r ON true
      WHERE c.academic_year_code=$1 AND ($2::text IS NULL OR c.institution_id=$2)
      ORDER BY c.institution_id,c.id LIMIT 101 OFFSET $3`,
      [academicYear, principal.institutionId, offset],
    );
    const totals = await this.pool.query<{
      activeAdmissionRecords: number;
      reviewOutcomes: number;
      unlinkedReviewOutcomes: number;
      retryableRows: number;
    }>(
      `
      SELECT
        COUNT(*) FILTER(WHERE a.lifecycle_status='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM admission_versions v WHERE v.admission_id=a.id AND v.is_current AND v.lifecycle_status<>'ACTIVE'))::integer AS "activeAdmissionRecords",
        COUNT(*) FILTER(WHERE a.lifecycle_status='UNDER_REVIEW')::integer AS "reviewOutcomes",
        COUNT(*) FILTER(WHERE a.lifecycle_status='UNDER_REVIEW' AND a.approval_snapshot_id IS NULL)::integer AS "unlinkedReviewOutcomes",
        (SELECT COUNT(*)::integer FROM batch_rows r JOIN admission_batches b ON b.id=r.batch_id WHERE r.payload->>'academicYear'=$1 AND ($2::text IS NULL OR b.institution_id=$2) AND r.status='FAILED_RETRYABLE') AS "retryableRows"
      FROM admissions a WHERE a.academic_year_code=$1 AND ($2::text IS NULL OR a.institution_id=$2)`,
      [academicYear, principal.institutionId],
    );
    return {
      rows: result.rows.slice(0, 100),
      institutionCapacities: institutional.rows.slice(0, 100),
      summary: totals.rows[0] ?? {
        activeAdmissionRecords: 0,
        reviewOutcomes: 0,
        unlinkedReviewOutcomes: 0,
        retryableRows: 0,
      },
      nextOffset: result.rows.length > 100 || institutional.rows.length > 100 ? offset + 100 : null,
    };
  }
}

export function oversightCsv(rows: readonly OversightCapacityRow[]): string {
  const columns = [
    'allocationReference',
    'institutionReference',
    'academicYear',
    'approvalReference',
    'courseReference',
    'bucket',
    'approvedCapacity',
    'counterUsed',
    'ledgerUsed',
    'drift',
    'acceptedRecords',
    'pendingReviewRecords',
  ] as const;
  const cell = (value: string | number): string => {
    const text = String(value);
    const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    [
      columns.map(cell).join(','),
      ...rows.map((row) => columns.map((key) => cell(row[key])).join(',')),
    ].join('\r\n') + '\r\n'
  );
}
