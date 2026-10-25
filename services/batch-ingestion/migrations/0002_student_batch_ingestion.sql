CREATE TABLE admission_batches (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  receipt_reference text NOT NULL UNIQUE,
  template_version text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_object_reference text NOT NULL UNIQUE,
  source_filename text NOT NULL,
  source_content_type text NOT NULL CHECK (source_content_type = 'text/csv'),
  source_byte_size integer NOT NULL CHECK (source_byte_size BETWEEN 0 AND 5242880),
  status text NOT NULL CHECK (status IN (
    'RECEIVED', 'SCANNING', 'VALIDATING', 'PROCESSING', 'NEEDS_ACTION', 'COMPLETED', 'FAILED'
  )),
  actor_reference text NOT NULL,
  reason text NOT NULL,
  request_reference text NOT NULL,
  received_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (institution_id, template_version, source_sha256)
);

CREATE TABLE batch_upload_requests (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  batch_id text NOT NULL REFERENCES admission_batches(id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (institution_id, idempotency_key)
);

CREATE TABLE batch_state_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id text NOT NULL REFERENCES admission_batches(id),
  previous_status text,
  next_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE batch_findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id text NOT NULL REFERENCES admission_batches(id),
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('ERROR', 'REVIEW', 'WARNING')),
  field_path text,
  message text NOT NULL
);

CREATE TABLE batch_rows (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES admission_batches(id),
  row_number integer NOT NULL CHECK (row_number >= 2),
  record_key text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'RECEIVED', 'VALID', 'INVALID', 'PROCESSING', 'ACCEPTED', 'REJECTED',
    'MANUAL_REVIEW', 'FAILED_RETRYABLE', 'FAILED_FINAL'
  )),
  payload jsonb,
  safe_values jsonb NOT NULL CHECK (jsonb_typeof(safe_values) = 'object'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  leased_by text,
  leased_until timestamptz,
  admission_id text REFERENCES admissions(id),
  decision_id text REFERENCES admission_decisions(id),
  admission_reference text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz,
  UNIQUE (batch_id, row_number),
  CHECK ((status = 'PROCESSING') = (leased_by IS NOT NULL AND leased_until IS NOT NULL)),
  CHECK (status NOT IN ('ACCEPTED', 'REJECTED', 'MANUAL_REVIEW') OR
    (admission_id IS NOT NULL AND decision_id IS NOT NULL AND completed_at IS NOT NULL)),
  CHECK (status <> 'VALID' OR payload IS NOT NULL)
);

CREATE TABLE batch_row_findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_row_id text NOT NULL REFERENCES batch_rows(id),
  code text NOT NULL,
  severity text NOT NULL,
  field_path text,
  message text NOT NULL
);

CREATE TABLE batch_processing_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_row_id text NOT NULL REFERENCES batch_rows(id),
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  worker_reference text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  finished_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN (
    'ACCEPTED', 'REJECTED', 'MANUAL_REVIEW', 'FAILED_RETRYABLE', 'FAILED_FINAL'
  )),
  UNIQUE (batch_row_id, attempt_number)
);

CREATE TABLE batch_reconciliations (
  batch_id text PRIMARY KEY REFERENCES admission_batches(id),
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  accepted_rows integer NOT NULL CHECK (accepted_rows >= 0),
  rejected_rows integer NOT NULL CHECK (rejected_rows >= 0),
  manual_review_rows integer NOT NULL CHECK (manual_review_rows >= 0),
  invalid_rows integer NOT NULL CHECK (invalid_rows >= 0),
  retryable_rows integer NOT NULL CHECK (retryable_rows >= 0),
  failed_final_rows integer NOT NULL CHECK (failed_final_rows >= 0),
  pending_rows integer NOT NULL CHECK (pending_rows >= 0),
  reconciled_at timestamptz NOT NULL,
  CHECK (
    accepted_rows + rejected_rows + manual_review_rows + invalid_rows +
    retryable_rows + failed_final_rows + pending_rows = total_rows
  )
);

CREATE TABLE correction_exports (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES admission_batches(id),
  object_reference text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer NOT NULL CHECK (row_count >= 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE OR REPLACE FUNCTION protect_batch_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.institution_id <> OLD.institution_id OR
     NEW.receipt_reference <> OLD.receipt_reference OR
     NEW.template_version <> OLD.template_version OR
     NEW.source_sha256 <> OLD.source_sha256 OR
     NEW.source_object_reference <> OLD.source_object_reference OR
     NEW.source_filename <> OLD.source_filename OR
     NEW.source_content_type <> OLD.source_content_type OR
     NEW.source_byte_size <> OLD.source_byte_size OR
     NEW.actor_reference <> OLD.actor_reference OR NEW.reason <> OLD.reason OR
     NEW.request_reference <> OLD.request_reference OR NEW.received_at <> OLD.received_at THEN
    RAISE EXCEPTION 'batch receipt fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admission_batch_receipt_is_immutable
  BEFORE UPDATE ON admission_batches
  FOR EACH ROW EXECUTE FUNCTION protect_batch_receipt();

CREATE TRIGGER batch_upload_requests_are_immutable
  BEFORE UPDATE OR DELETE ON batch_upload_requests
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER batch_state_history_is_immutable
  BEFORE UPDATE OR DELETE ON batch_state_history
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER batch_findings_are_immutable
  BEFORE UPDATE OR DELETE ON batch_findings
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER batch_row_findings_are_immutable
  BEFORE UPDATE OR DELETE ON batch_row_findings
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE OR REPLACE FUNCTION protect_terminal_batch_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('ACCEPTED', 'REJECTED', 'MANUAL_REVIEW', 'FAILED_FINAL') AND
     (NEW.status <> OLD.status OR
      NEW.admission_id IS DISTINCT FROM OLD.admission_id OR
      NEW.decision_id IS DISTINCT FROM OLD.decision_id OR
      NEW.admission_reference IS DISTINCT FROM OLD.admission_reference OR
      NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'terminal batch-row decision references are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER terminal_batch_row_is_immutable
  BEFORE UPDATE ON batch_rows
  FOR EACH ROW EXECUTE FUNCTION protect_terminal_batch_row();

CREATE INDEX batch_rows_claim_idx ON batch_rows (batch_id, status, row_number);
CREATE INDEX batch_rows_lease_idx ON batch_rows (leased_until) WHERE status = 'PROCESSING';
CREATE UNIQUE INDEX batch_rows_active_record_key_idx
  ON batch_rows (batch_id, record_key) WHERE status <> 'INVALID';
