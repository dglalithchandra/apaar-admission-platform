# ADR-0006: PostgreSQL idempotency and transactional seat locking

Status: accepted and verified

## Decision

Use explicit SQL through `pg`. Each admission command runs in a PostgreSQL `SERIALIZABLE` transaction. The transaction first claims the institution-scoped idempotency row, locks the selected approval and all of its capacity counters in deterministic code order, evaluates the existing pure domain engine, then persists the admission, immutable decision, reservations, audit event and outbox event before commit.

An identical retry reads and returns the stored result. The same key with a different SHA-256 request hash is a conflict. Retryable transaction failures—serialization failure `40001` and deadlock detected `40P01`—are retried up to three times by rerunning the side-effect-free application callback.

Capacity is represented by explicit counters. NRI increments both `ORDINARY` and `NRI_WITHIN_ORDINARY`; PM-USPY increments course and institution counters. Each increment is conditional on `used_quantity < capacity_quantity`. TFW and PM-USPY allocations are non-convertible by database constraint.

## Why

The last seat and an idempotent replay are one consistency problem. A single authority transaction prevents two callers accepting the final seat and prevents a retry from creating a second admission. Explicit SQL keeps locks, constraints and retry behavior reviewable.

## Failure behavior

Any error rolls back the idempotency claim and every command, admission, reservation, audit and outbox write. A safe retry can then claim the key again. A completed result cannot be overwritten. Audit events, approval snapshots and decision versions have update/delete rejection triggers.

## Enforced outside database constraints

- The domain engine maps policy to a proposed reservation; the adapter only translates an accepted category to the counters that the decision already requires.
- Approval selection excludes a superseded snapshot only when its replacement is effective for the admission date.
- Multi-counter reservation is protected by the serializable transaction and conditional updates; a failed counter update aborts the whole transaction.
- Request hashes must be computed from a documented canonical request representation at the future HTTP boundary.
- Production reference generation must be collision-resistant; tests inject deterministic `SYNTH-` references.

## Verification boundary

The Testcontainers suite pins `postgres:17.6-alpine` and exercises migrations, repositories, supersession, multi-counter schemes, rollback, idempotency and real concurrent last-seat submissions. On 25 October 2026 all 11 tests passed against PostgreSQL 17.6 on Docker Desktop's WSL 2 Linux engine. The suite also proves that rejected and manual-review outcomes reserve nothing, rolled-back writes leave no audit or outbox residue, and authorised counters never overflow.
