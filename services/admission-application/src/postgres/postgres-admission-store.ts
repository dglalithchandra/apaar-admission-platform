import { ADMISSION_VALIDATION_PROFILE_VERSION } from '../model.js';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  ApprovalSnapshot,
  ApprovalSnapshotQuery,
  CapacityUsage,
  StudentAdmission,
} from '@apaar-platform/admission-domain';
import {
  asAcademicYear,
  asApprovalSnapshotId,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asIsoDateTime,
  asProgrammeId,
} from '@apaar-platform/admission-domain';
import type { Pool, PoolClient } from 'pg';
import { IdempotencyConflictError, PersistenceInvariantError } from '../errors.js';
import type {
  AdmissionSubmissionResult,
  ApprovalImportCommand,
  PersistAdmissionOutcome,
} from '../model.js';
import type {
  AdmissionTransaction,
  AdmissionUnitOfWork,
  ApprovalSnapshotWriter,
  IdempotentTransactionOptions,
} from '../ports.js';

type AllocationCode =
  | 'ORDINARY'
  | 'NRI_WITHIN_ORDINARY'
  | 'FN_OCI_SUBGROUP'
  | 'GULF_SUBGROUP'
  | 'FN_OCI_GULF_COMBINED'
  | 'LATERAL_SUPERNUMERARY'
  | 'LATERAL_FIRST_YEAR_VACANCY'
  | 'TFW'
  | 'PM_USPY_COURSE'
  | 'FOREIGN_NATIONAL_ACROSS_ROUTES';

interface ApprovalRow {
  readonly id: string;
  readonly import_batch_id: string;
  readonly source_system: string;
  readonly source_record_id: string;
  readonly source_hash: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly received_at: Date;
  readonly approved_by: string;
  readonly policy_version: string;
  readonly academic_year_code: string;
  readonly institution_id: string;
  readonly institution_name: string;
  readonly campus_id: string;
  readonly campus_name: string;
  readonly programme_id: string;
  readonly programme_name: string;
  readonly programme_level: ApprovalSnapshot['programme']['level'];
  readonly course_id: string;
  readonly course_name: string;
  readonly course_mode: ApprovalSnapshot['course']['mode'];
  readonly ordinary_intake: number;
  readonly nri_approved: boolean;
  readonly nri_maximum_within_ordinary: number;
  readonly fn_oci_gulf_approved: boolean;
  readonly fn_oci_capacity: number;
  readonly gulf_capacity: number;
  readonly fn_oci_gulf_combined_capacity: number;
  readonly foreign_national_across_routes_maximum: number;
  readonly lateral_approved: boolean;
  readonly lateral_supernumerary_capacity: number;
  readonly lateral_first_year_vacancy_capacity: number;
  readonly tfw_approved: boolean;
  readonly tfw_capacity: number;
  readonly tfw_preceding_year_fill_satisfied: boolean;
  readonly pm_uspy_approved: boolean;
  readonly pm_uspy_course_capacity: number;
  readonly pm_uspy_institution_capacity: number;
  readonly superseded_by: string | null;
}

interface AllocationRow {
  readonly allocation_code: AllocationCode;
  readonly used_quantity: number;
}

const ALLOCATION_SELECT = `
  SELECT a.*, i.name AS institution_name, c.name AS campus_name,
         p.name AS programme_name, a.programme_level,
         co.name AS course_name, a.course_mode,
         supersession.replacement_snapshot_id AS superseded_by
  FROM approval_snapshots a
  JOIN institutions i ON i.id = a.institution_id
  JOIN campuses c ON c.id = a.campus_id
  JOIN programmes p ON p.id = a.programme_id
  JOIN courses co ON co.id = a.course_id
  LEFT JOIN approval_supersessions supersession ON supersession.previous_snapshot_id = a.id`;

function toIsoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function toApproval(row: ApprovalRow): ApprovalSnapshot {
  return {
    academicYear: asAcademicYear(row.academic_year_code),
    approvedBy: row.approved_by,
    campus: {
      id: asCampusId(row.campus_id),
      institutionId: asInstitutionId(row.institution_id),
      name: row.campus_name,
    },
    course: {
      campusId: asCampusId(row.campus_id),
      id: asCourseId(row.course_id),
      mode: row.course_mode,
      name: row.course_name,
      programmeId: asProgrammeId(row.programme_id),
    },
    effectiveFrom: asIsoDate(toIsoDate(row.effective_from)),
    effectiveTo: row.effective_to === null ? null : asIsoDate(toIsoDate(row.effective_to)),
    fnOciGulf: {
      approved: row.fn_oci_gulf_approved,
      combinedTotalCapacity: row.fn_oci_gulf_combined_capacity,
      foreignAndOciCapacity: row.fn_oci_capacity,
      foreignNationalAcrossRoutesMaximum: row.foreign_national_across_routes_maximum,
      gulfCapacity: row.gulf_capacity,
    },
    id: asApprovalSnapshotId(row.id),
    importBatchReference: row.import_batch_id,
    institution: { id: asInstitutionId(row.institution_id), name: row.institution_name },
    lateral: {
      approved: row.lateral_approved,
      firstYearVacancyCapacity: row.lateral_first_year_vacancy_capacity,
      supernumeraryCapacity: row.lateral_supernumerary_capacity,
    },
    nri: {
      approved: row.nri_approved,
      maximumWithinOrdinary: row.nri_maximum_within_ordinary,
    },
    ordinaryIntake: row.ordinary_intake,
    pmUspy: {
      approved: row.pm_uspy_approved,
      courseCapacity: row.pm_uspy_course_capacity,
      institutionCapacity: row.pm_uspy_institution_capacity,
    },
    policyVersion: row.policy_version,
    programme: {
      id: asProgrammeId(row.programme_id),
      level: row.programme_level,
      name: row.programme_name,
    },
    receivedAt: asIsoDateTime(row.received_at.toISOString()),
    sourceHash: row.source_hash,
    sourceRecordId: row.source_record_id,
    sourceSystem: row.source_system,
    supersededBy: row.superseded_by === null ? null : asApprovalSnapshotId(row.superseded_by),
    tfw: {
      approved: row.tfw_approved,
      capacity: row.tfw_capacity,
      precedingYearMinimumFillSatisfied: row.tfw_preceding_year_fill_satisfied,
    },
  };
}

function requiredAllocations(admission: StudentAdmission): readonly AllocationCode[] {
  switch (admission.category) {
    case 'ORDINARY':
      return ['ORDINARY'];
    case 'NRI':
      return ['NRI_WITHIN_ORDINARY', 'ORDINARY'];
    case 'FOREIGN_NATIONAL':
      return ['FN_OCI_GULF_COMBINED', 'FN_OCI_SUBGROUP', 'FOREIGN_NATIONAL_ACROSS_ROUTES'];
    case 'OCI':
      return ['FN_OCI_GULF_COMBINED', 'FN_OCI_SUBGROUP'];
    case 'GULF_WORKER_CHILD':
      return ['FN_OCI_GULF_COMBINED', 'GULF_SUBGROUP'];
    case 'LATERAL_ENTRY': {
      const source = admission.lateralCapacitySource;
      if (source === null) {
        throw new PersistenceInvariantError(
          'An accepted lateral admission must identify its source.',
        );
      }
      return admission.studentStatus.foreignNational
        ? [source, 'FOREIGN_NATIONAL_ACROSS_ROUTES']
        : [source];
    }
    case 'TFW':
      return ['TFW'];
    case 'PM_USPY':
      return ['PM_USPY_COURSE'];
    case 'OTHER_SUPERNUMERARY':
      throw new PersistenceInvariantError('An unconfigured category cannot be accepted.');
  }
}

class PostgresAdmissionTransaction implements AdmissionTransaction {
  public constructor(private readonly client: PoolClient) {}

