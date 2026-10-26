import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ImportApprovalSnapshotService,
  PostgresAdmissionStore,
  SubmitAdmissionService,
  migrate,
  type ReferenceGenerator,
  type SubmitAdmissionCommand,
} from '@apaar-platform/admission-application';
import {
  asAcademicYear,
  asAdmissionCommandId,
  asApprovalSnapshotId,
  asCampusId,
  asCourseId,
  asInstitutionId,
  asIsoDate,
  asIsoDateTime,
  asProgrammeId,
  asStudentKey,
  type AdmissionCategory,
  type ApprovalSnapshot,
} from '@apaar-platform/admission-domain';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CreateAppealService,
  CreateCaseService,
  DeterministicAuthorizationSimulator,
  ExecuteCaseActionService,
  GetCaseService,
  ImplementCancellationService,
  ImplementTransferService,
  ListCasesService,
  PostgresCaseworkRepository,
  type ActorContext,
  type CaseActionCommand,
  type CreateCaseCommand,
  type ImplementTransferCommand,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const admissionMigrations = resolve(here, '../../../admission-application/migrations');
const batchMigrations = resolve(here, '../../../batch-ingestion/migrations');
const caseworkMigrations = resolve(here, '../../migrations');
const hash = 'a'.repeat(64);
let container: StartedPostgreSqlContainer;
let pool: Pool;
let initiallyApplied: readonly string[];

interface PolicyOptions {
  readonly configuration?: Readonly<Record<string, unknown>>;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string | null;
  readonly key?: string;
  readonly scope?: Readonly<Record<string, string>>;
  readonly status?: 'ACTIVE' | 'DRAFT' | 'RETIRED';
}

