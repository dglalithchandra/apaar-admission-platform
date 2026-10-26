CREATE TABLE pilot_executions (
  execution_reference text NOT NULL CHECK (execution_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  version integer NOT NULL CHECK (version > 0),
  pilot_reference text NOT NULL,
  pilot_version integer NOT NULL,
  cohort_reference text NOT NULL CHECK (cohort_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  operational_owner_references jsonb NOT NULL CHECK (
    jsonb_typeof(operational_owner_references)='array' AND
    jsonb_array_length(operational_owner_references)>0
  ),
  state text NOT NULL CHECK (state IN (
    'PLANNED','GO_LIVE_REVIEW','APPROVED','RUNNING','PAUSED','INCIDENT','COMPLETED','TERMINATED'
  )),
  stop_controls jsonb NOT NULL CHECK (jsonb_typeof(stop_controls)='object'),
  authority_mode text NOT NULL CHECK (authority_mode='SYNTHETIC_ONLY'),
  maker_reference text NOT NULL CHECK (maker_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  checker_reference text,
  event_code text NOT NULL,
  actor_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (execution_reference,version),
  FOREIGN KEY (pilot_reference,pilot_version)
    REFERENCES pilot_configurations(pilot_reference,version),
  CHECK (scheduled_end >= scheduled_start),
  CHECK (checker_reference IS NULL OR checker_reference <> maker_reference)
);

CREATE TABLE pilot_execution_commands (
  idempotency_key text PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  execution_reference text NOT NULL,
  execution_version integer NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY (execution_reference,execution_version)
    REFERENCES pilot_executions(execution_reference,version)
);

CREATE TABLE pilot_go_no_go_assessments (
  assessment_reference text PRIMARY KEY CHECK (assessment_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  execution_reference text NOT NULL,
  execution_version integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PASS','FAIL','MANUAL_REVIEW')),
  startable boolean NOT NULL,
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks)='array'),
  actor_reference text NOT NULL,
  assessed_at timestamptz NOT NULL,
  FOREIGN KEY (execution_reference,execution_version)
    REFERENCES pilot_executions(execution_reference,version)
);

CREATE TABLE pilot_execution_participation (
  execution_reference text NOT NULL,
  execution_version integer NOT NULL,
  institution_id text NOT NULL REFERENCES institutions(id),
  campus_ids jsonb NOT NULL CHECK (jsonb_typeof(campus_ids)='array'),
  readiness text NOT NULL CHECK (readiness IN ('READY','BLOCKED','DEGRADED','PAUSED')),
  approval_data_fresh boolean NOT NULL,
  identity_dependency text NOT NULL CHECK (identity_dependency IN ('READY','DEGRADED','OUTAGE')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (execution_reference,execution_version,institution_id),
  FOREIGN KEY (execution_reference,execution_version)
    REFERENCES pilot_executions(execution_reference,version)
);

CREATE TABLE pilot_worker_jobs (
  job_reference text PRIMARY KEY CHECK (job_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  execution_reference text NOT NULL,
  job_type text NOT NULL CHECK (job_type IN (
    'ONBOARDING_CHECK','MIGRATION_RECONCILIATION','SUBMISSION_MONITORING',
    'NOTIFICATION_PROCESSING','CASEWORK_SNAPSHOT','EXIT_RECONCILIATION'
  )),
  institution_id text REFERENCES institutions(id),
  state text NOT NULL CHECK (state IN ('PENDING','IN_FLIGHT','RETRYABLE','COMPLETED','DEAD_LETTER')),
  checkpoint jsonb NOT NULL DEFAULT '{}',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  maximum_attempts integer NOT NULL CHECK (maximum_attempts BETWEEN 1 AND 20),
  batch_limit integer NOT NULL CHECK (batch_limit BETWEEN 1 AND 10000),
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_until timestamptz,
  last_problem_code text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE pilot_worker_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_reference text NOT NULL REFERENCES pilot_worker_jobs(job_reference),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('CLAIMED','CHECKPOINTED','RETRYABLE','COMPLETED','DEAD_LETTER')),
  checkpoint jsonb NOT NULL,
  worker_reference text NOT NULL CHECK (worker_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  problem_code text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE pilot_evidence_snapshots (
  evidence_reference text PRIMARY KEY CHECK (evidence_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  execution_reference text NOT NULL,
  institution_id text REFERENCES institutions(id),
  evidence jsonb NOT NULL,
  actor_reference text NOT NULL,
  captured_at timestamptz NOT NULL
);

CREATE TABLE pilot_incidents (
  incident_reference text PRIMARY KEY CHECK (incident_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  execution_reference text NOT NULL,
  cohort_reference text NOT NULL CHECK (cohort_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  severity text NOT NULL CHECK (severity IN ('SEV1','SEV2','SEV3','SEV4')),
  affected_capabilities jsonb NOT NULL CHECK (jsonb_typeof(affected_capabilities)='array'),
  owner_reference text NOT NULL CHECK (owner_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  stop_action text NOT NULL CHECK (stop_action IN ('AUTOMATIC','MANUAL')),
  declared_at timestamptz NOT NULL
);

CREATE TABLE pilot_incident_timeline (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_reference text NOT NULL REFERENCES pilot_incidents(incident_reference),
  event_code text NOT NULL,
  explanation text NOT NULL,
  evidence_references jsonb NOT NULL CHECK (jsonb_typeof(evidence_references)='array'),
  recovery_checks jsonb NOT NULL CHECK (jsonb_typeof(recovery_checks)='array'),
  actor_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE pilot_expansion_decisions (
  expansion_reference text PRIMARY KEY CHECK (expansion_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  execution_reference text NOT NULL,
  prior_execution_version integer NOT NULL,
  new_execution_version integer NOT NULL,
  new_pilot_version integer NOT NULL,
  institution_ids jsonb NOT NULL CHECK (jsonb_typeof(institution_ids)='array'),
  campus_ids jsonb NOT NULL CHECK (jsonb_typeof(campus_ids)='array'),
  checker_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE pilot_completion_reports (
  report_reference text PRIMARY KEY CHECK (report_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  execution_reference text NOT NULL,
  execution_version integer NOT NULL,
  classification text NOT NULL CHECK (classification IN (
    'EXPAND_READY','EXTEND_PILOT','REMEDIATE','TERMINATE','AUTHORITY_REVIEW_REQUIRED'
  )),
  reconciliation jsonb NOT NULL,
  authority_decision_required boolean NOT NULL,
  actor_reference text NOT NULL,
  completed_at timestamptz NOT NULL,
  FOREIGN KEY (execution_reference,execution_version)
    REFERENCES pilot_executions(execution_reference,version)
);

CREATE TRIGGER pilot_executions_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_executions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_execution_commands_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_execution_commands
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_go_no_go_assessments_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_go_no_go_assessments
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_execution_participation_is_immutable
  BEFORE UPDATE OR DELETE ON pilot_execution_participation
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_worker_receipts_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_worker_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_evidence_snapshots_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_evidence_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_incidents_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_incidents
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_incident_timeline_is_immutable
  BEFORE UPDATE OR DELETE ON pilot_incident_timeline
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_expansion_decisions_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_expansion_decisions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_completion_reports_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_completion_reports
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE INDEX pilot_execution_latest ON pilot_executions(execution_reference,version DESC);
CREATE INDEX pilot_execution_cohort ON pilot_executions(cohort_reference,created_at DESC);
CREATE INDEX pilot_participation_tenant ON pilot_execution_participation(institution_id,created_at DESC);
CREATE INDEX pilot_worker_claim ON pilot_worker_jobs(state,available_at,created_at);
CREATE INDEX pilot_evidence_tenant ON pilot_evidence_snapshots(institution_id,captured_at DESC);
CREATE INDEX pilot_incident_execution ON pilot_incidents(execution_reference,declared_at DESC);
