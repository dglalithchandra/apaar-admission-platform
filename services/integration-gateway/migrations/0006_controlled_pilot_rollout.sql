CREATE TABLE pilot_configurations (
  pilot_reference text NOT NULL CHECK (pilot_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  version integer NOT NULL CHECK (version > 0),
  cohort_reference text NOT NULL CHECK (cohort_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  institution_id text NOT NULL REFERENCES institutions(id),
  campus_ids jsonb NOT NULL CHECK (jsonb_typeof(campus_ids)='array' AND jsonb_array_length(campus_ids)>0),
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  enabled_capabilities jsonb NOT NULL CHECK (jsonb_typeof(enabled_capabilities)='array'),
  template_version text NOT NULL,
  api_version text NOT NULL,
  maximum_batch_rows integer NOT NULL CHECK (maximum_batch_rows BETWEEN 1 AND 10000),
  maximum_daily_submissions integer NOT NULL CHECK (maximum_daily_submissions BETWEEN 1 AND 10000),
  global_kill_switch boolean NOT NULL,
  institution_kill_switch boolean NOT NULL,
  state text NOT NULL CHECK (state IN ('DRAFT','READY','ACTIVE','PAUSED','INCIDENT','EXITED')),
  maker_reference text NOT NULL,
  checker_reference text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (pilot_reference,version),
  CHECK (effective_to >= effective_from),
  CHECK (checker_reference IS NULL OR checker_reference <> maker_reference),
  CHECK (state NOT IN ('ACTIVE','PAUSED','INCIDENT','EXITED') OR checker_reference IS NOT NULL)
);

CREATE TABLE pilot_readiness_assessments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pilot_reference text NOT NULL,
  pilot_version integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('PASS','FAIL','MANUAL_REVIEW')),
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks)='array'),
  assessed_at timestamptz NOT NULL,
  actor_reference text NOT NULL,
  FOREIGN KEY (pilot_reference,pilot_version) REFERENCES pilot_configurations(pilot_reference,version)
);

CREATE TABLE pilot_migration_receipts (
  migration_reference text PRIMARY KEY CHECK (migration_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  pilot_reference text NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  mode text NOT NULL CHECK (mode IN ('DRY_RUN','STAGED')),
  digest_sha256 text NOT NULL CHECK (digest_sha256 ~ '^[a-f0-9]{64}$'),
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  accepted_rows integer NOT NULL CHECK (accepted_rows >= 0),
  rejected_rows integer NOT NULL CHECK (rejected_rows >= 0),
  duplicate_rows integer NOT NULL CHECK (duplicate_rows >= 0),
  drift integer NOT NULL CHECK (drift >= 0),
  correction_csv text NOT NULL,
  actor_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (accepted_rows + rejected_rows = total_rows)
);

CREATE TABLE pilot_migration_state_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration_reference text NOT NULL REFERENCES pilot_migration_receipts(migration_reference),
  state text NOT NULL CHECK (state IN ('DRY_RUN_COMPLETED','STAGED','ROLLED_BACK')),
  actor_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE pilot_reconciliations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pilot_reference text NOT NULL,
  pilot_version integer NOT NULL,
  source_rows integer NOT NULL CHECK (source_rows >= 0),
  accepted_rows integer NOT NULL CHECK (accepted_rows >= 0),
  rejected_rows integer NOT NULL CHECK (rejected_rows >= 0),
  unresolved_corrections integer NOT NULL CHECK (unresolved_corrections >= 0),
  drift integer NOT NULL CHECK (drift >= 0),
  outcome text NOT NULL CHECK (outcome IN ('PASS','FAIL')),
  assessed_at timestamptz NOT NULL,
  actor_reference text NOT NULL,
  FOREIGN KEY (pilot_reference,pilot_version) REFERENCES pilot_configurations(pilot_reference,version),
  CHECK (drift = abs(source_rows - accepted_rows - rejected_rows)),
  CHECK (outcome = CASE WHEN drift=0 AND unresolved_corrections=0 THEN 'PASS' ELSE 'FAIL' END)
);

CREATE TRIGGER pilot_configurations_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_configurations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_readiness_assessments_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_readiness_assessments
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_migration_receipts_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_migration_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_migration_state_history_is_immutable
  BEFORE UPDATE OR DELETE ON pilot_migration_state_history
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER pilot_reconciliations_are_immutable
  BEFORE UPDATE OR DELETE ON pilot_reconciliations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE INDEX pilot_configuration_latest ON pilot_configurations(pilot_reference,version DESC);
CREATE INDEX pilot_readiness_history ON pilot_readiness_assessments(pilot_reference,assessed_at DESC);
CREATE INDEX pilot_reconciliation_history ON pilot_reconciliations(pilot_reference,assessed_at DESC);
