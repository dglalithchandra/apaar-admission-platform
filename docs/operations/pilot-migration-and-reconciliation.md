# Pilot migration and reconciliation

## Safe sequence

1. Export only authority-approved fields to a controlled workspace; never use the repository for real student data.
2. Map to schema `1.0` without changing identity or regulatory values.
3. Run `DRY_RUN` with a new idempotency key. Keep its digest and immutable receipt.
4. Correct every rejected source row explicitly using the generated `record_key,code` output. Duplicate keys, unsupported versions and padded or non-synthetic local values are rejected.
5. Repeat the same request with the same key only for exact replay. Changed content requires a new key; conflicting key reuse is rejected.
6. Reconcile total = accepted + rejected, duplicate counts and zero unexplained drift before `STAGED` processing.
7. A failed atomic write leaves no migration receipt, audit event or outbox event and can be safely retried. A staged migration can be rolled back append-only before activation.

## Reconciliation controls

Compare source row count and digest, accepted/rejected totals, correction disposition, admission decision references, capacity reservations, audit events and outbox events. Drift is a blocking readiness signal; never force totals to agree by editing receipts or silently coercing identity, approval or category data.

## Rollback

Rollback appends `ROLLED_BACK`; it does not delete the receipt or earlier `STAGED` history. It is rejected for a dry run, a prior rollback or after activation. Database schema rollback follows the deployment runbook: preserve the additive schema and use a reviewed compensating migration or verified restore, never destructive ad-hoc SQL.
