import { createHash } from 'node:crypto';
import {
  ImportApprovalSnapshotService,
  PostgresAdmissionStore,
  SubmitAdmissionService,
  type ReferenceGenerator,
  readDatabaseConfig,
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
  type ApprovalSnapshot,
} from '@apaar-platform/admission-domain';
import { createReferencePool, runReferenceMigrations } from './reference-persistence.js';

function approval(): ApprovalSnapshot {
  const institutionId = asInstitutionId('SYNTH-INSTITUTION-001');
  const campusId = asCampusId('SYNTH-CAMPUS-001');
  const programmeId = asProgrammeId('SYNTH-PROGRAMME-001');
  return {
    academicYear: asAcademicYear('2026-27'),
    approvedBy: 'SYNTH-AUTHORITY-001',
    campus: { id: campusId, institutionId, name: 'Synthetic Main Campus' },
    course: {
      campusId,
      id: asCourseId('SYNTH-COURSE-001'),
      mode: 'REGULAR',
      name: 'Synthetic Engineering Course',
      programmeId,
    },
    effectiveFrom: asIsoDate('2026-04-01'),
    effectiveTo: asIsoDate('2027-03-31'),
    fnOciGulf: {
      approved: true,
      combinedTotalCapacity: 9,
      foreignAndOciCapacity: 6,
      foreignNationalAcrossRoutesMaximum: 9,
      gulfCapacity: 3,
    },
    id: asApprovalSnapshotId('SYNTH-APPROVAL-001'),
    importBatchReference: 'SYNTH-IMPORT-001',
    institution: { id: institutionId, name: 'Synthetic Institute of Technology' },
    lateral: { approved: true, firstYearVacancyCapacity: 2, supernumeraryCapacity: 6 },
    nri: { approved: true, maximumWithinOrdinary: 3 },
    ordinaryIntake: 60,
    pmUspy: { approved: true, courseCapacity: 2, institutionCapacity: 10 },
    policyVersion: 'SYNTH-POLICY-2026',
    programme: { id: programmeId, level: 'UNDERGRADUATE', name: 'Synthetic Programme' },
    receivedAt: asIsoDateTime('2026-04-02T09:00:00.000Z'),
    sourceHash: 'SYNTH-SOURCE-HASH-001',
    sourceRecordId: 'SYNTH-SOURCE-RECORD-001',
    sourceSystem: 'SYNTHETIC-SOURCE',
    supersededBy: null,
    tfw: { approved: true, capacity: 3, precedingYearMinimumFillSatisfied: true },
  };
}

const config = readDatabaseConfig(process.env);
const parsed = new URL(config.connectionString);
const databaseName = parsed.pathname.slice(1).toLowerCase();
if (!databaseName.includes('synth') && !databaseName.includes('local')) {
  throw new Error('Synthetic seed refuses a database whose name lacks synth or local.');
}

const pool = createReferencePool(config);
await runReferenceMigrations(pool);
const admissionStore = new PostgresAdmissionStore(pool);
const seedVersion = 'SYNTH-REFERENCE-SEED-1';
const digest = createHash('sha256').update(JSON.stringify(approval())).digest('hex');
const prior = await pool.query('SELECT 1 FROM runtime_seed_state WHERE seed_reference=$1', [
  seedVersion,
]);
if (prior.rowCount === 0) {
  await new ImportApprovalSnapshotService(admissionStore).execute({
    snapshot: approval(),
  });
  await pool.query(
    `INSERT INTO institutions(id,name) VALUES
       ('SYNTH-INSTITUTION-002','Synthetic Regional Institute'),
       ('SYNTH-INSTITUTION-003','Synthetic Degraded Institute'),
       ('SYNTH-INSTITUTION-004','Synthetic Paused Institute')
     ON CONFLICT(id) DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO campuses(id,institution_id,name) VALUES
       ('SYNTH-CAMPUS-002','SYNTH-INSTITUTION-002','Synthetic Regional Campus'),
       ('SYNTH-CAMPUS-003','SYNTH-INSTITUTION-003','Synthetic Degraded Campus'),
       ('SYNTH-CAMPUS-004','SYNTH-INSTITUTION-004','Synthetic Paused Campus')
     ON CONFLICT(id) DO NOTHING`,
  );
  await pool.query(
    'INSERT INTO runtime_seed_state(seed_reference,seed_version,digest_sha256) VALUES($1,$2,$3)',
    [seedVersion, '1', digest],
  );
  process.stdout.write(`seed=${seedVersion} applied\n`);
} else {
  process.stdout.write(`seed=${seedVersion} current\n`);
}

