# ADR-0022: Student admission identity conflicts

Status: implemented locally, PostgreSQL regression evidence in progress. Independent product control, not a new AICTE rule.

## Decision

Request idempotency and student identity conflicts are distinct. Before accepting an admission, the application serializes writes on the stable opaque student key and checks accepted admissions in the same academic year across institutions. A matching institution/course produces STUDENT_ADMISSION_DUPLICATE; another institution or programme produces STUDENT_ENROLMENT_OVERLAP_REVIEW. Neither reserves capacity. Existing policy rejections remain rejections.

Do not disclose another institution, course or admission reference in the institution-facing finding. The protected repository can inspect cross-tenant existence; the returned result contains only a conflict classification. Duplicate decisions are PROPOSED product safeguards; overlap eligibility remains UNKNOWN_BLOCKING pending accountable policy. Legitimate concurrent programmes require review rather than automatic rejection as unlawful.

## Transaction and concurrency

Migration 0010 adds student_identity_guards and a student/year lookup index. An UPSERT increments a guard revision in the same SERIALIZABLE transaction as the decision, reservation, audit and outbox. A competing guard write forces a serialization retry with a fresh snapshot. No remote provider call occurs while holding this guard. Existing bounded retries and rollback apply.

The active-state query respects the current admission_versions lifecycle when casework is installed. CANCELLED and TRANSFERRED versions are excluded; ACTIVE versions and accepted admissions without a version remain candidates. No historical decision is rewritten.

The idempotency insert handles either its primary key or its institution/key uniqueness conflict before reading the scoped record. A missing scoped record still fails closed; a collision cannot return another institution's replay.

## Limits and operational requirements

Both submissions must use the same provider-canonical opaque identity key. This does not fuzzy-match names, resolve identity aliases or validate an official APAAR number. Provider key resolution is a separate trust boundary. The check covers the same academic year; cross-year overlap and programme date intervals need an accountable policy and additional modelling. A review does not authorise a second programme. Historical duplicates are detected on subsequent submissions, not automatically remediated by the migration.

Root check now builds workspace dependencies before typechecking and tests, so newly introduced exported rule codes cannot be checked against stale declarations.

## Canonical identity binding and governed transfers

Validation profile student-conflicts/2 uses the verifier's canonical key rather than an institution-local student number. Migration 0015 stores immutable identity bindings with provider provenance. Migration 0016 backfills only previously verified SYNTH upload fixtures; it neither validates nor hashes real APAAR identifiers. The synthetic adapter derives a deterministic key from the synthetic academic identity reference. A live adapter must resolve a trusted opaque key. Upload evidence claiming VERIFIED without a canonical key or provider reference goes to manual review.

Governed transfers provisionally mark the approved source TRANSFERRED in the same transaction before evaluating the target; source reservations remain held until target acceptance. Any target failure rolls back the source transition and all target writes. Existing canonical source bindings must be retained in target evidence. Ordinary submissions have no source-exclusion switch.
