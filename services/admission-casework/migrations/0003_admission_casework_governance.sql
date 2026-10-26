CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE casework_policy_versions (
  id text PRIMARY KEY,
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  authority text NOT NULL CHECK (authority IN ('SOURCE_CONFIRMED','AUTHORITY_CONFIGURED','PROPOSED','UNKNOWN_BLOCKING')),
  source_reference text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope)='object'),
  scope_fingerprint text GENERATED ALWAYS AS (md5(scope::text)) STORED,
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration)='object'),
  activation_status text NOT NULL CHECK (activation_status IN ('DRAFT','ACTIVE','RETIRED')),
  activated_by text,
  checker_reference text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(policy_version),
  UNIQUE(policy_version,authority),
  UNIQUE(policy_key,policy_version),
  CHECK (activation_status <> 'ACTIVE' OR (
    authority IN ('SOURCE_CONFIRMED','AUTHORITY_CONFIGURED') AND
    activated_by IS NOT NULL AND checker_reference IS NOT NULL AND activated_by <> checker_reference
  )),
  EXCLUDE USING gist (
    policy_key WITH =,
    scope_fingerprint WITH =,
    daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') WITH &&
  ) WHERE (activation_status='ACTIVE')
);

CREATE TABLE admission_cases (
  id text PRIMARY KEY,
  case_reference text NOT NULL UNIQUE,
  case_type text NOT NULL CHECK (case_type IN (
    'ADMISSION_CORRECTION','ADMISSION_CANCELLATION','INSTITUTION_TRANSFER',
    'PROGRAMME_OR_COURSE_TRANSFER','CATEGORY_CORRECTION','IDENTITY_LINK_CORRECTION',
    'DUPLICATE_ENROLMENT_REVIEW','CAPACITY_EXCEPTION_REVIEW','APPEAL','OTHER_AUTHORISED_REVIEW'
  )),
  institution_id text NOT NULL REFERENCES institutions(id),
  admission_id text NOT NULL REFERENCES admissions(id),
  batch_id text REFERENCES admission_batches(id),
  parent_case_id text REFERENCES admission_cases(id),
  policy_version text NOT NULL,
  policy_authority text NOT NULL CHECK (policy_authority IN ('SOURCE_CONFIRMED','AUTHORITY_CONFIGURED')),
  priority text NOT NULL CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  state text NOT NULL CHECK (state IN (
    'DRAFT','SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','RECOMMENDED',
    'APPROVED','REJECTED','WITHDRAWN','IMPLEMENTED','IMPLEMENTATION_FAILED'
  )),
  maker_reference text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY (policy_version,policy_authority)
    REFERENCES casework_policy_versions(policy_version,authority)
);

CREATE UNIQUE INDEX one_active_case_per_subject_and_type
  ON admission_cases(admission_id,case_type)
  WHERE state IN ('DRAFT','SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','RECOMMENDED','APPROVED');
CREATE INDEX admission_cases_institution_list
  ON admission_cases(institution_id,id,state,case_type);
CREATE UNIQUE INDEX one_active_transfer_case_per_admission
  ON admission_cases(admission_id)
  WHERE case_type IN ('INSTITUTION_TRANSFER','PROGRAMME_OR_COURSE_TRANSFER')
    AND state IN ('DRAFT','SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','RECOMMENDED','APPROVED');

CREATE TABLE casework_commands (
  id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  command_type text NOT NULL,
  case_id text NOT NULL REFERENCES admission_cases(id),
  result_version integer NOT NULL CHECK (result_version > 0),
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (institution_id,idempotency_key)
);

