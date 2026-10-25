# ADR-0007: Resumable PostgreSQL batch ingestion

- Status: accepted
- Date: 25 October 2026

## Context

An institution upload can contain thousands of rows and cross two unreliable boundaries: malware scanning and academic-identity verification. A process crash must not duplicate admissions, lose the immutable receipt or corrupt the Stage 2 capacity counters. Messaging infrastructure and real provider access are intentionally outside Stage 3.

## Decision

PostgreSQL remains authoritative. A batch is registered with an institution-scoped idempotency key and a unique `(institution, template version, SHA-256)` digest. A second key for identical bytes aliases the original receipt; reusing a key for different content is a conflict.

Workers claim at most a bounded number of `VALID` or `FAILED_RETRYABLE` rows in row-number order with `FOR UPDATE SKIP LOCKED`. Claim, attempt creation and lease assignment are one transaction. Stage 2 receives a deterministic row command and idempotency key. Completion stores the exact Stage 2 admission and decision references only while the worker still owns the lease. Expired leases are reconciled to retryable or final failure before new claims.

Retry is bounded at three attempts. Temporary provider failure remains retryable; exhaustion is a final processing failure, never an assertion that the academic identity is invalid. Processing is effectively once at the business boundary through Stage 2 idempotency; no exactly-once delivery claim is made.

The lock order is batch receipt or row claim first, then Stage 2 approval/capacity locks. Serializable registration retries SQLSTATE `40001` and `40P01` up to three times. Operational retry after that boundary requires a new request and the same idempotency key.

## Consequences

- A worker can stop after a claim and another worker can safely resume after lease expiry.
- Reconciled totals are calculated from rows and protected by a database sum constraint.
- PostgreSQL integration tests, not in-memory substitutes, are required for completion.
- Stage 4 must add authorised cancellation, correction and casework commands rather than editing terminal rows.
- Production object storage, encryption/tokenisation of retained identity references, retention periods and queue scheduling still require approved infrastructure and policy.