  public async classifyStudentConflict(
    admission: StudentAdmission,
  ): Promise<'NONE' | 'EXACT' | 'POTENTIAL'> {
    // A write conflict forces SERIALIZABLE retries to acquire a fresh snapshot, including across tenants.
    await this.client.query(
      `INSERT INTO student_identity_guards(student_key, revision) VALUES ($1, 1)
       ON CONFLICT(student_key) DO UPDATE SET revision = student_identity_guards.revision + 1`,
      [admission.identityVerification.canonicalStudentKey ?? admission.studentKey],
    );
    const versions = await this.client.query<{ present: boolean }>(
      "SELECT to_regclass('public.admission_versions') IS NOT NULL AS present",
    );
    const active =
      versions.rows[0]?.present === true
        ? "a.lifecycle_status = 'ACCEPTED' AND NOT EXISTS (SELECT 1 FROM admission_versions v WHERE v.admission_id=a.id AND v.is_current=true AND v.lifecycle_status <> 'ACTIVE')"
        : "a.lifecycle_status = 'ACCEPTED'";
    const result = await this.client.query<{ exact: boolean }>(
      `SELECT a.institution_id=$3 AND a.course_id=$4 AS exact FROM admissions a
       LEFT JOIN admission_identity_bindings b ON b.admission_id=a.id
       WHERE (b.canonical_identity_key=$1 OR (b.admission_id IS NULL AND a.student_key=$1) OR (a.student_key=$5 AND a.institution_id=$3)) AND a.academic_year_code=$2 AND ${active}`,
      [
        admission.identityVerification.canonicalStudentKey ?? admission.studentKey,
        admission.academicYear,
        admission.institutionId,
        admission.courseId,
        admission.studentKey,
      ],
    );
    if (result.rows.some((row) => row.exact)) return 'EXACT';
    return result.rows.length > 0 ? 'POTENTIAL' : 'NONE';
  }

  public async findEffective(query: ApprovalSnapshotQuery): Promise<ApprovalSnapshot | null> {
    const result = await this.client.query<ApprovalRow>(
      `${ALLOCATION_SELECT}
       WHERE a.institution_id = $1 AND a.campus_id = $2 AND a.programme_id = $3
         AND a.course_id = $4 AND a.academic_year_code = $5
         AND a.effective_from <= $6::date
         AND (a.effective_to IS NULL OR a.effective_to >= $6::date)
         AND NOT EXISTS (
           SELECT 1 FROM approval_supersessions s
           JOIN approval_snapshots replacement ON replacement.id = s.replacement_snapshot_id
           WHERE s.previous_snapshot_id = a.id
             AND replacement.effective_from <= $6::date
             AND (replacement.effective_to IS NULL OR replacement.effective_to >= $6::date)
         )
       ORDER BY a.effective_from DESC, a.received_at DESC, a.id DESC
       LIMIT 1
       FOR SHARE OF a`,
      [
        query.institutionId,
        query.campusId,
        query.programmeId,
        query.courseId,
        query.academicYear,
        query.admissionDate,
      ],
    );
    return result.rows[0] === undefined ? null : toApproval(result.rows[0]);
  }

  public async loadCapacityUsageForUpdate(approval: ApprovalSnapshot): Promise<CapacityUsage> {
    const rows = await this.client.query<AllocationRow>(
      `SELECT allocation_code, used_quantity
       FROM capacity_allocations
       WHERE approval_snapshot_id = $1
       ORDER BY allocation_code
       FOR UPDATE`,
      [approval.id],
    );
    const byCode = new Map(rows.rows.map((row) => [row.allocation_code, row.used_quantity]));
    const expected: readonly AllocationCode[] = [
      'ORDINARY',
      'NRI_WITHIN_ORDINARY',
      'FN_OCI_SUBGROUP',
      'GULF_SUBGROUP',
      'FN_OCI_GULF_COMBINED',
      'LATERAL_SUPERNUMERARY',
      'LATERAL_FIRST_YEAR_VACANCY',
      'TFW',
      'PM_USPY_COURSE',
      'FOREIGN_NATIONAL_ACROSS_ROUTES',
    ];
    if (expected.some((code) => !byCode.has(code))) {
      throw new PersistenceInvariantError(
        'The approval snapshot is missing a capacity allocation.',
      );
    }
    const institution = await this.client.query<{ used_quantity: number }>(
      `SELECT used_quantity FROM institution_capacity_allocations
       WHERE institution_id = $1 AND academic_year_code = $2 AND policy_version = $3
         AND allocation_code = 'PM_USPY_INSTITUTION'
       FOR UPDATE`,
      [approval.institution.id, approval.academicYear, approval.policyVersion],
    );
    if (institution.rowCount !== 1) {
      throw new PersistenceInvariantError(
        'The approval is missing its institution PM-USPY allocation.',
      );
    }
    const used = (code: AllocationCode): number => byCode.get(code) ?? 0;
    return {
      foreignAndOciUsed: used('FN_OCI_SUBGROUP'),
      foreignNationalAcrossRoutesUsed: used('FOREIGN_NATIONAL_ACROSS_ROUTES'),
      gulfUsed: used('GULF_SUBGROUP'),
      lateralFirstYearVacancyUsed: used('LATERAL_FIRST_YEAR_VACANCY'),
      lateralSupernumeraryUsed: used('LATERAL_SUPERNUMERARY'),
      nriWithinOrdinaryUsed: used('NRI_WITHIN_ORDINARY'),
      ordinaryUsed: used('ORDINARY'),
      pmUspyCourseUsed: used('PM_USPY_COURSE'),
      pmUspyInstitutionUsed: institution.rows[0]?.used_quantity ?? 0,
      tfwUsed: used('TFW'),
    };
  }