CREATE TABLE case_state_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  previous_state text,
  next_state text NOT NULL,
  actor_reference text NOT NULL,
  actor_role text NOT NULL,
  reason text NOT NULL,
  purpose text NOT NULL,
  request_reference text NOT NULL,
  correlation_reference text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE case_assignments (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  reviewer_reference text NOT NULL,
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX one_active_case_assignment ON case_assignments(case_id) WHERE ended_at IS NULL;

CREATE TABLE case_information_requests (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  requested_by text NOT NULL,
  request_text text NOT NULL CHECK (length(btrim(request_text)) > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE case_information_responses (
  id text PRIMARY KEY,
  information_request_id text NOT NULL UNIQUE REFERENCES case_information_requests(id),
  case_id text NOT NULL REFERENCES admission_cases(id),
  supplied_by text NOT NULL,
  response_text text NOT NULL CHECK (length(btrim(response_text)) > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE case_recommendations (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  reviewer_reference text NOT NULL,
  recommendation text NOT NULL CHECK (recommendation IN ('APPROVE','REJECT','MORE_INFORMATION_REQUIRED')),
  reason_code text NOT NULL,
  explanation text NOT NULL,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE case_decisions (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  checker_reference text NOT NULL,
  maker_reference text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('APPROVED','REJECTED')),
  reason_code text NOT NULL,
  explanation text NOT NULL,
  policy_version text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE(case_id),
  CHECK (checker_reference <> maker_reference)
);

CREATE TABLE correction_proposals (
  id text PRIMARY KEY,
  case_id text NOT NULL UNIQUE REFERENCES admission_cases(id),
  requires_policy_reevaluation boolean NOT NULL,
  capacity_may_change boolean NOT NULL,
  identity_reverification_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE correction_field_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id text NOT NULL REFERENCES correction_proposals(id),
  field_code text NOT NULL CHECK (field_code IN (
    'STUDENT_REFERENCE','ACADEMIC_IDENTITY_REFERENCE','CATEGORY','STUDENT_STATUS',
    'PROGRAMME_ID','COURSE_ID','ADMISSION_DATE','ELIGIBILITY_EVIDENCE'
  )),
  previous_value jsonb NOT NULL,
  proposed_value jsonb NOT NULL,
  UNIQUE(proposal_id,field_code)
);

CREATE TABLE case_evidence_metadata (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  object_reference text NOT NULL UNIQUE,
  safe_filename text NOT NULL CHECK (safe_filename !~ '[\\/]'),
  media_type text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  malware_status text NOT NULL CHECK (malware_status IN ('PENDING','CLEAN','REJECTED')),
  added_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE case_conflict_declarations (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  actor_reference text NOT NULL,
  has_conflict boolean NOT NULL,
  declared_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE INDEX case_conflict_declarations_latest
  ON case_conflict_declarations(case_id,actor_reference,declared_at DESC,id DESC);

CREATE TABLE case_appeals (
  id text PRIMARY KEY,
  case_id text NOT NULL UNIQUE REFERENCES admission_cases(id),
  appealed_case_id text REFERENCES admission_cases(id),
  appealed_decision_id text REFERENCES admission_decisions(id),
  appellant_reference text NOT NULL,
  appellant_role text NOT NULL,
  outcome text CHECK (outcome IS NULL OR outcome IN ('UPHELD','PARTIALLY_UPHELD','OVERTURNED','DISMISSED')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((appealed_case_id IS NOT NULL)::integer + (appealed_decision_id IS NOT NULL)::integer = 1)
);
CREATE UNIQUE INDEX one_active_appeal_per_case
  ON case_appeals(appealed_case_id) WHERE appealed_case_id IS NOT NULL AND outcome IS NULL;
CREATE UNIQUE INDEX one_active_appeal_per_decision
  ON case_appeals(appealed_decision_id) WHERE appealed_decision_id IS NOT NULL AND outcome IS NULL;

CREATE TABLE case_purpose_records (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  purpose text NOT NULL,
  legal_basis_category text NOT NULL,
  consent_reference text,
  consent_status text,
  data_categories jsonb NOT NULL CHECK (jsonb_typeof(data_categories)='array'),
  recipient_category text NOT NULL,
  retention_policy_reference text NOT NULL,
  actor_reference text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE admission_versions (
  id text PRIMARY KEY,
  admission_id text NOT NULL REFERENCES admissions(id),
  version integer NOT NULL CHECK (version > 0),
  predecessor_id text REFERENCES admission_versions(id),
  case_id text REFERENCES admission_cases(id),
  decision_id text REFERENCES admission_decisions(id),
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN ('ACTIVE','CANCELLED','TRANSFERRED')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  is_current boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE(admission_id,version),
  CHECK ((version=1 AND predecessor_id IS NULL) OR (version>1 AND predecessor_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_current_admission_version ON admission_versions(admission_id) WHERE is_current;

INSERT INTO admission_versions(
  id,admission_id,version,decision_id,lifecycle_status,snapshot,is_current,created_at
)
SELECT
  'ADMISSION-VERSION-' || a.id || '-1',a.id,1,d.id,'ACTIVE',
  jsonb_build_object(
    'admissionId',a.id,'decisionId',d.id,'approvalSnapshotId',a.approval_snapshot_id,
    'institutionId',a.institution_id,'campusId',a.campus_id,'programmeId',a.programme_id,
    'courseId',a.course_id,'academicYear',a.academic_year_code,'category',a.category,
    'lifecycleStatus',a.lifecycle_status
  ),true,d.evaluated_at
FROM admissions a
JOIN LATERAL (
  SELECT decision.* FROM admission_decisions decision
  WHERE decision.admission_id=a.id AND decision.outcome='ACCEPT'
  ORDER BY decision.version DESC LIMIT 1
) d ON true
WHERE a.lifecycle_status='ACCEPTED'
ON CONFLICT (admission_id,version) DO NOTHING;

CREATE TABLE case_implementations (
  id text PRIMARY KEY,
  case_id text NOT NULL UNIQUE REFERENCES admission_cases(id),
  implementation_type text NOT NULL CHECK (implementation_type IN ('CORRECTION','CANCELLATION','TRANSFER','APPEAL_REMEDY')),
  receipt_reference text NOT NULL UNIQUE,
  implemented_by text NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  implemented_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE capacity_releases (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES admission_cases(id),
  reservation_id text NOT NULL UNIQUE REFERENCES capacity_reservations(id),
  units integer NOT NULL CHECK (units > 0),
  released_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE(case_id,reservation_id)
);

CREATE TABLE admission_transfers (
  id text PRIMARY KEY,
  case_id text NOT NULL UNIQUE REFERENCES admission_cases(id),
  source_admission_id text NOT NULL REFERENCES admissions(id),
  target_admission_id text REFERENCES admissions(id),
  target_institution_id text NOT NULL REFERENCES institutions(id),
  target_campus_id text NOT NULL,
  target_programme_id text NOT NULL REFERENCES programmes(id),
  target_course_id text NOT NULL,
  target_academic_year_code text NOT NULL REFERENCES academic_years(code),
  target_decision_id text REFERENCES admission_decisions(id),
  implemented_at timestamptz,
  CHECK (target_admission_id IS NULL OR target_admission_id <> source_admission_id),
  FOREIGN KEY (target_campus_id,target_institution_id)
    REFERENCES campuses(id,institution_id),
  FOREIGN KEY (target_course_id,target_campus_id,target_programme_id)
    REFERENCES courses(id,campus_id,programme_id)
);
CREATE UNIQUE INDEX one_implemented_transfer_per_source
  ON admission_transfers(source_admission_id) WHERE implemented_at IS NOT NULL;

CREATE TRIGGER casework_commands_are_immutable BEFORE UPDATE OR DELETE ON casework_commands FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_state_history_is_immutable BEFORE UPDATE OR DELETE ON case_state_history FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_recommendations_are_immutable BEFORE UPDATE OR DELETE ON case_recommendations FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_decisions_are_immutable BEFORE UPDATE OR DELETE ON case_decisions FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER correction_field_changes_are_immutable BEFORE UPDATE OR DELETE ON correction_field_changes FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER correction_proposals_are_immutable BEFORE UPDATE OR DELETE ON correction_proposals FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_purpose_records_are_immutable BEFORE UPDATE OR DELETE ON case_purpose_records FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_conflict_declarations_are_immutable BEFORE UPDATE OR DELETE ON case_conflict_declarations FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_implementations_are_immutable BEFORE UPDATE OR DELETE ON case_implementations FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER capacity_releases_are_immutable BEFORE UPDATE OR DELETE ON capacity_releases FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_evidence_metadata_is_immutable BEFORE UPDATE OR DELETE ON case_evidence_metadata FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_information_requests_are_immutable BEFORE UPDATE OR DELETE ON case_information_requests FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER case_information_responses_are_immutable BEFORE UPDATE OR DELETE ON case_information_responses FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE OR REPLACE FUNCTION validate_case_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded_maker text;
BEGIN
  SELECT maker_reference INTO recorded_maker FROM admission_cases WHERE id=NEW.case_id;
  IF NEW.reviewer_reference=recorded_maker THEN
    RAISE EXCEPTION 'reviewer must be independent from the case maker' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_assignment_actor_separation
  BEFORE INSERT ON case_assignments FOR EACH ROW EXECUTE FUNCTION validate_case_assignment();

CREATE OR REPLACE FUNCTION protect_case_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.ended_at IS NOT NULL OR NEW.id IS DISTINCT FROM OLD.id OR
     NEW.case_id IS DISTINCT FROM OLD.case_id OR
     NEW.reviewer_reference IS DISTINCT FROM OLD.reviewer_reference OR
     NEW.assigned_by IS DISTINCT FROM OLD.assigned_by OR
     NEW.assigned_at IS DISTINCT FROM OLD.assigned_at OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'case assignments are append-only; only an active assignment may be ended' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_assignment_history_is_protected
  BEFORE UPDATE OR DELETE ON case_assignments FOR EACH ROW EXECUTE FUNCTION protect_case_assignment();

CREATE OR REPLACE FUNCTION protect_case_appeal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.outcome IS NOT NULL OR NEW.id IS DISTINCT FROM OLD.id OR
     NEW.case_id IS DISTINCT FROM OLD.case_id OR
     NEW.appealed_case_id IS DISTINCT FROM OLD.appealed_case_id OR
     NEW.appealed_decision_id IS DISTINCT FROM OLD.appealed_decision_id OR
     NEW.appellant_reference IS DISTINCT FROM OLD.appellant_reference OR
     NEW.appellant_role IS DISTINCT FROM OLD.appellant_role OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.outcome IS NULL THEN
    RAISE EXCEPTION 'appeals are append-only; only a pending appeal outcome may be recorded' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_appeal_history_is_protected
  BEFORE UPDATE OR DELETE ON case_appeals FOR EACH ROW EXECUTE FUNCTION protect_case_appeal();

CREATE OR REPLACE FUNCTION validate_case_appeal_target()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE appeal_admission text;
DECLARE appeal_type text;
DECLARE target_admission text;
BEGIN
  SELECT admission_id,case_type INTO appeal_admission,appeal_type
    FROM admission_cases WHERE id=NEW.case_id;
  IF appeal_type IS DISTINCT FROM 'APPEAL' THEN
    RAISE EXCEPTION 'appeal metadata must belong to an APPEAL case' USING ERRCODE='23514';
  END IF;
  IF NEW.appealed_case_id IS NOT NULL THEN
    SELECT admission_id INTO target_admission FROM admission_cases WHERE id=NEW.appealed_case_id;
  ELSE
    SELECT admission_id INTO target_admission FROM admission_decisions WHERE id=NEW.appealed_decision_id;
  END IF;
  IF target_admission IS DISTINCT FROM appeal_admission THEN
    RAISE EXCEPTION 'appeal and target must belong to the same admission' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_appeal_target_guard
  BEFORE INSERT OR UPDATE OF case_id,appealed_case_id,appealed_decision_id ON case_appeals
  FOR EACH ROW EXECUTE FUNCTION validate_case_appeal_target();

CREATE OR REPLACE FUNCTION validate_case_decision_actor_separation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded_maker text;
DECLARE recorded_reviewer text;
DECLARE recorded_policy text;
BEGIN
  SELECT maker_reference,policy_version INTO recorded_maker,recorded_policy
    FROM admission_cases WHERE id=NEW.case_id;
  SELECT reviewer_reference INTO recorded_reviewer FROM case_assignments
    WHERE case_id=NEW.case_id ORDER BY assigned_at DESC,id DESC LIMIT 1;
  IF recorded_maker IS NULL OR NEW.maker_reference IS DISTINCT FROM recorded_maker OR
     NEW.checker_reference=recorded_maker THEN
    RAISE EXCEPTION 'case decision maker must match the case maker and checker must be independent' USING ERRCODE='23514';
  END IF;
  IF recorded_reviewer IS NULL OR NEW.checker_reference=recorded_reviewer THEN
    RAISE EXCEPTION 'checker must be independent from the assigned reviewer' USING ERRCODE='23514';
  END IF;
  IF NEW.policy_version IS DISTINCT FROM recorded_policy THEN
    RAISE EXCEPTION 'case decision must retain the case policy version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_decision_actor_separation
  BEFORE INSERT ON case_decisions FOR EACH ROW EXECUTE FUNCTION validate_case_decision_actor_separation();

CREATE OR REPLACE FUNCTION validate_case_recommendation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE active_reviewer text;
DECLARE latest_conflict boolean;
DECLARE recorded_policy text;
BEGIN
  SELECT policy_version INTO recorded_policy FROM admission_cases WHERE id=NEW.case_id;
  SELECT reviewer_reference INTO active_reviewer FROM case_assignments
    WHERE case_id=NEW.case_id AND ended_at IS NULL ORDER BY assigned_at DESC,id DESC LIMIT 1;
  IF active_reviewer IS DISTINCT FROM NEW.reviewer_reference THEN
    RAISE EXCEPTION 'only the active assigned reviewer may recommend' USING ERRCODE='23514';
  END IF;
  SELECT has_conflict INTO latest_conflict FROM case_conflict_declarations
    WHERE case_id=NEW.case_id AND actor_reference=NEW.reviewer_reference
    ORDER BY declared_at DESC,id DESC LIMIT 1;
  IF latest_conflict IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'a conflict-free declaration is required before recommendation' USING ERRCODE='23514';
  END IF;
  IF NEW.policy_version IS DISTINCT FROM recorded_policy THEN
    RAISE EXCEPTION 'case recommendation must retain the case policy version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_recommendation_reviewer_guard
  BEFORE INSERT ON case_recommendations FOR EACH ROW EXECUTE FUNCTION validate_case_recommendation();

CREATE OR REPLACE FUNCTION protect_activated_casework_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.activation_status='ACTIVE' THEN
    RAISE EXCEPTION 'activated policy versions are immutable' USING ERRCODE='55000';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER active_casework_policy_is_immutable BEFORE UPDATE OR DELETE ON casework_policy_versions FOR EACH ROW EXECUTE FUNCTION protect_activated_casework_policy();

CREATE OR REPLACE FUNCTION require_active_casework_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM casework_policy_versions
    WHERE policy_version=NEW.policy_version
      AND authority=NEW.policy_authority
      AND activation_status='ACTIVE'
      AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'casework requires an active, currently effective authority policy' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admission_case_policy_guard
  BEFORE INSERT OR UPDATE OF policy_version,policy_authority ON admission_cases
  FOR EACH ROW EXECUTE FUNCTION require_active_casework_policy();

CREATE OR REPLACE FUNCTION validate_case_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'case version conflict' USING ERRCODE='40001'; END IF;
  IF NEW.state <> OLD.state AND NOT ((OLD.state='DRAFT' AND NEW.state IN ('SUBMITTED','WITHDRAWN')) OR
          (OLD.state='SUBMITTED' AND NEW.state IN ('UNDER_REVIEW','WITHDRAWN')) OR
          (OLD.state='UNDER_REVIEW' AND NEW.state IN ('MORE_INFORMATION_REQUIRED','RECOMMENDED','REJECTED')) OR
          (OLD.state='MORE_INFORMATION_REQUIRED' AND NEW.state IN ('SUBMITTED','WITHDRAWN')) OR
          (OLD.state='RECOMMENDED' AND NEW.state IN ('APPROVED','REJECTED')) OR
          (OLD.state='APPROVED' AND NEW.state IN ('IMPLEMENTED','IMPLEMENTATION_FAILED'))) THEN
    RAISE EXCEPTION 'invalid case transition from % to %',OLD.state,NEW.state USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admission_case_transition_guard BEFORE UPDATE OF state,version ON admission_cases FOR EACH ROW EXECUTE FUNCTION validate_case_transition();

CREATE OR REPLACE FUNCTION protect_admission_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR
     NEW.admission_id IS DISTINCT FROM OLD.admission_id OR
     NEW.version IS DISTINCT FROM OLD.version OR
     NEW.predecessor_id IS DISTINCT FROM OLD.predecessor_id OR
     NEW.case_id IS DISTINCT FROM OLD.case_id OR
     NEW.decision_id IS DISTINCT FROM OLD.decision_id OR
     NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status OR
     NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR
     NOT (OLD.is_current=true AND NEW.is_current=false) THEN
    RAISE EXCEPTION 'admission versions are append-only; only current-to-historical is allowed' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admission_versions_are_historical
  BEFORE UPDATE OR DELETE ON admission_versions FOR EACH ROW EXECUTE FUNCTION protect_admission_version();

CREATE OR REPLACE FUNCTION validate_admission_version_lineage()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_admission text;
DECLARE predecessor_version integer;
DECLARE decision_admission text;
BEGIN
  IF NEW.decision_id IS NOT NULL THEN
    SELECT admission_id INTO decision_admission FROM admission_decisions WHERE id=NEW.decision_id;
    IF decision_admission IS DISTINCT FROM NEW.admission_id THEN
      RAISE EXCEPTION 'admission version decision must belong to the same admission' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.predecessor_id IS NULL THEN RETURN NEW; END IF;
  SELECT admission_id,version INTO predecessor_admission,predecessor_version
    FROM admission_versions WHERE id=NEW.predecessor_id;
  IF predecessor_admission IS DISTINCT FROM NEW.admission_id OR
     predecessor_version IS DISTINCT FROM NEW.version-1 THEN
    RAISE EXCEPTION 'admission version predecessor must be the preceding version of the same admission' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admission_version_lineage_guard
  BEFORE INSERT ON admission_versions FOR EACH ROW EXECUTE FUNCTION validate_admission_version_lineage();

CREATE OR REPLACE FUNCTION create_initial_admission_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE admission_row admissions%ROWTYPE;
BEGIN
  IF NEW.outcome <> 'ACCEPT' THEN RETURN NEW; END IF;
  SELECT * INTO admission_row FROM admissions WHERE id=NEW.admission_id;
  INSERT INTO admission_versions(
    id,admission_id,version,decision_id,lifecycle_status,snapshot,is_current,created_at
  ) VALUES (
    'ADMISSION-VERSION-' || NEW.admission_id || '-1',NEW.admission_id,1,NEW.id,'ACTIVE',
    jsonb_build_object(
      'admissionId',admission_row.id,'decisionId',NEW.id,
      'approvalSnapshotId',admission_row.approval_snapshot_id,
      'institutionId',admission_row.institution_id,'campusId',admission_row.campus_id,
      'programmeId',admission_row.programme_id,'courseId',admission_row.course_id,
      'academicYear',admission_row.academic_year_code,'category',admission_row.category,
      'lifecycleStatus',admission_row.lifecycle_status
    ),true,NEW.evaluated_at
  ) ON CONFLICT (admission_id,version) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accepted_admission_starts_version_history
  AFTER INSERT ON admission_decisions FOR EACH ROW EXECUTE FUNCTION create_initial_admission_version();

CREATE OR REPLACE FUNCTION protect_implemented_transfer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.implemented_at IS NOT NULL OR NEW.implemented_at IS NULL OR
     NEW.id IS DISTINCT FROM OLD.id OR NEW.case_id IS DISTINCT FROM OLD.case_id OR
     NEW.source_admission_id IS DISTINCT FROM OLD.source_admission_id OR
     NEW.target_institution_id IS DISTINCT FROM OLD.target_institution_id OR
     NEW.target_campus_id IS DISTINCT FROM OLD.target_campus_id OR
     NEW.target_programme_id IS DISTINCT FROM OLD.target_programme_id OR
     NEW.target_course_id IS DISTINCT FROM OLD.target_course_id OR
     NEW.target_academic_year_code IS DISTINCT FROM OLD.target_academic_year_code THEN
    RAISE EXCEPTION 'transfers are append-only; only an unimplemented transfer may be completed once' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER implemented_transfers_are_immutable
  BEFORE UPDATE OR DELETE ON admission_transfers FOR EACH ROW EXECUTE FUNCTION protect_implemented_transfer();
