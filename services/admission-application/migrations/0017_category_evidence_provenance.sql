-- Existing decisions retain their historical meaning; no verification is backfilled.
ALTER TABLE admission_commands ADD COLUMN category_evidence_check jsonb;
ALTER TABLE admission_commands ADD CONSTRAINT category_evidence_check_object
  CHECK (category_evidence_check IS NULL OR jsonb_typeof(category_evidence_check) = 'object');