  public async persistOutcome(outcome: PersistAdmissionOutcome): Promise<void> {
    const { admission, context } = outcome.command;
    const r = outcome.references;
    await this.client.query(
      `INSERT INTO admission_commands (
        id, idempotency_record_id, institution_id, campus_id, programme_id, course_id,
        academic_year_code, student_key, admission_date, category, lateral_capacity_source,
        eligibility_evidence, student_status, request_hash, correlation_reference,
        request_reference, received_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        admission.commandId,
        r.idempotencyRecordId,
        admission.institutionId,
        admission.campusId,
        admission.programmeId,
        admission.courseId,
        admission.academicYear,
        admission.studentKey,
        admission.admissionDate,
        admission.category,
        admission.lateralCapacitySource,
        admission.eligibilityEvidence,
        admission.studentStatus,
        context.requestHash,
        context.correlationReference,
        context.requestReference,
        outcome.occurredAt,
      ],
    );
    await this.client.query(
      `INSERT INTO identity_verifications (
        id, admission_command_id, status, checked_at, provider_contract_version,
        provider_request_reference
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        r.identityVerificationId,
        admission.commandId,
        admission.identityVerification.status,
        admission.identityVerification.checkedAt,
        admission.identityVerification.providerContractVersion,
        admission.identityVerification.providerRequestReference,
      ],
    );
    await this.client.query(
      `INSERT INTO admissions (
        id, admission_command_id, registration_reference, institution_id, campus_id,
        programme_id, course_id, academic_year_code, student_key, category,
        lifecycle_status, approval_snapshot_id, ruleset_version, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        r.admissionId,
        admission.commandId,
        r.registrationReference,
        admission.institutionId,
        admission.campusId,
        admission.programmeId,
        admission.courseId,
        admission.academicYear,
        admission.studentKey,
        admission.category,
        outcome.decision.targetLifecycleStatus,
        outcome.approval?.id ?? null,
        outcome.decision.rulesetVersion,
        outcome.occurredAt,
      ],
    );
    if (
      admission.identityVerification.status === 'VERIFIED' &&
      admission.identityVerification.canonicalStudentKey !== undefined
    ) {
      await this.client.query(
        `INSERT INTO admission_identity_bindings(admission_id,canonical_identity_key,provider_reference) VALUES($1,$2,$3)`,
        [
          r.admissionId,
          admission.identityVerification.canonicalStudentKey,
          admission.identityVerification.providerRequestReference,
        ],
      );
    }
    await this.client.query(
      `INSERT INTO admission_decisions (
        id, admission_id, version, outcome, lifecycle_status, approval_snapshot_id,
        ruleset_version, evaluated_at, findings
      ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)`,
      [
        r.decisionId,
        r.admissionId,
        outcome.decision.outcome,
        outcome.decision.targetLifecycleStatus,
        outcome.decision.approvalSnapshotId,
        outcome.decision.rulesetVersion,
        outcome.decision.evaluatedAt,
        JSON.stringify(outcome.decision.findings),
      ],
    );

    if (outcome.decision.outcome === 'ACCEPT') {
      if (outcome.approval === null || outcome.decision.reservation === null) {
        throw new PersistenceInvariantError(
          'An accepted decision requires approval and reservation.',
        );
      }
      const codes = [...requiredAllocations(admission)].sort();
      for (const code of codes) {
        const updated = await this.client.query<{ id: string }>(
          `UPDATE capacity_allocations SET used_quantity = used_quantity + 1
           WHERE approval_snapshot_id = $1 AND allocation_code = $2
             AND used_quantity < capacity_quantity
           RETURNING id`,
          [outcome.approval.id, code],
        );
        if (updated.rowCount !== 1 || updated.rows[0] === undefined) {
          throw new PersistenceInvariantError(`Capacity allocation ${code} was unavailable.`);
        }
        await this.client.query(
          `INSERT INTO capacity_reservations (
             id, admission_id, capacity_allocation_id, allocation_code, units, created_at
           ) VALUES ($1,$2,$3,$4,1,$5)`,
          [`${r.admissionId}-${code}`, r.admissionId, updated.rows[0].id, code, outcome.occurredAt],
        );
      }
      if (admission.category === 'PM_USPY') {
        const institutionAllocation = await this.client.query<{ id: string }>(
          `UPDATE institution_capacity_allocations SET used_quantity = used_quantity + 1
           WHERE institution_id = $1 AND academic_year_code = $2 AND policy_version = $3
             AND allocation_code = 'PM_USPY_INSTITUTION' AND used_quantity < capacity_quantity
           RETURNING id`,
          [
            outcome.approval.institution.id,
            outcome.approval.academicYear,
            outcome.approval.policyVersion,
          ],
        );
        if (institutionAllocation.rowCount !== 1 || institutionAllocation.rows[0] === undefined) {
          throw new PersistenceInvariantError('Institution PM-USPY capacity was unavailable.');
        }
        await this.client.query(
          `INSERT INTO capacity_reservations (
             id, admission_id, institution_capacity_allocation_id, allocation_code, units, created_at
           ) VALUES ($1,$2,$3,'PM_USPY_INSTITUTION',1,$4)`,
          [
            `${r.admissionId}-PM_USPY_INSTITUTION`,
            r.admissionId,
            institutionAllocation.rows[0].id,
            outcome.occurredAt,
          ],
        );
      }
    }

    await this.client.query(
      `INSERT INTO business_audit_events (
        id, event_type, aggregate_type, aggregate_reference, actor_reference, reason,
        correlation_reference, request_reference, details, created_at
      ) VALUES ($1,'ADMISSION_POLICY_EVALUATED','ADMISSION',$2,$3,$4,$5,$6,$7,$8)`,
      [
        r.auditEventId,
        r.admissionId,
        context.actorReference,
        context.reason,
        context.correlationReference,
        context.requestReference,
        {
          approvalSnapshotId: outcome.decision.approvalSnapshotId,
          outcome: outcome.decision.outcome,
          validationProfileVersion: ADMISSION_VALIDATION_PROFILE_VERSION,
          ruleCodes: outcome.decision.findings.map((finding) => finding.code),
          rulesetVersion: outcome.decision.rulesetVersion,
        },
        outcome.occurredAt,
      ],
    );
    await this.client.query(
      `INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_reference, payload, created_at
      ) VALUES ($1,'ADMISSION_DECIDED','ADMISSION',$2,$3,$4)`,
      [
        r.outboxEventId,
        r.admissionId,
        {
          admissionId: r.admissionId,
          admissionReference: r.registrationReference,
          decisionId: r.decisionId,
          outcome: outcome.decision.outcome,
        },
        outcome.occurredAt,
      ],
    );
  }
}

function isRetryableTransactionFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === '40001' || error.code === '40P01')
  );
}

async function runIdempotentOnClient(
  client: PoolClient,
  options: IdempotentTransactionOptions,
  work: (transaction: AdmissionTransaction) => Promise<AdmissionSubmissionResult>,
): Promise<AdmissionSubmissionResult> {
  await client.query(
    `INSERT INTO idempotency_records (
       id, institution_id, idempotency_key, request_hash, status
     ) VALUES ($1,$2,$3,$4,'PROCESSING')
     ON CONFLICT DO NOTHING`,
    [
      options.idempotencyRecordId,
      options.institutionId,
      options.idempotencyKey,
      options.requestHash,
    ],
  );
  const claimed = await client.query<{
    request_hash: string;
    status: 'PROCESSING' | 'COMPLETED';
    result: AdmissionSubmissionResult | null;
  }>(
    `SELECT request_hash, status, result FROM idempotency_records
     WHERE institution_id = $1 AND idempotency_key = $2 FOR UPDATE`,
    [options.institutionId, options.idempotencyKey],
  );
  const record = claimed.rows[0];
  if (record === undefined) {
    throw new PersistenceInvariantError('The idempotency record could not be claimed.');
  }
  if (record.request_hash !== options.requestHash) {
    throw new IdempotencyConflictError();
  }
  if (record.status === 'COMPLETED') {
    if (record.result === null) {
      throw new PersistenceInvariantError('A completed idempotency record has no result.');
    }
    return { ...record.result, replayed: true };
  }

  const result = await work(new PostgresAdmissionTransaction(client));
  await client.query(
    `UPDATE idempotency_records SET status = 'COMPLETED', result = $1, completed_at = transaction_timestamp()
     WHERE institution_id = $2 AND idempotency_key = $3 AND status = 'PROCESSING'`,
    [result, options.institutionId, options.idempotencyKey],
  );
  return result;
}

export class PostgresAdmissionClientUnitOfWork implements AdmissionUnitOfWork {
  public constructor(private readonly client: PoolClient) {}

  public runIdempotent(
    options: IdempotentTransactionOptions,
    work: (transaction: AdmissionTransaction) => Promise<AdmissionSubmissionResult>,
  ): Promise<AdmissionSubmissionResult> {
    return runIdempotentOnClient(this.client, options, work);
  }
}

export class PostgresAdmissionStore implements AdmissionUnitOfWork, ApprovalSnapshotWriter {
  public constructor(private readonly pool: Pool) {}

  public async runIdempotent(
    options: IdempotentTransactionOptions,
    work: (transaction: AdmissionTransaction) => Promise<AdmissionSubmissionResult>,
  ): Promise<AdmissionSubmissionResult> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await runIdempotentOnClient(client, options, work);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (isRetryableTransactionFailure(error) && attempt < 5) {
          await delay(Math.min(100, 5 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 5));
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
    throw new PersistenceInvariantError('Serializable transaction retry limit was exhausted.');
  }

  public async importSnapshot(command: ApprovalImportCommand): Promise<void> {
    const snapshot = command.snapshot;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query(
        `INSERT INTO institutions (id, name) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [snapshot.institution.id, snapshot.institution.name],
      );
      await client.query(
        `INSERT INTO campuses (id, institution_id, name) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [snapshot.campus.id, snapshot.institution.id, snapshot.campus.name],
      );
      await client.query(
        `INSERT INTO programmes (id, name, level) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, level = EXCLUDED.level`,
        [snapshot.programme.id, snapshot.programme.name, snapshot.programme.level],
      );
      await client.query(
        `INSERT INTO courses (id, campus_id, programme_id, name, mode) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, mode = EXCLUDED.mode`,
        [
          snapshot.course.id,
          snapshot.campus.id,
          snapshot.programme.id,
          snapshot.course.name,
          snapshot.course.mode,
        ],
      );
      await client.query('INSERT INTO academic_years (code) VALUES ($1) ON CONFLICT DO NOTHING', [
        snapshot.academicYear,
      ]);
      await client.query(
        `INSERT INTO approval_import_batches (
          id, source_system, source_hash, received_at, approved_by
        ) VALUES ($1,$2,$3,$4,$5)`,
        [
          snapshot.importBatchReference,
          snapshot.sourceSystem,
          snapshot.sourceHash,
          snapshot.receivedAt,
          snapshot.approvedBy,
        ],
      );
      await client.query(
        `INSERT INTO approval_snapshots (
          id, import_batch_id, source_system, source_record_id, source_hash, effective_from,
          effective_to, received_at, approved_by, policy_version, academic_year_code,
          institution_id, campus_id, programme_id, course_id, programme_level, course_mode, ordinary_intake,
          nri_approved, nri_maximum_within_ordinary, fn_oci_gulf_approved, fn_oci_capacity,
          gulf_capacity, fn_oci_gulf_combined_capacity, foreign_national_across_routes_maximum,
          lateral_approved, lateral_supernumerary_capacity, lateral_first_year_vacancy_capacity,
          tfw_approved, tfw_capacity, tfw_preceding_year_fill_satisfied, pm_uspy_approved,
          pm_uspy_course_capacity, pm_uspy_institution_capacity
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
        )`,
        [
          snapshot.id,
          snapshot.importBatchReference,
          snapshot.sourceSystem,
          snapshot.sourceRecordId,
          snapshot.sourceHash,
          snapshot.effectiveFrom,
          snapshot.effectiveTo,
          snapshot.receivedAt,
          snapshot.approvedBy,
          snapshot.policyVersion,
          snapshot.academicYear,
          snapshot.institution.id,
          snapshot.campus.id,
          snapshot.programme.id,
          snapshot.course.id,
          snapshot.programme.level,
          snapshot.course.mode,
          snapshot.ordinaryIntake,
          snapshot.nri.approved,
          snapshot.nri.maximumWithinOrdinary,
          snapshot.fnOciGulf.approved,
          snapshot.fnOciGulf.foreignAndOciCapacity,
          snapshot.fnOciGulf.gulfCapacity,
          snapshot.fnOciGulf.combinedTotalCapacity,
          snapshot.fnOciGulf.foreignNationalAcrossRoutesMaximum,
          snapshot.lateral.approved,
          snapshot.lateral.supernumeraryCapacity,
          snapshot.lateral.firstYearVacancyCapacity,
          snapshot.tfw.approved,
          snapshot.tfw.capacity,
          snapshot.tfw.precedingYearMinimumFillSatisfied,
          snapshot.pmUspy.approved,
          snapshot.pmUspy.courseCapacity,
          snapshot.pmUspy.institutionCapacity,
        ],
      );
      const capacities: Readonly<Record<AllocationCode, number>> = {
        FN_OCI_GULF_COMBINED: snapshot.fnOciGulf.combinedTotalCapacity,
        FN_OCI_SUBGROUP: snapshot.fnOciGulf.foreignAndOciCapacity,
        FOREIGN_NATIONAL_ACROSS_ROUTES: snapshot.fnOciGulf.foreignNationalAcrossRoutesMaximum,
        GULF_SUBGROUP: snapshot.fnOciGulf.gulfCapacity,
        LATERAL_FIRST_YEAR_VACANCY: snapshot.lateral.firstYearVacancyCapacity,
        LATERAL_SUPERNUMERARY: snapshot.lateral.supernumeraryCapacity,
        NRI_WITHIN_ORDINARY: snapshot.nri.maximumWithinOrdinary,
        ORDINARY: snapshot.ordinaryIntake,
        PM_USPY_COURSE: snapshot.pmUspy.courseCapacity,
        TFW: snapshot.tfw.capacity,
      };
      for (const [code, capacity] of Object.entries(capacities).sort()) {
        await client.query(
          `INSERT INTO capacity_allocations (
             id, approval_snapshot_id, allocation_code, capacity_quantity, convertible
           ) VALUES ($1,$2,$3,$4,false)`,
          [`CAP-${snapshot.id}-${code}`, snapshot.id, code, capacity],
        );
      }
      const institutionCapacity = await client.query(
        `INSERT INTO institution_capacity_allocations (
           id, institution_id, academic_year_code, policy_version, allocation_code, capacity_quantity
         ) VALUES ($1,$2,$3,$4,'PM_USPY_INSTITUTION',$5)
         ON CONFLICT (institution_id, academic_year_code, policy_version, allocation_code)
         DO UPDATE SET capacity_quantity = institution_capacity_allocations.capacity_quantity
         WHERE institution_capacity_allocations.capacity_quantity = EXCLUDED.capacity_quantity
         RETURNING id`,
        [
          `CAP-${snapshot.institution.id}-${snapshot.academicYear}-${snapshot.policyVersion}-PM_USPY`,
          snapshot.institution.id,
          snapshot.academicYear,
          snapshot.policyVersion,
          snapshot.pmUspy.institutionCapacity,
        ],
      );
      if (institutionCapacity.rowCount !== 1) {
        throw new PersistenceInvariantError(
          'Conflicting institution PM-USPY capacities were imported.',
        );
      }
      if (command.supersedesSnapshotId !== undefined && command.supersessionReason !== undefined) {
        await client.query(
          `INSERT INTO approval_supersessions (
             previous_snapshot_id, replacement_snapshot_id, reason
           ) VALUES ($1,$2,$3)`,
          [command.supersedesSnapshotId, snapshot.id, command.supersessionReason],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
