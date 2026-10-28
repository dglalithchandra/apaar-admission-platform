CREATE INDEX admissions_reporting_scope ON admissions(academic_year_code,institution_id,lifecycle_status);
CREATE INDEX capacity_reservations_course_reporting ON capacity_reservations(capacity_allocation_id) WHERE capacity_allocation_id IS NOT NULL;
CREATE INDEX capacity_reservations_institution_reporting ON capacity_reservations(institution_capacity_allocation_id) WHERE institution_capacity_allocation_id IS NOT NULL;
CREATE INDEX batch_rows_retryable_year_reporting ON batch_rows((payload->>'academicYear'),batch_id) WHERE status='FAILED_RETRYABLE';