const referenceAdmission = await new SubmitAdmissionService(
  {
    clock: {
      now: (): ReturnType<typeof asIsoDateTime> => asIsoDateTime('2026-07-01T08:00:00.000Z'),
    },
    unitOfWork: admissionStore,
  },
  {
    next(kind: Parameters<ReferenceGenerator['next']>[0]): string {
      const references: Record<Parameters<ReferenceGenerator['next']>[0], string> = {
        ADMISSION: 'SYNTH-ADMISSION-REFERENCE-001',
        AUDIT: 'SYNTH-AUDIT-REFERENCE-001',
        DECISION: 'SYNTH-DECISION-REFERENCE-001',
        IDENTITY: 'SYNTH-IDENTITY-REFERENCE-001',
        OUTBOX: 'SYNTH-OUTBOX-REFERENCE-001',
        REGISTRATION: 'SYNTH-REGISTRATION-001',
      };
      return references[kind];
    },
  },
).execute({
  admission: {
    academicYear: asAcademicYear('2026-27'),
    admissionDate: asIsoDate('2026-07-01'),
    campusId: asCampusId('SYNTH-CAMPUS-001'),
    category: 'ORDINARY',
    commandId: asAdmissionCommandId('SYNTH-CMD-REFERENCE-001'),
    courseId: asCourseId('SYNTH-COURSE-001'),
    categoryEvidenceCheck: {
      method: 'SYNTHETIC_FIXTURE',
      evidenceReference: 'SYNTH-CATEGORY-EVIDENCE',
      reviewerReference: 'SYNTH-REVIEWER',
      checkedAt: asIsoDateTime('2026-07-01T00:00:00Z'),
    },
    eligibilityEvidence: 'VERIFIED',
    identityVerification: {
      checkedAt: asIsoDateTime('2026-07-01T08:00:00.000Z'),
      providerContractVersion: 'SYNTH-IDENTITY-1',
      providerRequestReference: 'SYNTH-IDENTITY-REQUEST-REFERENCE-001',
      status: 'VERIFIED',
    },
    institutionId: asInstitutionId('SYNTH-INSTITUTION-001'),
    lateralCapacitySource: null,
    lifecycleStatus: 'DRAFT',
    programmeId: asProgrammeId('SYNTH-PROGRAMME-001'),
    studentKey: asStudentKey('SYNTH-STUDENT-REFERENCE-001'),
    studentStatus: {
      foreignNational: false,
      gulfWorkerChild: false,
      nri: false,
      oci: false,
    },
  },
  context: {
    actorReference: 'SYNTH-SEED-ACTOR-001',
    correlationReference: 'SYNTH-SEED-CORRELATION-001',
    idempotencyKey: 'SYNTH-SEED-ADMISSION-001',
    institutionId: asInstitutionId('SYNTH-INSTITUTION-001'),
    reason: 'SYNTHETIC_REFERENCE_ADMISSION',
    requestHash: createHash('sha256').update('SYNTH-SEED-ADMISSION-001').digest('hex'),
    requestReference: 'SYNTH-SEED-REQUEST-001',
  },
});
if (referenceAdmission.admissionReference !== 'SYNTH-REGISTRATION-001') {
  throw new Error(
    'Synthetic reference admission did not produce the stable registration reference.',
  );
}
await pool.query(`
  INSERT INTO casework_policy_versions(
    id,policy_key,policy_version,authority,source_reference,effective_from,effective_to,
    scope,configuration,activation_status,activated_by,checker_reference
  ) VALUES(
    'SYNTH-POLICY-REFERENCE-001','SYNTH-CASEWORK','SYNTH-POLICY-2026-01',
    'AUTHORITY_CONFIGURED','SYNTH-AUTHORITY-CONFIGURATION-001','2026-01-01','2027-12-31',
    '{"institutionType":"SYNTHETIC"}',
    '{"workflow":"SYNTH-MAKER-CHECKER","cancellation":true,"sameInstitutionTransfer":false,"crossInstitutionTransfer":false}',
    'ACTIVE','SYNTH-POLICY-MAKER-001','SYNTH-POLICY-CHECKER-001'
  ) ON CONFLICT(id) DO NOTHING;

  INSERT INTO pilot_configurations(
    pilot_reference,version,cohort_reference,institution_id,campus_ids,effective_from,effective_to,
    enabled_capabilities,template_version,api_version,maximum_batch_rows,maximum_daily_submissions,
    global_kill_switch,institution_kill_switch,state,maker_reference,checker_reference
  ) VALUES(
    'SYNTH-PILOT-REFERENCE-001',1,'SYNTH-COHORT-REFERENCE-001','SYNTH-INSTITUTION-001',
    '["SYNTH-CAMPUS-001"]','2026-10-01','2027-03-31','["BATCH_UPLOAD","CASEWORK"]',
    '1.0','v1',10000,100,false,false,'ACTIVE','SYNTH-PILOT-MAKER-001','SYNTH-PILOT-CHECKER-001'
  ) ON CONFLICT(pilot_reference,version) DO NOTHING;

  INSERT INTO pilot_readiness_assessments(
    pilot_reference,pilot_version,outcome,checks,assessed_at,actor_reference
  ) SELECT 'SYNTH-PILOT-REFERENCE-001',1,'PASS','[]','2026-10-26T08:00:00.000Z',
           'SYNTH-PILOT-MAKER-001'
    WHERE NOT EXISTS(
      SELECT 1 FROM pilot_readiness_assessments
      WHERE pilot_reference='SYNTH-PILOT-REFERENCE-001' AND pilot_version=1
    );

  INSERT INTO pilot_executions(
    execution_reference,version,pilot_reference,pilot_version,cohort_reference,scheduled_start,
    scheduled_end,operational_owner_references,state,stop_controls,authority_mode,maker_reference,
    checker_reference,event_code,actor_reference
  ) VALUES(
    'SYNTH-EXECUTION-REFERENCE-001',1,'SYNTH-PILOT-REFERENCE-001',1,
    'SYNTH-COHORT-REFERENCE-001','2026-10-26T09:00:00.000Z','2026-10-26T17:00:00.000Z',
    '["SYNTH-OWNER-001"]','COMPLETED',
    '{"globalStopped":false,"cohortStopped":true,"institutionStops":[]}',
    'SYNTHETIC_ONLY','SYNTH-EXECUTION-MAKER-001','SYNTH-EXECUTION-CHECKER-001',
    'EXECUTION_COMPLETED','SYNTH-EXECUTION-CHECKER-001'
  ) ON CONFLICT(execution_reference,version) DO NOTHING;

  INSERT INTO pilot_execution_participation(
    execution_reference,execution_version,institution_id,campus_ids,readiness,
    approval_data_fresh,identity_dependency
  ) VALUES(
    'SYNTH-EXECUTION-REFERENCE-001',1,'SYNTH-INSTITUTION-001','["SYNTH-CAMPUS-001"]',
    'READY',true,'READY'
  ) ON CONFLICT(execution_reference,execution_version,institution_id) DO NOTHING;

  INSERT INTO pilot_completion_reports(
    report_reference,execution_reference,execution_version,classification,reconciliation,
    authority_decision_required,actor_reference,completed_at
  ) VALUES(
    'SYNTH-COMPLETION-REPORT-001','SYNTH-EXECUTION-REFERENCE-001',1,
    'AUTHORITY_REVIEW_REQUIRED','{"sourceRows":4,"acceptedRows":1,"rejectedRows":0,"drift":0}',
    true,'SYNTH-EXECUTION-CHECKER-001','2026-10-26T17:00:00.000Z'
  ) ON CONFLICT(report_reference) DO NOTHING;
`);
// Explicit local policy grants for synthetic acceptance journeys; not statutory authority.
for (const [reference, purpose] of [
  ['SYNTH-LEGAL-BASIS-001', 'SYNTH-PORTAL-ACCEPTANCE'],
  ['SYNTH-LEGAL-BASIS-FULL-001', 'SYNTH-FULL-SYSTEM'],
]) {
  await pool.query(
    `INSERT INTO verification_authorization_grants(reference,issuer_reference,payload)
     VALUES($1,'SYNTH-LOCAL-POLICY-ISSUER',$2) ON CONFLICT(reference) DO NOTHING`,
    [
      reference,
      {
        reference,
        kind: 'LEGAL_BASIS',
        admissionReference: null,
        institutionReference: 'SYNTH-INSTITUTION-001',
        recipientOrganisation: 'SYNTH-VERIFIER-ORG',
        purpose,
        claims: ['ADMISSION_EXISTS', 'CURRENT_STATUS'],
        validFrom: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-12-31T23:59:59.000Z',
      },
    ],
  );
}
await pool.end();
