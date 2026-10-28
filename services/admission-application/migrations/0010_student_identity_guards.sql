-- Serializes concurrent admissions for a stable opaque academic identity across institutions.
CREATE TABLE student_identity_guards (
  student_key text PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision > 0)
);
CREATE INDEX admissions_student_academic_year_lookup ON admissions(student_key, academic_year_code);
