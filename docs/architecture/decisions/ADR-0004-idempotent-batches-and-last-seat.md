# ADR-0004: Idempotent batches and transactional last-seat protection

Status: accepted

## Decision

Every batch and admission command carries an idempotency key scoped to the submitting institution. Repeated requests return the original result. Capacity reservation and admission acceptance occur in one serialisable or equivalently protected transaction.

## Why

Retries are normal on unreliable networks. Without idempotency they create duplicate students; without concurrency protection two simultaneous submissions can both consume the final seat.

## Consequences

The API exposes receipt and command references. Concurrency tests must submit competing admissions against a one-seat remainder and prove that only one is accepted.
