# Service modules

The initial backend should be one deployable Spring Boot application with independently testable modules:

- `identity-linking` — APAAR adapter, aliases, confidence and manual review.
- `institution-registry` — AICTE institution, campus and programme identifiers.
- `approval-capacity` — effective-dated approval snapshots and seat buckets.
- `admissions` — admission lifecycle, idempotency and last-seat protection.
- `batch-ingestion` — template versioning, parsing, row validation and resumable processing.
- `conflicts` — duplicate and overlapping-enrolment cases.
- `casework` — corrections, appeals, transfers, cancellations and evidence.
- `verification` — purpose-limited responses and signed records.
- `reporting` — reproducible regulatory extracts.
- `audit` — append-only security and business event history.

These are boundaries, not a requirement for ten independently deployed services. Extraction is justified only by measured scale, isolation or team ownership.
