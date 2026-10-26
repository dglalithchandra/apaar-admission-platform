# Casework operations runbook

This runbook covers the Stage 4 Parts 1–6 casework foundation. It uses synthetic references only and does not authorize a production policy or direct database repair.

## Preflight

1. Confirm migrations `0001_admission_registry.sql`, `0002_student_batch_ingestion.sql` and `0003_admission_casework_governance.sql` are applied in order.
2. Confirm the active policy version is authority-backed, effective for the current date and independently activated. Do not edit an active version; create a successor.
3. Confirm Docker uses the Linux engine and `postgres:17.6-alpine` is available for local regression.
4. Run `npm run validate:contracts` before releasing a client or server contract change.

## Safe verification

Run `npm run test:coverage -w @apaar-platform/admission-casework` for domain and authorization checks. Run `npm run test:e2e:casework` for the real PostgreSQL journey. A passing suite must include migration repeatability, replay/conflict behavior, rollback, audit/outbox atomicity, cancellation releases and target-first transfer reservation.

## Cancellation review

Before implementation, verify the case is independently approved, its expected version is current, the source admission version matches and the active policy explicitly enables `cancellation`. After success, verify one current `CANCELLED` admission version, one implementation receipt, one release per historical reservation, non-negative capacity counters and matching audit/outbox events. Never modify the original admission or decision.

## Transfer review

Verify the case type matches the movement: `PROGRAMME_OR_COURSE_TRANSFER` for the same institution and `INSTITUTION_TRANSFER` for a different institution. Verify the target retains the student and academic year, differs from the source route and has an effective approval snapshot. The implementation must return an accepted target decision before any source release. After success, verify the target reservation, source release, linked transfer row, current source `TRANSFERRED` version, current target `ACTIVE` version and exact decision references.

## Retry and incident handling

Clients may retry an identical command with the same idempotency key. A different payload with that key is an incident, not a retry. Serialization and deadlock errors use bounded automatic retries. If retries are exhausted, leave the case approved, inspect database health and retry the identical command only after the cause is understood.

For an apparent partial implementation, first query the receipt, current admission version, release ledger, capacity reservations, business audit and outbox by product references. The transaction should make partial state impossible. Preserve evidence and escalate if those records disagree; do not hand-edit counters or lifecycle rows.

## Current boundaries

The API contract has no production HTTP controller yet. Portal workflows, notifications, appeal-remedy execution, approved retention periods, operational alerts and production identity/SSO integrations remain outside Parts 1–6. Keep cross-institution transfer and cancellation disabled unless an authority-approved policy version explicitly enables them.
