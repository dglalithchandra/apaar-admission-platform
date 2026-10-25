CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE institutions (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE campuses (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  UNIQUE (id, institution_id)
);

CREATE TABLE programmes (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  level text NOT NULL CHECK (level IN (
    'DIPLOMA', 'POST_DIPLOMA_CERTIFICATE', 'UNDERGRADUATE',
    'POSTGRADUATE_DIPLOMA', 'POSTGRADUATE'
  ))
);

CREATE TABLE courses (
  id text PRIMARY KEY,
  campus_id text NOT NULL REFERENCES campuses(id),
  programme_id text NOT NULL REFERENCES programmes(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  mode text NOT NULL CHECK (mode IN ('REGULAR', 'OPEN_DISTANCE_LEARNING', 'ONLINE')),
  UNIQUE (id, campus_id, programme_id)
);

CREATE TABLE academic_years (
  code text PRIMARY KEY CHECK (code ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE TABLE approval_import_batches (
  id text PRIMARY KEY,
  source_system text NOT NULL,
  source_hash text NOT NULL,
  received_at timestamptz NOT NULL,
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (source_system, source_hash)
);

CREATE TABLE approval_snapshots (
  id text PRIMARY KEY,
  import_batch_id text NOT NULL REFERENCES approval_import_batches(id),
  source_system text NOT NULL,
  source_record_id text NOT NULL,
  source_hash text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  received_at timestamptz NOT NULL,
  approved_by text NOT NULL,
  policy_version text NOT NULL,
  academic_year_code text NOT NULL REFERENCES academic_years(code),
  institution_id text NOT NULL REFERENCES institutions(id),
  campus_id text NOT NULL,
  programme_id text NOT NULL REFERENCES programmes(id),
  course_id text NOT NULL,
  programme_level text NOT NULL CHECK (programme_level IN (
    'DIPLOMA', 'POST_DIPLOMA_CERTIFICATE', 'UNDERGRADUATE',
    'POSTGRADUATE_DIPLOMA', 'POSTGRADUATE'
  )),
  course_mode text NOT NULL CHECK (course_mode IN ('REGULAR', 'OPEN_DISTANCE_LEARNING', 'ONLINE')),
  ordinary_intake integer NOT NULL CHECK (ordinary_intake >= 0),
  nri_approved boolean NOT NULL,
  nri_maximum_within_ordinary integer NOT NULL CHECK (nri_maximum_within_ordinary >= 0),
  fn_oci_gulf_approved boolean NOT NULL,
  fn_oci_capacity integer NOT NULL CHECK (fn_oci_capacity >= 0),
  gulf_capacity integer NOT NULL CHECK (gulf_capacity >= 0),
  fn_oci_gulf_combined_capacity integer NOT NULL CHECK (fn_oci_gulf_combined_capacity >= 0),
  foreign_national_across_routes_maximum integer NOT NULL CHECK (foreign_national_across_routes_maximum >= 0),
  lateral_approved boolean NOT NULL,
  lateral_supernumerary_capacity integer NOT NULL CHECK (lateral_supernumerary_capacity >= 0),
  lateral_first_year_vacancy_capacity integer NOT NULL CHECK (lateral_first_year_vacancy_capacity >= 0),
  tfw_approved boolean NOT NULL,
  tfw_capacity integer NOT NULL CHECK (tfw_capacity >= 0),
  tfw_preceding_year_fill_satisfied boolean NOT NULL,
  pm_uspy_approved boolean NOT NULL,
  pm_uspy_course_capacity integer NOT NULL CHECK (pm_uspy_course_capacity BETWEEN 0 AND 2),
  pm_uspy_institution_capacity integer NOT NULL CHECK (pm_uspy_institution_capacity BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (nri_maximum_within_ordinary <= ordinary_intake),
  CHECK (fn_oci_capacity + gulf_capacity <= fn_oci_gulf_combined_capacity),
  CHECK (pm_uspy_course_capacity <= pm_uspy_institution_capacity),
  FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id),
  FOREIGN KEY (course_id, campus_id, programme_id) REFERENCES courses(id, campus_id, programme_id),
  UNIQUE (source_system, source_record_id, source_hash)
);

CREATE INDEX approval_snapshots_effective_lookup
  ON approval_snapshots (
    institution_id, campus_id, programme_id, course_id,
    academic_year_code, effective_from, received_at DESC
  );

CREATE TABLE approval_supersessions (
  previous_snapshot_id text PRIMARY KEY REFERENCES approval_snapshots(id),
  replacement_snapshot_id text NOT NULL REFERENCES approval_snapshots(id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (previous_snapshot_id <> replacement_snapshot_id)
);

CREATE TABLE capacity_allocations (
  id text PRIMARY KEY,
  approval_snapshot_id text NOT NULL REFERENCES approval_snapshots(id),
  allocation_code text NOT NULL CHECK (allocation_code IN (
    'ORDINARY', 'NRI_WITHIN_ORDINARY', 'FN_OCI_SUBGROUP', 'GULF_SUBGROUP',
    'FN_OCI_GULF_COMBINED', 'LATERAL_SUPERNUMERARY',
    'LATERAL_FIRST_YEAR_VACANCY', 'TFW', 'PM_USPY_COURSE',
    'FOREIGN_NATIONAL_ACROSS_ROUTES'
  )),
  capacity_quantity integer NOT NULL CHECK (capacity_quantity >= 0),
  used_quantity integer NOT NULL DEFAULT 0 CHECK (used_quantity >= 0 AND used_quantity <= capacity_quantity),
  convertible boolean NOT NULL DEFAULT false,
  UNIQUE (approval_snapshot_id, allocation_code),
  CHECK (allocation_code NOT IN ('TFW', 'PM_USPY_COURSE') OR convertible = false)
);

CREATE TABLE institution_capacity_allocations (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  academic_year_code text NOT NULL REFERENCES academic_years(code),
  policy_version text NOT NULL,
  allocation_code text NOT NULL CHECK (allocation_code = 'PM_USPY_INSTITUTION'),
  capacity_quantity integer NOT NULL CHECK (capacity_quantity BETWEEN 0 AND 10),
  used_quantity integer NOT NULL DEFAULT 0 CHECK (used_quantity >= 0 AND used_quantity <= capacity_quantity),
  convertible boolean NOT NULL DEFAULT false CHECK (convertible = false),
  UNIQUE (institution_id, academic_year_code, policy_version, allocation_code)
);

CREATE TABLE idempotency_records (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz,
  UNIQUE (institution_id, idempotency_key),
  CHECK ((status = 'PROCESSING' AND result IS NULL AND completed_at IS NULL)
      OR (status = 'COMPLETED' AND result IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE TABLE admission_commands (
  id text PRIMARY KEY,
  idempotency_record_id text NOT NULL UNIQUE REFERENCES idempotency_records(id),
  institution_id text NOT NULL REFERENCES institutions(id),
  campus_id text NOT NULL,
  programme_id text NOT NULL REFERENCES programmes(id),
  course_id text NOT NULL,
  academic_year_code text NOT NULL REFERENCES academic_years(code),
  student_key text NOT NULL,
  admission_date date NOT NULL,
  category text NOT NULL CHECK (category IN (
    'ORDINARY', 'NRI', 'FOREIGN_NATIONAL', 'OCI', 'GULF_WORKER_CHILD',
    'LATERAL_ENTRY', 'TFW', 'PM_USPY', 'OTHER_SUPERNUMERARY'
  )),
  lateral_capacity_source text CHECK (lateral_capacity_source IS NULL OR lateral_capacity_source IN (
    'LATERAL_SUPERNUMERARY', 'LATERAL_FIRST_YEAR_VACANCY'
  )),
  eligibility_evidence text NOT NULL CHECK (eligibility_evidence IN ('VERIFIED', 'PENDING', 'MISSING')),
  student_status jsonb NOT NULL CHECK (jsonb_typeof(student_status) = 'object'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  correlation_reference text NOT NULL,
  request_reference text NOT NULL,
  received_at timestamptz NOT NULL,
  FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id),
  FOREIGN KEY (course_id, campus_id, programme_id) REFERENCES courses(id, campus_id, programme_id)
);

CREATE TABLE identity_verifications (
  id text PRIMARY KEY,
  admission_command_id text NOT NULL UNIQUE REFERENCES admission_commands(id),
  status text NOT NULL CHECK (status IN (
    'VERIFIED', 'NOT_FOUND', 'MISMATCH', 'TEMPORARILY_UNAVAILABLE', 'RATE_LIMITED',
    'NOT_ELIGIBLE_FOR_APAAR', 'MANUAL_REVIEW', 'UNVERIFIED'
  )),
  checked_at timestamptz NOT NULL,
  provider_contract_version text NOT NULL,
  provider_request_reference text
);

CREATE TABLE admissions (
  id text PRIMARY KEY,
  admission_command_id text NOT NULL UNIQUE REFERENCES admission_commands(id),
  registration_reference text UNIQUE,
  institution_id text NOT NULL REFERENCES institutions(id),
  campus_id text NOT NULL,
  programme_id text NOT NULL REFERENCES programmes(id),
  course_id text NOT NULL,
  academic_year_code text NOT NULL REFERENCES academic_years(code),
  student_key text NOT NULL,
  category text NOT NULL,
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN (
    'DRAFT', 'PENDING_IDENTITY', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED'
  )),
  approval_snapshot_id text REFERENCES approval_snapshots(id),
  ruleset_version text NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK ((lifecycle_status = 'ACCEPTED' AND registration_reference IS NOT NULL AND approval_snapshot_id IS NOT NULL)
      OR lifecycle_status <> 'ACCEPTED'),
  FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id),
  FOREIGN KEY (course_id, campus_id, programme_id) REFERENCES courses(id, campus_id, programme_id)
);

CREATE TABLE admission_decisions (
  id text PRIMARY KEY,
  admission_id text NOT NULL REFERENCES admissions(id),
  version integer NOT NULL CHECK (version > 0),
  outcome text NOT NULL CHECK (outcome IN ('ACCEPT', 'MANUAL_REVIEW', 'REJECT')),
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN ('UNDER_REVIEW', 'ACCEPTED', 'REJECTED')),
  approval_snapshot_id text REFERENCES approval_snapshots(id),
  ruleset_version text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  findings jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  UNIQUE (admission_id, version)
);

CREATE TABLE capacity_reservations (
  id text PRIMARY KEY,
  admission_id text NOT NULL REFERENCES admissions(id),
  capacity_allocation_id text REFERENCES capacity_allocations(id),
  institution_capacity_allocation_id text REFERENCES institution_capacity_allocations(id),
  allocation_code text NOT NULL,
  units integer NOT NULL CHECK (units > 0),
  created_at timestamptz NOT NULL,
  CHECK ((capacity_allocation_id IS NOT NULL)::integer +
         (institution_capacity_allocation_id IS NOT NULL)::integer = 1),
  UNIQUE (admission_id, allocation_code)
);

CREATE TABLE business_audit_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_reference text NOT NULL,
  actor_reference text NOT NULL,
  reason text NOT NULL,
  correlation_reference text NOT NULL,
  request_reference text NOT NULL,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL
);

CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_reference text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  publication_state text NOT NULL DEFAULT 'PENDING' CHECK (publication_state IN ('PENDING', 'PUBLISHED', 'FAILED')),
  published_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  CHECK ((publication_state = 'PUBLISHED' AND published_at IS NOT NULL)
      OR publication_state <> 'PUBLISHED')
);

CREATE OR REPLACE FUNCTION reject_immutable_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER approval_snapshots_are_immutable
  BEFORE UPDATE OR DELETE ON approval_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER admission_decisions_are_immutable
  BEFORE UPDATE OR DELETE ON admission_decisions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER audit_events_are_immutable
  BEFORE UPDATE OR DELETE ON business_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER admission_commands_are_immutable
  BEFORE UPDATE OR DELETE ON admission_commands
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER admissions_are_immutable
  BEFORE UPDATE OR DELETE ON admissions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER identity_verifications_are_immutable
  BEFORE UPDATE OR DELETE ON identity_verifications
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER capacity_reservations_are_immutable
  BEFORE UPDATE OR DELETE ON capacity_reservations
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
