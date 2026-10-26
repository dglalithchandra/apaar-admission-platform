CREATE TABLE integration_approval_imports (
  id text PRIMARY KEY,
  source_system text NOT NULL,
  source_version text NOT NULL,
  digest_sha256 text NOT NULL CHECK (digest_sha256 ~ '^[a-f0-9]{64}$'),
  authority text NOT NULL CHECK (authority IN ('SOURCE_CONFIRMED','AUTHORITY_CONFIGURED','PROPOSED')),
  status text NOT NULL CHECK (status IN ('IMPORTED','PROPOSED')),
  institution_id text NOT NULL,
  campus_id text NOT NULL,
  programme_id text NOT NULL,
  course_id text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  imported_by text NOT NULL,
  superseded_by text REFERENCES integration_approval_imports(id),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (superseded_by IS NULL OR superseded_by <> id),
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (campus_id,institution_id) REFERENCES campuses(id,institution_id),
  FOREIGN KEY (programme_id) REFERENCES programmes(id),
  FOREIGN KEY (course_id,campus_id,programme_id) REFERENCES courses(id,campus_id,programme_id),
  UNIQUE(source_system,source_version,digest_sha256)
);

CREATE INDEX integration_approval_import_scope
  ON integration_approval_imports(institution_id,campus_id,programme_id,course_id,effective_from);

CREATE TABLE integration_notification_deliveries (
  id text PRIMARY KEY,
  destination_reference text NOT NULL CHECK (destination_reference ~ '^SYNTH-[A-Z0-9-]+$'),
  message_code text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','DELIVERED','RETRYABLE','DEAD_LETTER')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 20),
  available_at timestamptz NOT NULL,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((state='DELIVERED' AND delivered_at IS NOT NULL) OR state<>'DELIVERED')
);

CREATE TABLE integration_notification_attempts (
  id bigserial PRIMARY KEY,
  notification_id text NOT NULL REFERENCES integration_notification_deliveries(id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('CLAIMED','DELIVERED','RETRYABLE','DEAD_LETTER')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE(notification_id,attempt_number,outcome)
);

CREATE TABLE verification_receipts (
  verification_reference text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  requester_organisation text NOT NULL,
  purpose text NOT NULL,
  legal_basis_reference text NOT NULL,
  claims jsonb NOT NULL CHECK (jsonb_typeof(claims)='object'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at),
  key_id text NOT NULL,
  algorithm text NOT NULL,
  signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE verification_receipt_revocations (
  verification_reference text PRIMARY KEY REFERENCES verification_receipts(verification_reference),
  reason_code text NOT NULL,
  actor_reference text NOT NULL,
  revoked_at timestamptz NOT NULL
);

CREATE TABLE integration_security_events (
  id bigserial PRIMARY KEY,
  event_code text NOT NULL,
  actor_reference text NOT NULL,
  correlation_reference text NOT NULL,
  details jsonb NOT NULL CHECK (jsonb_typeof(details)='object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TRIGGER integration_notification_attempts_are_immutable
  BEFORE UPDATE OR DELETE ON integration_notification_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER verification_receipts_are_immutable
  BEFORE UPDATE OR DELETE ON verification_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER verification_receipt_revocations_are_immutable
  BEFORE UPDATE OR DELETE ON verification_receipt_revocations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER integration_security_events_are_immutable
  BEFORE UPDATE OR DELETE ON integration_security_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
