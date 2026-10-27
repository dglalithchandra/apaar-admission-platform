CREATE TABLE runtime_objects (
  object_reference text PRIMARY KEY,
  content bytea NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT runtime_objects_synthetic_reference CHECK (object_reference LIKE 'SYNTH-%')
);

CREATE TABLE runtime_worker_heartbeats (
  worker_reference text PRIMARY KEY,
  worker_type text NOT NULL CHECK (worker_type IN ('BATCH', 'OUTBOX', 'NOTIFICATION', 'PILOT')),
  state text NOT NULL CHECK (state IN ('STARTING', 'READY', 'DEGRADED', 'STOPPING')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_problem_code text,
  observed_at timestamptz NOT NULL,
  CONSTRAINT runtime_worker_heartbeats_synthetic_reference CHECK (worker_reference LIKE 'SYNTH-%')
);

CREATE TABLE runtime_batch_jobs (
  batch_id text PRIMARY KEY REFERENCES admission_batches(id),
  state text NOT NULL CHECK (state IN ('PENDING', 'IN_FLIGHT', 'RETRYABLE', 'COMPLETED', 'DEAD_LETTER')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  maximum_attempts integer NOT NULL DEFAULT 5 CHECK (maximum_attempts BETWEEN 1 AND 20),
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  lease_owner text,
  lease_until timestamptz,
  last_problem_code text,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE INDEX runtime_batch_jobs_claim_idx
  ON runtime_batch_jobs(state, available_at, lease_until);

CREATE TABLE runtime_event_stream (
  event_sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_reference text NOT NULL UNIQUE,
  tenant_reference text,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_reference text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT runtime_event_stream_synthetic_reference CHECK (event_reference LIKE 'SYNTH-%'),
  CONSTRAINT runtime_event_stream_tenant_synthetic CHECK (
    tenant_reference IS NULL OR tenant_reference LIKE 'SYNTH-%'
  )
);

CREATE INDEX runtime_event_stream_cursor_idx
  ON runtime_event_stream(event_sequence, occurred_at);
CREATE INDEX runtime_event_stream_tenant_cursor_idx
  ON runtime_event_stream(tenant_reference, event_sequence);

CREATE TABLE runtime_seed_state (
  seed_reference text PRIMARY KEY,
  seed_version text NOT NULL,
  digest_sha256 text NOT NULL CHECK (digest_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT runtime_seed_state_synthetic_reference CHECK (seed_reference LIKE 'SYNTH-%')
);

CREATE TRIGGER runtime_objects_no_update_delete
BEFORE UPDATE OR DELETE ON runtime_objects
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER runtime_event_stream_no_update_delete
BEFORE UPDATE OR DELETE ON runtime_event_stream
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE TRIGGER runtime_seed_state_no_update_delete
BEFORE UPDATE OR DELETE ON runtime_seed_state
FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