async function insertPolicy(version: string, options: PolicyOptions = {}): Promise<void> {
  const status = options.status ?? 'ACTIVE';
  await pool.query(
    `INSERT INTO casework_policy_versions (
      id,policy_key,policy_version,authority,source_reference,effective_from,effective_to,
      scope,configuration,activation_status,activated_by,checker_reference
    ) VALUES ($1,$2,$3,'AUTHORITY_CONFIGURED',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      `SYNTH-POLICY-${version}`,
      options.key ?? 'SYNTH-CASEWORK',
      version,
      `SYNTH-AUTHORITY-${version}`,
      options.effectiveFrom ?? '2026-01-01',
      options.effectiveTo === undefined ? '2027-12-31' : options.effectiveTo,
      options.scope ?? { institutionType: 'SYNTH-TECHNICAL' },
      options.configuration ?? { workflow: 'SYNTH-MAKER-CHECKER' },
      status,
      status === 'ACTIVE' ? 'SYNTH-MAKER-POLICY' : null,
      status === 'ACTIVE' ? 'SYNTH-CHECKER-POLICY' : null,
    ],
  );
}

async function seedAdmission(suffix = '0001'): Promise<string> {
  const institutionId = `SYNTH-INST-${suffix}`;
  const campusId = `SYNTH-CAMPUS-${suffix}`;
  const programmeId = `SYNTH-PROG-${suffix}`;
  const courseId = `SYNTH-COURSE-${suffix}`;
  const admissionId = `SYNTH-ADMISSION-${suffix}`;
  const idempotencyId = `SYNTH-IDEMPOTENCY-${suffix}`;
  const commandId = `SYNTH-ADMISSION-COMMAND-${suffix}`;
  await pool.query("INSERT INTO academic_years(code) VALUES ('2026-27') ON CONFLICT DO NOTHING");
  await pool.query('INSERT INTO institutions(id,name) VALUES ($1,$2)', [
    institutionId,
    `Synthetic Institute ${suffix}`,
  ]);
  await pool.query('INSERT INTO campuses(id,institution_id,name) VALUES ($1,$2,$3)', [
    campusId,
    institutionId,
    `Synthetic Campus ${suffix}`,
  ]);
  await pool.query("INSERT INTO programmes(id,name,level) VALUES ($1,$2,'UNDERGRADUATE')", [
    programmeId,
    `Synthetic Programme ${suffix}`,
  ]);
  await pool.query(
    `INSERT INTO courses(id,campus_id,programme_id,name,mode)
     VALUES ($1,$2,$3,$4,'REGULAR')`,
    [courseId, campusId, programmeId, `Synthetic Course ${suffix}`],
  );
  await pool.query(
    `INSERT INTO idempotency_records (
      id,institution_id,idempotency_key,request_hash,status
    ) VALUES ($1,$2,$3,$4,'PROCESSING')`,
    [idempotencyId, institutionId, `SYNTH-IDEMPOTENCY-KEY-${suffix}`, hash],
  );
  await pool.query(
    `INSERT INTO admission_commands (
      id,idempotency_record_id,institution_id,campus_id,programme_id,course_id,
      academic_year_code,student_key,admission_date,category,eligibility_evidence,
      student_status,request_hash,correlation_reference,request_reference,received_at
    ) VALUES ($1,$2,$3,$4,$5,$6,'2026-27',$7,'2026-08-01','ORDINARY','VERIFIED',
      $8,$9,$10,$11,'2026-08-01T09:00:00Z')`,
    [
      commandId,
      idempotencyId,
      institutionId,
      campusId,
      programmeId,
      courseId,
      `SYNTH-STUDENT-${suffix}`,
      { synthetic: true },
      hash,
      `SYNTH-CORRELATION-${suffix}`,
      `SYNTH-REQUEST-${suffix}`,
    ],
  );
  await pool.query(
    `INSERT INTO admissions (
      id,admission_command_id,institution_id,campus_id,programme_id,course_id,
      academic_year_code,student_key,category,lifecycle_status,ruleset_version,created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,'2026-27',$7,'ORDINARY','REJECTED',
      'SYNTH-RULESET-1','2026-08-01T09:00:00Z')`,
    [
      admissionId,
      commandId,
      institutionId,
      campusId,
      programmeId,
      courseId,
      `SYNTH-STUDENT-${suffix}`,
    ],
  );
  return admissionId;
}

async function insertCase(
  suffix: string,
  admissionId: string,
  caseType = 'ADMISSION_CORRECTION',
  policyVersion = 'SYNTH-POLICY-V1',
): Promise<string> {
  const institution = await pool.query<{ institution_id: string }>(
    'SELECT institution_id FROM admissions WHERE id=$1',
    [admissionId],
  );
  const caseId = `SYNTH-CASE-${suffix}`;
  await pool.query(
    `INSERT INTO admission_cases (
      id,case_reference,case_type,institution_id,admission_id,policy_version,
      policy_authority,priority,state,maker_reference
    ) VALUES ($1,$2,$3,$4,$5,$6,'AUTHORITY_CONFIGURED','NORMAL','DRAFT',$7)`,
    [
      caseId,
      `SYNTH-CASE-REFERENCE-${suffix}`,
      caseType,
      institution.rows[0]?.institution_id,
      admissionId,
      policyVersion,
      'SYNTH-CASE-MAKER',
    ],
  );
  return caseId;
}

function actor(
  role: ActorContext['role'],
  suffix: string,
  institutionId: string | null,
  actorReference = `SYNTH-${role}-${suffix}`,
): ActorContext {
  return {
    actorReference,
    correlationReference: `SYNTH-CORRELATION-${suffix}`,
    institutionId,
    purpose: 'SYNTHETIC-CASEWORK',
    reason: `SYNTHETIC-${suffix}`,
    requestReference: `SYNTH-REQUEST-${suffix}`,
    role,
  };
}

function createCommand(admissionId: string, suffix = 'SERVICE'): CreateCaseCommand {
  return {
    actor: actor('INSTITUTION_OPERATOR', `${suffix}-CREATE`, 'SYNTH-INST-0001'),
    admissionId,
    caseId: `SYNTH-SERVICE-CASE-${suffix}`,
    caseReference: `SYNTH-SERVICE-REFERENCE-${suffix}`,
    caseType: 'ADMISSION_CORRECTION',
    idempotencyKey: `SYNTH-SERVICE-CREATE-${suffix}`,
    institutionId: 'SYNTH-INST-0001',
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion: 'SYNTH-POLICY-V1',
    priority: 'NORMAL',
  };
}

class FixedAdmissionReferences implements ReferenceGenerator {
  public constructor(private readonly prefix: string) {}

  public next(kind: Parameters<ReferenceGenerator['next']>[0]): string {
    return `${this.prefix}-${kind}`;
  }
}

function approval(
  institutionSuffix: string,
  routeSuffix: string,
  ordinaryIntake = 5,
): ApprovalSnapshot {
  const institutionId = asInstitutionId(`SYNTH-INST-${institutionSuffix}`);
  const campusId = asCampusId(`SYNTH-CAMPUS-${routeSuffix}`);
  const programmeId = asProgrammeId(`SYNTH-PROG-${routeSuffix}`);
  return {
    academicYear: asAcademicYear('2026-27'),
    approvedBy: 'SYNTH-AUTHORITY-ADMISSION',
    campus: { id: campusId, institutionId, name: `Synthetic Campus ${routeSuffix}` },
    course: {
      campusId,
      id: asCourseId(`SYNTH-COURSE-${routeSuffix}`),
      mode: 'REGULAR',
      name: `Synthetic Course ${routeSuffix}`,
      programmeId,
    },
    effectiveFrom: asIsoDate('2026-04-01'),
    effectiveTo: asIsoDate('2027-03-31'),
    fnOciGulf: {
      approved: true,
      combinedTotalCapacity: 4,
      foreignAndOciCapacity: 3,
      foreignNationalAcrossRoutesMaximum: 4,
      gulfCapacity: 1,
    },
    id: asApprovalSnapshotId(`SYNTH-APPROVAL-${routeSuffix}`),
    importBatchReference: `SYNTH-IMPORT-${routeSuffix}`,
    institution: { id: institutionId, name: `Synthetic Institute ${institutionSuffix}` },
    lateral: { approved: true, firstYearVacancyCapacity: 1, supernumeraryCapacity: 2 },
    nri: { approved: true, maximumWithinOrdinary: Math.min(2, ordinaryIntake) },
    ordinaryIntake,
    pmUspy: { approved: true, courseCapacity: 2, institutionCapacity: 10 },
    policyVersion: 'SYNTH-ADMISSION-POLICY-2026',
    programme: {
      id: programmeId,
      level: 'UNDERGRADUATE',
      name: `Synthetic Programme ${routeSuffix}`,
    },
    receivedAt: asIsoDateTime('2026-04-02T09:00:00.000Z'),
    sourceHash: `SYNTH-SOURCE-HASH-${routeSuffix}`,
    sourceRecordId: `SYNTH-SOURCE-RECORD-${routeSuffix}`,
    sourceSystem: 'SYNTHETIC-SOURCE',
    supersededBy: null,
    tfw: { approved: true, capacity: 2, precedingYearMinimumFillSatisfied: true },
  };
}

function submission(
  route: ApprovalSnapshot,
  suffix: string,
  studentKey = `SYNTH-STUDENT-${suffix}`,
  category: AdmissionCategory = 'ORDINARY',
): SubmitAdmissionCommand {
  return {
    admission: {
      academicYear: route.academicYear,
      admissionDate: asIsoDate('2026-08-01'),
      campusId: route.campus.id,
      category,
      commandId: asAdmissionCommandId(`SYNTH-COMMAND-${suffix}`),
      courseId: route.course.id,
      eligibilityEvidence: 'VERIFIED',
      identityVerification: {
        checkedAt: asIsoDateTime('2026-08-01T08:00:00.000Z'),
        providerContractVersion: 'SYNTH-IDENTITY-CONTRACT-1',
        providerRequestReference: `SYNTH-IDENTITY-REQUEST-${suffix}`,
        status: 'VERIFIED',
      },
      institutionId: route.institution.id,
      lateralCapacitySource: category === 'LATERAL_ENTRY' ? 'LATERAL_SUPERNUMERARY' : null,
      lifecycleStatus: 'DRAFT',
      programmeId: route.programme.id,
      studentKey: asStudentKey(studentKey),
      studentStatus: {
        foreignNational: category === 'FOREIGN_NATIONAL',
        gulfWorkerChild: category === 'GULF_WORKER_CHILD',
        nri: category === 'NRI',
        oci: category === 'OCI',
      },
    },
    context: {
      actorReference: 'SYNTH-ADMISSION-ACTOR',
      correlationReference: `SYNTH-ADMISSION-CORRELATION-${suffix}`,
      idempotencyKey: `SYNTH-ADMISSION-IDEMPOTENCY-${suffix}`,
      institutionId: route.institution.id,
      reason: 'SYNTHETIC_ADMISSION',
      requestHash: createHash('sha256').update(`SYNTH-ADMISSION-${suffix}`).digest('hex'),
      requestReference: `SYNTH-ADMISSION-REQUEST-${suffix}`,
    },
  };
}

async function importApproval(route: ApprovalSnapshot): Promise<void> {
  await new ImportApprovalSnapshotService(new PostgresAdmissionStore(pool)).execute({
    snapshot: route,
  });
}

async function submitAccepted(
  route: ApprovalSnapshot,
  suffix: string,
  studentKey?: string,
  category?: AdmissionCategory,
) {
  return new SubmitAdmissionService(
    {
      clock: { now: () => asIsoDateTime('2026-08-01T09:00:00.000Z') },
      unitOfWork: new PostgresAdmissionStore(pool),
    },
    new FixedAdmissionReferences(`SYNTH-${suffix}`),
  ).execute(submission(route, suffix, studentKey, category));
}

async function approveGovernedCase(
  repository: PostgresCaseworkRepository,
  admissionId: string,
  institutionId: string,
  caseType: CreateCaseCommand['caseType'],
  suffix: string,
  policyVersion = 'SYNTH-POLICY-V1',
) {
  const authorization = new DeterministicAuthorizationSimulator();
  const created = await new CreateCaseService(authorization, repository).execute({
    actor: actor('INSTITUTION_OPERATOR', `${suffix}-CREATE`, institutionId),
    admissionId,
    caseId: `SYNTH-CASE-${suffix}`,
    caseReference: `SYNTH-CASE-REFERENCE-${suffix}`,
    caseType,
    idempotencyKey: `SYNTH-CASE-CREATE-${suffix}`,
    institutionId,
    policyAuthority: 'AUTHORITY_CONFIGURED',
    policyVersion,
    priority: 'NORMAL',
  });
  const actions = new ExecuteCaseActionService(authorization, repository);
  const institution = (step: string) =>
    actor('INSTITUTION_OPERATOR', `${suffix}-${step}`, institutionId);
  const reviewer = (step: string) =>
    actor('AICTE_REVIEWER', `${suffix}-${step}`, null, `SYNTH-REVIEWER-${suffix}`);
  const checker = (step: string) =>
    actor('AICTE_CHECKER', `${suffix}-${step}`, null, `SYNTH-CHECKER-${suffix}`);
  await actions.execute({
    action: 'SUBMIT',
    actor: institution('SUBMIT'),
    caseId: created.caseId,
    expectedVersion: 1,
    idempotencyKey: `SYNTH-${suffix}-SUBMIT`,
  });
  await actions.execute({
    action: 'ASSIGN_REVIEWER',
    actor: checker('ASSIGN'),
    assignmentId: `SYNTH-ASSIGNMENT-${suffix}`,
    caseId: created.caseId,
    expectedVersion: 2,
    idempotencyKey: `SYNTH-${suffix}-ASSIGN`,
    reviewerReference: `SYNTH-REVIEWER-${suffix}`,
  });
  await actions.execute({
    action: 'START_REVIEW',
    actor: reviewer('START'),
    caseId: created.caseId,
    expectedVersion: 3,
    idempotencyKey: `SYNTH-${suffix}-START`,
  });
  await actions.execute({
    action: 'DECLARE_CONFLICT',
    actor: reviewer('CONFLICT'),
    caseId: created.caseId,
    declarationId: `SYNTH-CONFLICT-${suffix}`,
    expectedVersion: 4,
    hasConflict: false,
    idempotencyKey: `SYNTH-${suffix}-CONFLICT`,
  });
  await actions.execute({
    action: 'RECOMMEND',
    actor: reviewer('RECOMMEND'),
    caseId: created.caseId,
    expectedVersion: 5,
    explanation: 'Synthetic recommendation for implementation.',
    idempotencyKey: `SYNTH-${suffix}-RECOMMEND`,
    policyVersion,
    reasonCode: 'SYNTH-IMPLEMENTATION-VALID',
    recommendation: 'APPROVE',
    recommendationId: `SYNTH-RECOMMENDATION-${suffix}`,
  });
  return actions.execute({
    action: 'DECIDE',
    actor: checker('DECIDE'),
    caseId: created.caseId,
    decisionId: `SYNTH-CASE-DECISION-${suffix}`,
    expectedVersion: 6,
    explanation: 'Synthetic independent approval.',
    idempotencyKey: `SYNTH-${suffix}-DECIDE`,
    outcome: 'APPROVED',
    policyVersion,
    reasonCode: 'SYNTH-APPROVED',
  });
}

function cancellationImplementation(caseId: string, suffix: string) {
  return {
    actor: actor('AICTE_CHECKER', `${suffix}-IMPLEMENT`, null, `SYNTH-CHECKER-${suffix}`),
    caseId,
    expectedVersion: 7,
    idempotencyKey: `SYNTH-CANCELLATION-IMPLEMENT-${suffix}`,
    implementationId: `SYNTH-CANCELLATION-IMPLEMENTATION-${suffix}`,
    receiptReference: `SYNTH-CANCELLATION-RECEIPT-${suffix}`,
    sourceAdmissionVersionId: `SYNTH-CANCELLED-VERSION-${suffix}`,
  };
}

function transferImplementation(
  caseId: string,
  targetSubmission: SubmitAdmissionCommand,
  suffix: string,
): ImplementTransferCommand {
  return {
    actor: actor('AICTE_CHECKER', `${suffix}-IMPLEMENT`, null, `SYNTH-CHECKER-${suffix}`),
    caseId,
    expectedVersion: 7,
    idempotencyKey: `SYNTH-TRANSFER-IMPLEMENT-${suffix}`,
    implementationId: `SYNTH-TRANSFER-IMPLEMENTATION-${suffix}`,
    receiptReference: `SYNTH-TRANSFER-RECEIPT-${suffix}`,
    sourceAdmissionVersionId: `SYNTH-TRANSFERRED-VERSION-${suffix}`,
    targetReferences: {
      admissionId: `SYNTH-${suffix}-TARGET-ADMISSION`,
      auditEventId: `SYNTH-${suffix}-TARGET-AUDIT`,
      decisionId: `SYNTH-${suffix}-TARGET-DECISION`,
      identityVerificationId: `SYNTH-${suffix}-TARGET-IDENTITY`,
      outboxEventId: `SYNTH-${suffix}-TARGET-OUTBOX`,
      registrationReference: `SYNTH-${suffix}-TARGET-REGISTRATION`,
    },
    targetSubmission,
    transferId: `SYNTH-TRANSFER-${suffix}`,
  };
}

describe('PostgreSQL casework governance foundation', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17.6-alpine')
      .withDatabase('SYNTH_CASEWORK_TEST')
      .withUsername('SYNTH_USER')
      .withPassword('SYNTH_PASSWORD')
      .start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await migrate(pool, admissionMigrations);
    await migrate(pool, batchMigrations);
    initiallyApplied = await migrate(pool, caseworkMigrations);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE casework_policy_versions, institutions, programmes, academic_years CASCADE',
    );
  });

  it('migrates after Stage 3 and repeats without reapplying', async () => {
    expect(initiallyApplied).toEqual(['0003_admission_casework_governance.sql']);
    await expect(migrate(pool, caseworkMigrations)).resolves.toEqual([]);
    const result = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'case%'",
    );
    expect(Number(result.rows[0]?.count)).toBeGreaterThanOrEqual(10);
  });

  it('requires authoritative independent activation and protects active policy history', async () => {
    await expect(
      pool.query(
        `INSERT INTO casework_policy_versions (
          id,policy_key,policy_version,authority,source_reference,effective_from,scope,
          configuration,activation_status,activated_by,checker_reference
        ) VALUES (
          'SYNTH-POLICY-INVALID','SYNTH-CASEWORK','SYNTH-VERSION-INVALID',
          'AUTHORITY_CONFIGURED','SYNTH-AUTHORITY-INVALID','2026-01-01','{}','{}',
          'ACTIVE','SYNTH-ACTOR-0001','SYNTH-ACTOR-0001'
        )`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `INSERT INTO casework_policy_versions (
          id,policy_key,policy_version,authority,source_reference,effective_from,scope,
          configuration,activation_status,activated_by,checker_reference
        ) VALUES (
          'SYNTH-POLICY-PROPOSED','SYNTH-CASEWORK','SYNTH-VERSION-PROPOSED','PROPOSED',
          'SYNTH-AUTHORITY-PROPOSED','2026-01-01','{}','{}','ACTIVE',
          'SYNTH-MAKER-0001','SYNTH-CHECKER-0001'
        )`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await insertPolicy('SYNTH-POLICY-V1');
    await expect(
      pool.query(
        "UPDATE casework_policy_versions SET source_reference='SYNTH-TAMPERED' WHERE policy_version='SYNTH-POLICY-V1'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      pool.query("DELETE FROM casework_policy_versions WHERE policy_version='SYNTH-POLICY-V1'"),
    ).rejects.toMatchObject({ code: '55000' });
    await insertPolicy('SYNTH-POLICY-DRAFT', { status: 'DRAFT' });
    await expect(
      pool.query("DELETE FROM casework_policy_versions WHERE policy_version='SYNTH-POLICY-DRAFT'"),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('rejects overlapping active policy ranges only for the same policy and scope', async () => {
    await insertPolicy('SYNTH-POLICY-V1', { effectiveTo: '2026-06-30' });
    await expect(
      insertPolicy('SYNTH-POLICY-V2', {
        effectiveFrom: '2026-06-30',
        effectiveTo: '2026-12-31',
      }),
    ).rejects.toMatchObject({ code: '23P01' });
    await expect(
      insertPolicy('SYNTH-POLICY-V3', {
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-12-31',
      }),
    ).resolves.toBeUndefined();
    await expect(
      insertPolicy('SYNTH-POLICY-V4', {
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        scope: { institutionType: 'SYNTH-MANAGEMENT' },
      }),
    ).resolves.toBeUndefined();
  });

  it('requires a current active policy and permits only one active case of each type', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-DRAFT', { status: 'DRAFT' });
    await expect(
      insertCase('DRAFT-POLICY', admissionId, 'ADMISSION_CORRECTION', 'SYNTH-POLICY-DRAFT'),
    ).rejects.toMatchObject({ code: '23514' });
    await insertPolicy('SYNTH-POLICY-V1');
    const first = await insertCase('ACTIVE-1', admissionId);
    await expect(insertCase('ACTIVE-2', admissionId)).rejects.toMatchObject({ code: '23505' });
    await pool.query("UPDATE admission_cases SET state='WITHDRAWN',version=2 WHERE id=$1", [first]);
    await expect(insertCase('ACTIVE-3', admissionId)).resolves.toBe('SYNTH-CASE-ACTIVE-3');
  });

  it('enforces lifecycle transitions, optimistic versions and immutable state history', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const caseId = await insertCase('LIFECYCLE', admissionId);
    await expect(
      pool.query("UPDATE admission_cases SET state='SUBMITTED',version=2 WHERE id=$1", [caseId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query("UPDATE admission_cases SET state='APPROVED',version=3 WHERE id=$1", [caseId]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE admission_cases SET version=3 WHERE id=$1', [caseId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await pool.query(
      `INSERT INTO case_state_history (
        case_id,previous_state,next_state,actor_reference,actor_role,reason,purpose,
        request_reference,correlation_reference
      ) VALUES ($1,'DRAFT','SUBMITTED','SYNTH-ACTOR','AICTE_REVIEWER','SYNTH-REASON',
        'SYNTH-PURPOSE','SYNTH-REQUEST','SYNTH-CORRELATION')`,
      [caseId],
    );
    await expect(
      pool.query("UPDATE case_state_history SET reason='SYNTH-TAMPERED' WHERE case_id=$1", [
        caseId,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('allows one active assignment and preserves ended assignment history', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const caseId = await insertCase('ASSIGNMENT', admissionId);
    await expect(
      pool.query(
        "INSERT INTO case_assignments(id,case_id,reviewer_reference,assigned_by) VALUES ('SYNTH-ASSIGN-MAKER',$1,'SYNTH-CASE-MAKER','SYNTH-ASSIGNER')",
        [caseId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      "INSERT INTO case_assignments(id,case_id,reviewer_reference,assigned_by) VALUES ('SYNTH-ASSIGN-1',$1,'SYNTH-REVIEWER-1','SYNTH-ASSIGNER')",
      [caseId],
    );
    await expect(
      pool.query(
        "INSERT INTO case_assignments(id,case_id,reviewer_reference,assigned_by) VALUES ('SYNTH-ASSIGN-2',$1,'SYNTH-REVIEWER-2','SYNTH-ASSIGNER')",
        [caseId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await pool.query(
      "UPDATE case_assignments SET ended_at='2026-10-25T12:00:00Z' WHERE id='SYNTH-ASSIGN-1'",
    );
    await expect(
      pool.query(
        "UPDATE case_assignments SET ended_at='2026-10-26T12:00:00Z' WHERE id='SYNTH-ASSIGN-1'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      pool.query(
        "INSERT INTO case_assignments(id,case_id,reviewer_reference,assigned_by) VALUES ('SYNTH-ASSIGN-2',$1,'SYNTH-REVIEWER-2','SYNTH-ASSIGNER')",
        [caseId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('binds decisions to the recorded maker, requires an independent checker and is immutable', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const caseId = await insertCase('DECISION', admissionId);
    await pool.query(
      `INSERT INTO case_assignments(id,case_id,reviewer_reference,assigned_by)
       VALUES ('SYNTH-DECISION-ASSIGNMENT',$1,'SYNTH-REVIEWER','SYNTH-ASSIGNER')`,
      [caseId],
    );
    const decisionSql = `INSERT INTO case_decisions (
      id,case_id,checker_reference,maker_reference,outcome,reason_code,explanation,policy_version
    ) VALUES ($1,$2,$3,$4,'APPROVED','SYNTH-REASON','Synthetic explanation','SYNTH-POLICY-V1')`;
    await expect(
      pool.query(decisionSql, [
        'SYNTH-CASE-DECISION-BAD-MAKER',
        caseId,
        'SYNTH-CHECKER',
        'SYNTH-NOT-THE-MAKER',
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(decisionSql, [
        'SYNTH-CASE-DECISION-SAME-ACTOR',
        caseId,
        'SYNTH-CASE-MAKER',
        'SYNTH-CASE-MAKER',
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(decisionSql, [
      'SYNTH-CASE-DECISION-1',
      caseId,
      'SYNTH-CHECKER',
      'SYNTH-CASE-MAKER',
    ]);
    await expect(
      pool.query(
        "UPDATE case_decisions SET explanation='SYNTH-TAMPERED' WHERE id='SYNTH-CASE-DECISION-1'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('validates appeal ownership, prevents duplicate pending appeals and records one outcome', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const targetCase = await insertCase('APPEAL-TARGET', admissionId, 'ADMISSION_CANCELLATION');
    const appealCase = await insertCase('APPEAL-1', admissionId, 'APPEAL');
    await pool.query(
      `INSERT INTO case_appeals(id,case_id,appealed_case_id,appellant_reference,appellant_role)
       VALUES ('SYNTH-APPEAL-1',$1,$2,'SYNTH-APPELLANT','INSTITUTION_OPERATOR')`,
      [appealCase, targetCase],
    );
    await expect(
      pool.query(
        "UPDATE case_appeals SET appellant_reference='SYNTH-TAMPERED' WHERE id='SYNTH-APPEAL-1'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await pool.query("UPDATE case_appeals SET outcome='UPHELD' WHERE id='SYNTH-APPEAL-1'");
    await expect(
      pool.query("UPDATE case_appeals SET outcome='OVERTURNED' WHERE id='SYNTH-APPEAL-1'"),
    ).rejects.toMatchObject({ code: '55000' });
    const pendingTarget = await insertCase(
      'APPEAL-PENDING-TARGET',
      admissionId,
      'CATEGORY_CORRECTION',
    );
    await pool.query("UPDATE admission_cases SET state='WITHDRAWN',version=2 WHERE id=$1", [
      appealCase,
    ]);
    const pendingAppeal = await insertCase('APPEAL-2', admissionId, 'APPEAL');
    await pool.query(
      `INSERT INTO case_appeals(id,case_id,appealed_case_id,appellant_reference,appellant_role)
       VALUES ('SYNTH-APPEAL-2',$1,$2,'SYNTH-APPELLANT','INSTITUTION_OPERATOR')`,
      [pendingAppeal, pendingTarget],
    );
    await pool.query("UPDATE admission_cases SET state='WITHDRAWN',version=2 WHERE id=$1", [
      pendingAppeal,
    ]);
    const duplicateAppeal = await insertCase('APPEAL-3', admissionId, 'APPEAL');
    await expect(
      pool.query(
        `INSERT INTO case_appeals(id,case_id,appealed_case_id,appellant_reference,appellant_role)
         VALUES ('SYNTH-APPEAL-3',$1,$2,'SYNTH-APPELLANT','INSTITUTION_OPERATOR')`,
        [duplicateAppeal, pendingTarget],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const otherAdmission = await seedAdmission('0002');
    const foreignAppealCase = await insertCase('APPEAL-FOREIGN', otherAdmission, 'APPEAL');
    await expect(
      pool.query(
        `INSERT INTO case_appeals(id,case_id,appealed_case_id,appellant_reference,appellant_role)
         VALUES ('SYNTH-APPEAL-FOREIGN',$1,$2,'SYNTH-APPELLANT','INSTITUTION_OPERATOR')`,
        [foreignAppealCase, targetCase],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps exactly one current admission version and validates immutable lineage', async () => {
    const admissionId = await seedAdmission();
    await pool.query(
      `INSERT INTO admission_versions(id,admission_id,version,lifecycle_status,snapshot,is_current)
       VALUES ('SYNTH-ADMISSION-VERSION-1',$1,1,'ACTIVE',$2,true)`,
      [admissionId, { state: 'SYNTH-V1' }],
    );
    await expect(
      pool.query(
        `INSERT INTO admission_versions(
          id,admission_id,version,predecessor_id,lifecycle_status,snapshot,is_current
        ) VALUES ('SYNTH-ADMISSION-VERSION-2',$1,2,'SYNTH-ADMISSION-VERSION-1','CANCELLED',$2,true)`,
        [admissionId, { state: 'SYNTH-V2' }],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await pool.query(
      "UPDATE admission_versions SET is_current=false WHERE id='SYNTH-ADMISSION-VERSION-1'",
    );
    await pool.query(
      `INSERT INTO admission_versions(
        id,admission_id,version,predecessor_id,lifecycle_status,snapshot,is_current
      ) VALUES ('SYNTH-ADMISSION-VERSION-2',$1,2,'SYNTH-ADMISSION-VERSION-1','CANCELLED',$2,true)`,
      [admissionId, { state: 'SYNTH-V2' }],
    );
    await expect(
      pool.query(
        "UPDATE admission_versions SET snapshot='{}' WHERE id='SYNTH-ADMISSION-VERSION-1'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      pool.query("DELETE FROM admission_versions WHERE id='SYNTH-ADMISSION-VERSION-2'"),
    ).rejects.toMatchObject({ code: '55000' });
    const otherAdmission = await seedAdmission('0002');
    await expect(
      pool.query(
        `INSERT INTO admission_versions(
          id,admission_id,version,predecessor_id,lifecycle_status,snapshot,is_current
        ) VALUES ('SYNTH-FOREIGN-LINEAGE',$1,2,'SYNTH-ADMISSION-VERSION-1','ACTIVE','{}',true)`,
        [otherAdmission],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('allows each case implementation once and preserves its receipt', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const caseId = await insertCase('IMPLEMENTATION', admissionId);
    await pool.query(
      `INSERT INTO case_implementations(
        id,case_id,implementation_type,receipt_reference,implemented_by,result
      ) VALUES ('SYNTH-IMPLEMENTATION-1',$1,'CORRECTION','SYNTH-RECEIPT-1',
        'SYNTH-IMPLEMENTER',$2)`,
      [caseId, { result: 'SYNTH-SUCCESS' }],
    );
    await expect(
      pool.query(
        `INSERT INTO case_implementations(
          id,case_id,implementation_type,receipt_reference,implemented_by,result
        ) VALUES ('SYNTH-IMPLEMENTATION-2',$1,'CORRECTION','SYNTH-RECEIPT-2',
          'SYNTH-IMPLEMENTER','{}')`,
        [caseId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        "UPDATE case_implementations SET receipt_reference='SYNTH-TAMPERED' WHERE id='SYNTH-IMPLEMENTATION-1'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('creates cases with exact concurrent replay, conflict detection and tenant-safe pagination', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const repository = new PostgresCaseworkRepository(pool);
    const authorization = new DeterministicAuthorizationSimulator();
    const create = new CreateCaseService(authorization, repository);
    const command = createCommand(admissionId, 'REPLAY');
    const [first, replay] = await Promise.all([create.execute(command), create.execute(command)]);
    expect(replay).toEqual(first);
    await expect(
      create.execute({ ...command, caseReference: 'SYNTH-DIFFERENT-CONTENT' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const persisted = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM casework_commands WHERE case_id=$1',
      [command.caseId],
    );
    expect(persisted.rows[0]?.count).toBe('1');

    await expect(
      new GetCaseService(repository).execute(
        actor('INSTITUTION_OPERATOR', 'OUTSIDE', 'SYNTH-INST-OUTSIDE'),
        command.caseId,
      ),
    ).rejects.toMatchObject({ finding: { code: 'TENANT_SCOPE_DENIED' } });

    const secondAdmission = await seedAdmission('0002');
    await create.execute({
      ...createCommand(secondAdmission, 'SECOND'),
      actor: actor('INSTITUTION_OPERATOR', 'SECOND-CREATE', 'SYNTH-INST-0002'),
      institutionId: 'SYNTH-INST-0002',
    });
    const listing = new ListCasesService(repository);
    const firstPage = await listing.execute(actor('AUDITOR', 'LIST', null), {
      afterCaseId: null,
      caseType: null,
      institutionId: null,
      limit: 1,
      state: null,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await listing.execute(actor('AUDITOR', 'LIST-2', null), {
      afterCaseId: firstPage.nextCursor,
      caseType: null,
      institutionId: null,
      limit: 1,
      state: null,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.caseId).not.toBe(firstPage.items[0]?.caseId);
    const institutionPage = await listing.execute(
      actor('INSTITUTION_OPERATOR', 'LIST-INSTITUTION', 'SYNTH-INST-0001'),
      {
        afterCaseId: null,
        caseType: 'ADMISSION_CORRECTION',
        institutionId: 'SYNTH-INST-0001',
        limit: 10,
        state: 'DRAFT',
      },
    );
    expect(institutionPage.items.map((item) => item.institutionId)).toEqual(['SYNTH-INST-0001']);
    const actions = new ExecuteCaseActionService(authorization, repository);
    const saveDraft: CaseActionCommand = {
      action: 'SAVE_DRAFT',
      actor: actor('INSTITUTION_OPERATOR', 'SAVE-DRAFT', 'SYNTH-INST-0001'),
      caseId: command.caseId,
      expectedVersion: 1,
      idempotencyKey: 'SYNTH-SAVE-DRAFT-KEY',
      priority: 'HIGH',
    };
    await expect(actions.execute(saveDraft)).resolves.toMatchObject({
      priority: 'HIGH',
      version: 2,
    });
    await expect(
      actions.execute({
        action: 'WITHDRAW',
        actor: actor('INSTITUTION_OPERATOR', 'WITHDRAW', 'SYNTH-INST-0001'),
        caseId: command.caseId,
        expectedVersion: 2,
        idempotencyKey: 'SYNTH-WITHDRAW-KEY',
      }),
    ).resolves.toMatchObject({ state: 'WITHDRAWN', version: 3 });
    await expect(actions.execute(saveDraft)).resolves.toMatchObject({
      priority: 'HIGH',
      state: 'DRAFT',
      version: 2,
    });
  });

  it('persists correction, evidence and purpose actions and rolls back partial writes', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const repository = new PostgresCaseworkRepository(pool);
    const service = new ExecuteCaseActionService(
      new DeterministicAuthorizationSimulator(),
      repository,
    );
    const created = await new CreateCaseService(
      new DeterministicAuthorizationSimulator(),
      repository,
    ).execute(createCommand(admissionId, 'CORRECTION'));
    const institutionActor = actor(
      'INSTITUTION_OPERATOR',
      'CORRECTION-PROPOSAL',
      'SYNTH-INST-0001',
    );
    const proposal: CaseActionCommand = {
      action: 'ADD_CORRECTION_PROPOSAL',
      actor: institutionActor,
      caseId: created.caseId,
      changes: [
        { fieldCode: 'CATEGORY', previousValue: 'ORDINARY', proposedValue: 'NRI' },
        {
          fieldCode: 'ACADEMIC_IDENTITY_REFERENCE',
          previousValue: 'SYNTH-IDENTITY-OLD',
          proposedValue: 'SYNTH-IDENTITY-NEW',
        },
      ],
      expectedVersion: 1,
      idempotencyKey: 'SYNTH-CORRECTION-PROPOSAL-KEY',
      proposalId: 'SYNTH-CORRECTION-PROPOSAL',
    };
    await expect(service.execute(proposal)).resolves.toMatchObject({ version: 2 });
    const impact = await pool.query<{
      capacity_may_change: boolean;
      identity_reverification_required: boolean;
      requires_policy_reevaluation: boolean;
    }>('SELECT * FROM correction_proposals WHERE id=$1', ['SYNTH-CORRECTION-PROPOSAL']);
    expect(impact.rows[0]).toMatchObject({
      capacity_may_change: true,
      identity_reverification_required: true,
      requires_policy_reevaluation: true,
    });
    await expect(
      service.execute({
        action: 'SAVE_DRAFT',
        actor: actor('INSTITUTION_OPERATOR', 'STALE', 'SYNTH-INST-0001'),
        caseId: created.caseId,
        expectedVersion: 1,
        idempotencyKey: 'SYNTH-STALE-KEY',
        priority: 'HIGH',
      }),
    ).rejects.toMatchObject({ code: 'CASE_VERSION_CONFLICT' });
    await service.execute({
      action: 'ADD_EVIDENCE',
      actor: actor('INSTITUTION_OPERATOR', 'EVIDENCE', 'SYNTH-INST-0001'),
      caseId: created.caseId,
      evidence: {
        evidenceId: 'SYNTH-EVIDENCE-1',
        malwareStatus: 'CLEAN',
        mediaType: 'application/pdf',
        objectReference: 'SYNTH-OBJECT-1',
        safeFilename: 'synthetic-evidence.pdf',
        sha256: 'b'.repeat(64),
      },
      expectedVersion: 2,
      idempotencyKey: 'SYNTH-EVIDENCE-KEY',
    });
    await service.execute({
      action: 'RECORD_PURPOSE',
      actor: actor('INSTITUTION_OPERATOR', 'PURPOSE', 'SYNTH-INST-0001'),
      caseId: created.caseId,
      expectedVersion: 3,
      idempotencyKey: 'SYNTH-PURPOSE-KEY',
      purposeRecord: {
        consentReference: null,
        consentStatus: null,
        dataCategories: ['SYNTH-ADMISSION-CATEGORY'],
        legalBasisCategory: 'SYNTH-REGULATORY-FUNCTION',
        purposeRecordId: 'SYNTH-PURPOSE-1',
        recipientCategory: 'SYNTH-AICTE-REVIEWER',
        retentionPolicyReference: 'SYNTH-RETENTION-PENDING-AUTHORITY',
      },
    });
    await expect(service.execute(proposal)).resolves.toMatchObject({ version: 2 });
    const failing: CaseActionCommand = {
      action: 'ADD_CORRECTION_PROPOSAL',
      actor: actor('INSTITUTION_OPERATOR', 'ROLLBACK', 'SYNTH-INST-0001'),
      caseId: created.caseId,
      changes: [
        { fieldCode: 'COURSE_ID', previousValue: 'SYNTH-A', proposedValue: 'SYNTH-B' },
        { fieldCode: 'COURSE_ID', previousValue: 'SYNTH-A', proposedValue: 'SYNTH-C' },
      ],
      expectedVersion: 4,
      idempotencyKey: 'SYNTH-ROLLBACK-KEY',
      proposalId: 'SYNTH-ROLLBACK-PROPOSAL',
    };
    await expect(service.execute(failing)).rejects.toMatchObject({ code: '23505' });
    const rollback = await pool.query<{ proposal_count: string; version: number }>(
      `SELECT c.version,
        (SELECT count(*)::text FROM correction_proposals WHERE id='SYNTH-ROLLBACK-PROPOSAL') AS proposal_count
       FROM admission_cases c WHERE c.id=$1`,
      [created.caseId],
    );
    expect(rollback.rows[0]).toEqual({ proposal_count: '0', version: 4 });
    await expect(
      service.execute({
        action: 'ADD_EVIDENCE',
        actor: actor('AUDITOR', 'AUDITOR-WRITE', null),
        caseId: created.caseId,
        evidence: {
          evidenceId: 'SYNTH-EVIDENCE-DENIED',
          malwareStatus: 'CLEAN',
          mediaType: 'application/pdf',
          objectReference: 'SYNTH-OBJECT-DENIED',
          safeFilename: 'synthetic-denied.pdf',
          sha256: 'c'.repeat(64),
        },
        expectedVersion: 4,
        idempotencyKey: 'SYNTH-AUDITOR-DENIED-KEY',
      }),
    ).rejects.toMatchObject({ finding: { code: 'ACTION_FORBIDDEN' } });
  });

  it('runs assignment, conflict, information, recommendation and checker decision workflow', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const repository = new PostgresCaseworkRepository(pool);
    const authorization = new DeterministicAuthorizationSimulator();
    const actions = new ExecuteCaseActionService(authorization, repository);
    const created = await new CreateCaseService(authorization, repository).execute(
      createCommand(admissionId, 'WORKFLOW'),
    );
    const institution = (suffix: string) =>
      actor('INSTITUTION_OPERATOR', suffix, 'SYNTH-INST-0001');
    const reviewer = (suffix: string) =>
      actor('AICTE_REVIEWER', suffix, null, 'SYNTH-REVIEWER-0001');
    const checker = (suffix: string, reference = 'SYNTH-CHECKER-0001') =>
      actor('AICTE_CHECKER', suffix, null, reference);

    await actions.execute({
      action: 'SUBMIT',
      actor: institution('SUBMIT-1'),
      caseId: created.caseId,
      expectedVersion: 1,
      idempotencyKey: 'SYNTH-WORKFLOW-SUBMIT-1',
    });
    await actions.execute({
      action: 'ASSIGN_REVIEWER',
      actor: checker('ASSIGN'),
      assignmentId: 'SYNTH-ASSIGNMENT-WORKFLOW-OLD',
      caseId: created.caseId,
      expectedVersion: 2,
      idempotencyKey: 'SYNTH-WORKFLOW-ASSIGN-OLD',
      reviewerReference: 'SYNTH-REVIEWER-OLD',
    });
    await actions.execute({
      action: 'ASSIGN_REVIEWER',
      actor: checker('REASSIGN'),
      assignmentId: 'SYNTH-ASSIGNMENT-WORKFLOW',
      caseId: created.caseId,
      expectedVersion: 3,
      idempotencyKey: 'SYNTH-WORKFLOW-REASSIGN',
      reviewerReference: 'SYNTH-REVIEWER-0001',
    });
    await actions.execute({
      action: 'START_REVIEW',
      actor: reviewer('START-1'),
      caseId: created.caseId,
      expectedVersion: 4,
      idempotencyKey: 'SYNTH-WORKFLOW-START-1',
    });
    await actions.execute({
      action: 'DECLARE_CONFLICT',
      actor: reviewer('CONFLICT-TRUE'),
      caseId: created.caseId,
      declarationId: 'SYNTH-CONFLICT-TRUE',
      expectedVersion: 5,
      hasConflict: true,
      idempotencyKey: 'SYNTH-WORKFLOW-CONFLICT-TRUE',
    });
    await expect(
      actions.execute({
        action: 'RECOMMEND',
        actor: reviewer('RECOMMEND-BLOCKED'),
        caseId: created.caseId,
        expectedVersion: 6,
        explanation: 'Synthetic blocked recommendation.',
        idempotencyKey: 'SYNTH-WORKFLOW-RECOMMEND-BLOCKED',
        policyVersion: 'SYNTH-POLICY-V1',
        reasonCode: 'SYNTH-BLOCKED',
        recommendation: 'APPROVE',
        recommendationId: 'SYNTH-RECOMMENDATION-BLOCKED',
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await actions.execute({
      action: 'DECLARE_CONFLICT',
      actor: reviewer('CONFLICT-FALSE'),
      caseId: created.caseId,
      declarationId: 'SYNTH-CONFLICT-FALSE',
      expectedVersion: 6,
      hasConflict: false,
      idempotencyKey: 'SYNTH-WORKFLOW-CONFLICT-FALSE',
    });
    await actions.execute({
      action: 'REQUEST_MORE_INFORMATION',
      actor: reviewer('MORE-INFORMATION'),
      caseId: created.caseId,
      expectedVersion: 7,
      idempotencyKey: 'SYNTH-WORKFLOW-MORE-INFORMATION',
      informationRequestId: 'SYNTH-INFORMATION-REQUEST-1',
      requestText: 'Provide synthetic supporting information.',
    });
    await actions.execute({
      action: 'SUPPLY_INFORMATION',
      actor: institution('SUPPLY-INFORMATION'),
      caseId: created.caseId,
      expectedVersion: 8,
      idempotencyKey: 'SYNTH-WORKFLOW-SUPPLY-INFORMATION',
      informationRequestId: 'SYNTH-INFORMATION-REQUEST-1',
      responseId: 'SYNTH-INFORMATION-RESPONSE-1',
      responseText: 'Synthetic supporting information supplied.',
    });
    await actions.execute({
      action: 'SUBMIT',
      actor: institution('SUBMIT-2'),
      caseId: created.caseId,
      expectedVersion: 9,
      idempotencyKey: 'SYNTH-WORKFLOW-SUBMIT-2',
    });
    await actions.execute({
      action: 'START_REVIEW',
      actor: reviewer('START-2'),
      caseId: created.caseId,
      expectedVersion: 10,
      idempotencyKey: 'SYNTH-WORKFLOW-START-2',
    });
    await actions.execute({
      action: 'RECOMMEND',
      actor: reviewer('RECOMMEND'),
      caseId: created.caseId,
      expectedVersion: 11,
      explanation: 'Synthetic recommendation.',
      idempotencyKey: 'SYNTH-WORKFLOW-RECOMMEND',
      policyVersion: 'SYNTH-POLICY-V1',
      reasonCode: 'SYNTH-VALID',
      recommendation: 'APPROVE',
      recommendationId: 'SYNTH-RECOMMENDATION-1',
    });
    await expect(
      actions.execute({
        action: 'DECIDE',
        actor: checker('DECIDE-SAME-REVIEWER', 'SYNTH-REVIEWER-0001'),
        caseId: created.caseId,
        decisionId: 'SYNTH-CASE-DECISION-BLOCKED',
        expectedVersion: 12,
        explanation: 'Synthetic invalid decision.',
        idempotencyKey: 'SYNTH-WORKFLOW-DECIDE-BLOCKED',
        outcome: 'APPROVED',
        policyVersion: 'SYNTH-POLICY-V1',
        reasonCode: 'SYNTH-INVALID',
      }),
    ).rejects.toMatchObject({ code: '23514' });
    const completed = await actions.execute({
      action: 'DECIDE',
      actor: checker('DECIDE'),
      caseId: created.caseId,
      decisionId: 'SYNTH-CASE-DECISION-WORKFLOW',
      expectedVersion: 12,
      explanation: 'Synthetic independent approval.',
      idempotencyKey: 'SYNTH-WORKFLOW-DECIDE',
      outcome: 'APPROVED',
      policyVersion: 'SYNTH-POLICY-V1',
      reasonCode: 'SYNTH-APPROVED',
    });
    expect(completed).toMatchObject({ state: 'APPROVED', version: 13 });
    const totals = await pool.query<{
      audits: string;
      assignments: string;
      histories: string;
      outbox: string;
      responses: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM business_audit_events WHERE aggregate_reference=$1) AS audits,
        (SELECT count(*)::text FROM case_assignments WHERE case_id=$1) AS assignments,
        (SELECT count(*)::text FROM case_state_history WHERE case_id=$1) AS histories,
        (SELECT count(*)::text FROM outbox_events WHERE aggregate_reference=$1) AS outbox,
        (SELECT count(*)::text FROM case_information_responses WHERE case_id=$1) AS responses`,
      [created.caseId],
    );
    expect(totals.rows[0]).toEqual({
      assignments: '2',
      audits: '13',
      histories: '13',
      outbox: '13',
      responses: '1',
    });
  });

  it('creates an appeal atomically with replay and blocks another active appeal', async () => {
    const admissionId = await seedAdmission();
    await insertPolicy('SYNTH-POLICY-V1');
    const repository = new PostgresCaseworkRepository(pool);
    const authorization = new DeterministicAuthorizationSimulator();
    const target = await new CreateCaseService(authorization, repository).execute(
      createCommand(admissionId, 'APPEAL-TARGET-SERVICE'),
    );
    const command = {
      actor: actor('INSTITUTION_OPERATOR', 'APPEAL-CREATE', 'SYNTH-INST-0001'),
      appealCaseId: 'SYNTH-SERVICE-APPEAL-CASE-1',
      appealId: 'SYNTH-SERVICE-APPEAL-1',
      appealedCaseId: target.caseId,
      appealedDecisionId: null,
      caseReference: 'SYNTH-SERVICE-APPEAL-REFERENCE-1',
      idempotencyKey: 'SYNTH-SERVICE-APPEAL-KEY-1',
      institutionId: 'SYNTH-INST-0001',
      policyAuthority: 'AUTHORITY_CONFIGURED' as const,
      policyVersion: 'SYNTH-POLICY-V1',
      priority: 'NORMAL' as const,
    };
    const service = new CreateAppealService(authorization, repository);
    const first = await service.execute(command);
    await expect(service.execute(command)).resolves.toEqual(first);
    await expect(
      service.execute({
        ...command,
        appealCaseId: 'SYNTH-SERVICE-APPEAL-CASE-2',
        appealId: 'SYNTH-SERVICE-APPEAL-2',
        caseReference: 'SYNTH-SERVICE-APPEAL-REFERENCE-2',
        idempotencyKey: 'SYNTH-SERVICE-APPEAL-KEY-2',
      }),
    ).rejects.toMatchObject({ code: '23505' });
    const actions = new ExecuteCaseActionService(authorization, repository);
    await actions.execute({
      action: 'SUBMIT',
      actor: actor('INSTITUTION_OPERATOR', 'APPEAL-SUBMIT', 'SYNTH-INST-0001'),
      caseId: first.caseId,
      expectedVersion: 1,
      idempotencyKey: 'SYNTH-APPEAL-SUBMIT-KEY',
    });
    await actions.execute({
      action: 'ASSIGN_REVIEWER',
      actor: actor('AICTE_CHECKER', 'APPEAL-ASSIGN', null),
      assignmentId: 'SYNTH-APPEAL-ASSIGNMENT',
      caseId: first.caseId,
      expectedVersion: 2,
      idempotencyKey: 'SYNTH-APPEAL-ASSIGN-KEY',
      reviewerReference: 'SYNTH-APPEAL-REVIEWER',
    });
    await actions.execute({
      action: 'START_REVIEW',
      actor: actor('AICTE_REVIEWER', 'APPEAL-START', null, 'SYNTH-APPEAL-REVIEWER'),
      caseId: first.caseId,
      expectedVersion: 3,
      idempotencyKey: 'SYNTH-APPEAL-START-KEY',
    });
    await actions.execute({
      action: 'DECLARE_CONFLICT',
      actor: actor('AICTE_REVIEWER', 'APPEAL-CONFLICT', null, 'SYNTH-APPEAL-REVIEWER'),
      caseId: first.caseId,
      declarationId: 'SYNTH-APPEAL-CONFLICT',
      expectedVersion: 4,
      hasConflict: false,
      idempotencyKey: 'SYNTH-APPEAL-CONFLICT-KEY',
    });
    await actions.execute({
      action: 'RECOMMEND',
      actor: actor('AICTE_REVIEWER', 'APPEAL-RECOMMEND', null, 'SYNTH-APPEAL-REVIEWER'),
      caseId: first.caseId,
      expectedVersion: 5,
      explanation: 'Synthetic appeal recommendation.',
      idempotencyKey: 'SYNTH-APPEAL-RECOMMEND-KEY',
      policyVersion: 'SYNTH-POLICY-V1',
      reasonCode: 'SYNTH-APPEAL-VALID',
      recommendation: 'APPROVE',
      recommendationId: 'SYNTH-APPEAL-RECOMMENDATION',
    });
    await expect(
      actions.execute({
        action: 'DECIDE',
        actor: actor('AICTE_CHECKER', 'APPEAL-WRONG-DECISION', null, 'SYNTH-APPEAL-CHECKER'),
        caseId: first.caseId,
        decisionId: 'SYNTH-APPEAL-WRONG-DECISION',
        expectedVersion: 6,
        explanation: 'Synthetic wrong decision route.',
        idempotencyKey: 'SYNTH-APPEAL-WRONG-DECISION-KEY',
        outcome: 'APPROVED',
        policyVersion: 'SYNTH-POLICY-V1',
        reasonCode: 'SYNTH-WRONG-ROUTE',
      }),
    ).rejects.toMatchObject({ name: 'CaseworkConflictError' });
    const decided = await actions.execute({
      action: 'DECIDE_APPEAL',
      actor: actor('AICTE_CHECKER', 'APPEAL-DECIDE', null, 'SYNTH-APPEAL-CHECKER'),
      appealOutcome: 'OVERTURNED',
      caseId: first.caseId,
      decisionId: 'SYNTH-APPEAL-DECISION',
      expectedVersion: 6,
      explanation: 'Synthetic appeal overturned.',
      idempotencyKey: 'SYNTH-APPEAL-DECIDE-KEY',
      policyVersion: 'SYNTH-POLICY-V1',
      reasonCode: 'SYNTH-APPEAL-OVERTURNED',
    });
    expect(decided).toMatchObject({ state: 'APPROVED', version: 7 });
    const counts = await pool.query<{
      appeals: string;
      cases: string;
      implementations: string;
      outcome: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM case_appeals) AS appeals,
        (SELECT count(*)::text FROM admission_cases WHERE case_type='APPEAL') AS cases,
        (SELECT count(*)::text FROM case_implementations WHERE case_id=$1) AS implementations,
        (SELECT outcome FROM case_appeals WHERE case_id=$1) AS outcome`,
      [first.caseId],
    );
    expect(counts.rows[0]).toEqual({
      appeals: '1',
      cases: '1',
      implementations: '0',
      outcome: 'OVERTURNED',
    });
  });

  it('cancels an approved admission once with exact concurrent replay and complete release', async () => {
    const sourceRoute = approval('0001', 'CANCEL-SOURCE');
    await importApproval(sourceRoute);
    const source = await submitAccepted(sourceRoute, 'CANCEL-SOURCE', undefined, 'NRI');
    await insertPolicy('SYNTH-POLICY-V1', {
      configuration: { cancellation: true },
    });
    const repository = new PostgresCaseworkRepository(pool);
    const approved = await approveGovernedCase(
      repository,
      source.admissionId,
      'SYNTH-INST-0001',
      'ADMISSION_CANCELLATION',
      'CANCEL',
    );
    const service = new ImplementCancellationService(
      new DeterministicAuthorizationSimulator(),
      repository,
    );
    const command = cancellationImplementation(approved.caseId, 'CANCEL');
    const [first, replay] = await Promise.all([service.execute(command), service.execute(command)]);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      implementationType: 'CANCELLATION',
      releasedReservationIds: expect.arrayContaining([
        `${source.admissionId}-NRI_WITHIN_ORDINARY`,
        `${source.admissionId}-ORDINARY`,
      ]),
      state: 'IMPLEMENTED',
    });
    await expect(
      service.execute({ ...command, receiptReference: 'SYNTH-DIFFERENT-RECEIPT' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const state = await pool.query<{
      admission_status: string;
      case_state: string;
      case_version: number;
      implementations: string;
      releases: string;
      current_lifecycle: string;
      current_versions: string;
    }>(
      `SELECT
        (SELECT lifecycle_status FROM admissions WHERE id=$1) AS admission_status,
        (SELECT state FROM admission_cases WHERE id=$2) AS case_state,
        (SELECT version FROM admission_cases WHERE id=$2) AS case_version,
        (SELECT count(*)::text FROM case_implementations WHERE case_id=$2) AS implementations,
        (SELECT count(*)::text FROM capacity_releases WHERE case_id=$2) AS releases,
        (SELECT lifecycle_status FROM admission_versions WHERE admission_id=$1 AND is_current) AS current_lifecycle,
        (SELECT count(*)::text FROM admission_versions WHERE admission_id=$1 AND is_current) AS current_versions`,
      [source.admissionId, approved.caseId],
    );
    expect(state.rows[0]).toEqual({
      admission_status: 'ACCEPTED',
      case_state: 'IMPLEMENTED',
      case_version: 8,
      implementations: '1',
      releases: '2',
      current_lifecycle: 'CANCELLED',
      current_versions: '1',
    });
    const counters = await pool.query<{ allocation_code: string; used_quantity: number }>(
      `SELECT allocation_code,used_quantity FROM capacity_allocations
       WHERE approval_snapshot_id=$1 AND allocation_code IN ('ORDINARY','NRI_WITHIN_ORDINARY')
       ORDER BY allocation_code`,
      [sourceRoute.id],
    );
    expect(counters.rows).toEqual([
      { allocation_code: 'NRI_WITHIN_ORDINARY', used_quantity: 0 },
      { allocation_code: 'ORDINARY', used_quantity: 0 },
    ]);
  });

  it('blocks unauthorised cancellation policy and rolls back a late receipt conflict', async () => {
    const route = approval('0001', 'CANCEL-ROLLBACK');
    await importApproval(route);
    const blockedSource = await submitAccepted(route, 'CANCEL-BLOCKED');
    await insertPolicy('SYNTH-POLICY-V1', { configuration: {} });
    const repository = new PostgresCaseworkRepository(pool);
    const blockedCase = await approveGovernedCase(
      repository,
      blockedSource.admissionId,
      'SYNTH-INST-0001',
      'ADMISSION_CANCELLATION',
      'CANCEL-BLOCKED',
    );
    const service = new ImplementCancellationService(
      new DeterministicAuthorizationSimulator(),
      repository,
    );
    await expect(
      service.execute(cancellationImplementation(blockedCase.caseId, 'CANCEL-BLOCKED')),
    ).rejects.toMatchObject({ code: 'POLICY_AUTHORITY_REQUIRED' });
    expect(
      (
        await pool.query<{ used_quantity: number }>(
          `SELECT used_quantity FROM capacity_allocations
           WHERE approval_snapshot_id=$1 AND allocation_code='ORDINARY'`,
          [route.id],
        )
      ).rows[0]?.used_quantity,
    ).toBe(1);

    await pool.query(
      `INSERT INTO case_implementations(
        id,case_id,implementation_type,receipt_reference,implemented_by,result
      ) VALUES ('SYNTH-RECEIPT-HOLDER',$1,'CANCELLATION','SYNTH-DUPLICATE-RECEIPT',
        'SYNTH-FAILURE-INJECTION','{}')`,
      [blockedCase.caseId],
    );
    await insertPolicy('SYNTH-POLICY-V2', {
      configuration: { cancellation: true },
      key: 'SYNTH-CANCELLATION-CONFIGURED',
    });
    const rollbackSource = await submitAccepted(route, 'CANCEL-ROLLBACK');
    const rollbackCase = await approveGovernedCase(
      repository,
      rollbackSource.admissionId,
      'SYNTH-INST-0001',
      'ADMISSION_CANCELLATION',
      'CANCEL-ROLLBACK',
      'SYNTH-POLICY-V2',
    );
    await expect(
      service.execute({
        ...cancellationImplementation(rollbackCase.caseId, 'CANCEL-ROLLBACK'),
        receiptReference: 'SYNTH-DUPLICATE-RECEIPT',
      }),
    ).rejects.toMatchObject({ code: '23505' });
    const rollback = await pool.query<{
      case_state: string;
      current_lifecycle: string;
      releases: string;
      used_quantity: number;
    }>(
      `SELECT
        (SELECT state FROM admission_cases WHERE id=$1) AS case_state,
        (SELECT lifecycle_status FROM admission_versions WHERE admission_id=$2 AND is_current) AS current_lifecycle,
        (SELECT count(*)::text FROM capacity_releases WHERE case_id=$1) AS releases,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$3 AND allocation_code='ORDINARY') AS used_quantity`,
      [rollbackCase.caseId, rollbackSource.admissionId, route.id],
    );
    expect(rollback.rows[0]).toEqual({
      case_state: 'APPROVED',
      current_lifecycle: 'ACTIVE',
      releases: '0',
      used_quantity: 2,
    });
  });

  it('does not release capacity for a cancellation case that is not approved', async () => {
    const route = approval('0001', 'CANCEL-NOT-APPROVED');
    await importApproval(route);
    const source = await submitAccepted(route, 'CANCEL-NOT-APPROVED');
    await insertPolicy('SYNTH-POLICY-V1', { configuration: { cancellation: true } });
    const repository = new PostgresCaseworkRepository(pool);
    const created = await new CreateCaseService(
      new DeterministicAuthorizationSimulator(),
      repository,
    ).execute({
      ...createCommand(source.admissionId, 'CANCEL-NOT-APPROVED'),
      caseType: 'ADMISSION_CANCELLATION',
    });
    await expect(
      new ImplementCancellationService(
        new DeterministicAuthorizationSimulator(),
        repository,
      ).execute({
        ...cancellationImplementation(created.caseId, 'CANCEL-NOT-APPROVED'),
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ name: 'CaseworkConflictError' });
    const unchanged = await pool.query<{
      current_lifecycle: string;
      releases: string;
      used_quantity: number;
    }>(
      `SELECT
        (SELECT lifecycle_status FROM admission_versions WHERE admission_id=$1 AND is_current) AS current_lifecycle,
        (SELECT count(*)::text FROM capacity_releases WHERE case_id=$2) AS releases,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$3 AND allocation_code='ORDINARY') AS used_quantity`,
      [source.admissionId, created.caseId, route.id],
    );
    expect(unchanged.rows[0]).toEqual({
      current_lifecycle: 'ACTIVE',
      releases: '0',
      used_quantity: 1,
    });
  });

  it('transfers within an institution by reserving target capacity before releasing source', async () => {
    const sourceRoute = approval('0001', 'TRANSFER-SOURCE');
    const targetRoute = approval('0001', 'TRANSFER-TARGET');
    await importApproval(sourceRoute);
    await importApproval(targetRoute);
    const source = await submitAccepted(sourceRoute, 'TRANSFER-SOURCE');
    await insertPolicy('SYNTH-POLICY-V1', {
      configuration: { sameInstitutionTransfer: true },
    });
    const repository = new PostgresCaseworkRepository(pool);
    const approved = await approveGovernedCase(
      repository,
      source.admissionId,
      'SYNTH-INST-0001',
      'PROGRAMME_OR_COURSE_TRANSFER',
      'TRANSFER-SAME',
    );
    const targetSubmission = submission(
      targetRoute,
      'TRANSFER-TARGET',
      'SYNTH-STUDENT-TRANSFER-SOURCE',
    );
    const command = transferImplementation(approved.caseId, targetSubmission, 'TRANSFER-SAME');
    const service = new ImplementTransferService(
      new DeterministicAuthorizationSimulator(),
      repository,
    );
    const [first, replay] = await Promise.all([service.execute(command), service.execute(command)]);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      implementationType: 'TRANSFER',
      sourceAdmissionId: source.admissionId,
      targetAdmissionId: command.targetReferences.admissionId,
      targetDecisionId: command.targetReferences.decisionId,
    });
    const state = await pool.query<{
      source_current: string;
      source_used: number;
      target_approval: string;
      target_current: string;
      target_decision: string;
      target_used: number;
      transfers: string;
    }>(
      `SELECT
        (SELECT lifecycle_status FROM admission_versions WHERE admission_id=$1 AND is_current) AS source_current,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$2 AND allocation_code='ORDINARY') AS source_used,
        (SELECT approval_snapshot_id FROM admissions WHERE id=$3) AS target_approval,
        (SELECT lifecycle_status FROM admission_versions WHERE admission_id=$3 AND is_current) AS target_current,
        (SELECT target_decision_id FROM admission_transfers WHERE case_id=$4) AS target_decision,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$5 AND allocation_code='ORDINARY') AS target_used,
        (SELECT count(*)::text FROM admission_transfers WHERE case_id=$4) AS transfers`,
      [
        source.admissionId,
        sourceRoute.id,
        command.targetReferences.admissionId,
        approved.caseId,
        targetRoute.id,
      ],
    );
    expect(state.rows[0]).toEqual({
      source_current: 'TRANSFERRED',
      source_used: 0,
      target_approval: targetRoute.id,
      target_current: 'ACTIVE',
      target_decision: command.targetReferences.decisionId,
      target_used: 1,
      transfers: '1',
    });
  });

  it('preserves source capacity when transfer target is full and blocks unconfigured cross-institution transfer', async () => {
    const sourceRoute = approval('0001', 'TRANSFER-FULL-SOURCE');
    const fullTarget = approval('0001', 'TRANSFER-FULL-TARGET', 1);
    await importApproval(sourceRoute);
    await importApproval(fullTarget);
    const source = await submitAccepted(sourceRoute, 'TRANSFER-FULL-SOURCE');
    await submitAccepted(fullTarget, 'TRANSFER-FILLER');
    await insertPolicy('SYNTH-POLICY-V1', {
      configuration: { sameInstitutionTransfer: true },
    });
    const repository = new PostgresCaseworkRepository(pool);
    const approved = await approveGovernedCase(
      repository,
      source.admissionId,
      'SYNTH-INST-0001',
      'PROGRAMME_OR_COURSE_TRANSFER',
      'TRANSFER-FULL',
    );
    const command = transferImplementation(
      approved.caseId,
      submission(fullTarget, 'TRANSFER-FULL-TARGET', 'SYNTH-STUDENT-TRANSFER-FULL-SOURCE'),
      'TRANSFER-FULL',
    );
    await expect(
      new ImplementTransferService(new DeterministicAuthorizationSimulator(), repository).execute(
        command,
      ),
    ).rejects.toMatchObject({ name: 'CaseworkConflictError' });
    const rollback = await pool.query<{
      case_state: string;
      releases: string;
      source_used: number;
      target_admissions: string;
      target_used: number;
    }>(
      `SELECT
        (SELECT state FROM admission_cases WHERE id=$1) AS case_state,
        (SELECT count(*)::text FROM capacity_releases WHERE case_id=$1) AS releases,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$2 AND allocation_code='ORDINARY') AS source_used,
        (SELECT count(*)::text FROM admissions WHERE id=$3) AS target_admissions,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$4 AND allocation_code='ORDINARY') AS target_used`,
      [approved.caseId, sourceRoute.id, command.targetReferences.admissionId, fullTarget.id],
    );
    expect(rollback.rows[0]).toEqual({
      case_state: 'APPROVED',
      releases: '0',
      source_used: 1,
      target_admissions: '0',
      target_used: 1,
    });

    const crossTarget = approval('0002', 'TRANSFER-CROSS-BLOCKED');
    await importApproval(crossTarget);
    const crossSource = await submitAccepted(sourceRoute, 'TRANSFER-CROSS-BLOCKED-SOURCE');
    const crossCase = await approveGovernedCase(
      repository,
      crossSource.admissionId,
      'SYNTH-INST-0001',
      'INSTITUTION_TRANSFER',
      'TRANSFER-CROSS-BLOCKED',
    );
    await expect(
      new ImplementTransferService(new DeterministicAuthorizationSimulator(), repository).execute(
        transferImplementation(
          crossCase.caseId,
          submission(
            crossTarget,
            'TRANSFER-CROSS-BLOCKED',
            'SYNTH-STUDENT-TRANSFER-CROSS-BLOCKED-SOURCE',
          ),
          'TRANSFER-CROSS-BLOCKED',
        ),
      ),
    ).rejects.toMatchObject({ code: 'POLICY_AUTHORITY_REQUIRED' });
  });

  it('rejects a transfer back to the same route without changing capacity', async () => {
    const route = approval('0001', 'TRANSFER-SELF');
    await importApproval(route);
    const source = await submitAccepted(route, 'TRANSFER-SELF-SOURCE');
    await insertPolicy('SYNTH-POLICY-V1', {
      configuration: { sameInstitutionTransfer: true },
    });
    const repository = new PostgresCaseworkRepository(pool);
    const approved = await approveGovernedCase(
      repository,
      source.admissionId,
      'SYNTH-INST-0001',
      'PROGRAMME_OR_COURSE_TRANSFER',
      'TRANSFER-SELF',
    );
    const command = transferImplementation(
      approved.caseId,
      submission(route, 'TRANSFER-SELF-TARGET', 'SYNTH-STUDENT-TRANSFER-SELF-SOURCE'),
      'TRANSFER-SELF',
    );
    await expect(
      new ImplementTransferService(new DeterministicAuthorizationSimulator(), repository).execute(
        command,
      ),
    ).rejects.toMatchObject({ name: 'CaseworkConflictError' });
    const unchanged = await pool.query<{
      releases: string;
      target_admissions: string;
      used_quantity: number;
    }>(
      `SELECT
        (SELECT count(*)::text FROM capacity_releases WHERE case_id=$1) AS releases,
        (SELECT count(*)::text FROM admissions WHERE id=$2) AS target_admissions,
        (SELECT used_quantity FROM capacity_allocations WHERE approval_snapshot_id=$3 AND allocation_code='ORDINARY') AS used_quantity`,
      [approved.caseId, command.targetReferences.admissionId, route.id],
    );
    expect(unchanged.rows[0]).toEqual({
      releases: '0',
      target_admissions: '0',
      used_quantity: 1,
    });
  });

  it('permits a cross-institution transfer only with explicit synthetic authority configuration', async () => {
    const sourceRoute = approval('0001', 'TRANSFER-CROSS-SOURCE');
    const targetRoute = approval('0002', 'TRANSFER-CROSS-TARGET');
    await importApproval(sourceRoute);
    await importApproval(targetRoute);
    const source = await submitAccepted(sourceRoute, 'TRANSFER-CROSS-SOURCE');
    await insertPolicy('SYNTH-POLICY-V1', {
      configuration: { crossInstitutionTransfer: true },
    });
    const repository = new PostgresCaseworkRepository(pool);
    const approved = await approveGovernedCase(
      repository,
      source.admissionId,
      'SYNTH-INST-0001',
      'INSTITUTION_TRANSFER',
      'TRANSFER-CROSS',
    );
    const command = transferImplementation(
      approved.caseId,
      submission(targetRoute, 'TRANSFER-CROSS-TARGET', 'SYNTH-STUDENT-TRANSFER-CROSS-SOURCE'),
      'TRANSFER-CROSS',
    );
    const result = await new ImplementTransferService(
      new DeterministicAuthorizationSimulator(),
      repository,
    ).execute(command);
    expect(result).toMatchObject({
      sourceAdmissionId: source.admissionId,
      state: 'IMPLEMENTED',
      targetAdmissionId: command.targetReferences.admissionId,
    });
    const target = await pool.query<{ institution_id: string }>(
      'SELECT institution_id FROM admissions WHERE id=$1',
      [command.targetReferences.admissionId],
    );
    expect(target.rows[0]?.institution_id).toBe('SYNTH-INST-0002');
  });
});
