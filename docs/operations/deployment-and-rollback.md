# Deployment and rollback runbook

## Local deployment proof

1. Run `npm ci` and `npm run check`.
2. Run all focused PostgreSQL integration commands, including pilot execution.
3. Run `npm run test:container` and `npm run test:recovery`.
4. Run `npm run test:full-system`; it builds, starts and exercises the isolated stack.
5. Confirm `/health`, `/ready`, auditor-only `/metrics`, fresh worker heartbeats and monotonic `/v1/events` cursors.
6. Run `npm run load:smoke` and then remove the stack with `docker compose -f infra/compose/compose.yaml down -v`.

The compose file is for synthetic local assurance. It must not be promoted directly to production.

## Production preconditions

- approved container registry and image-signing policy;
- non-synthetic OIDC issuer, audience and role/tenant mapping;
- official APAAR, approval, notification and signing adapters;
- managed secrets, TLS termination and network policy;
- independently approved database migration role and runtime role;
- owner-approved SLOs, alert routes, retention, RTO and RPO;
- change record, tested restore point and named rollback authority.

## Roll forward and rollback

Migrations are additive and ordered. Take and verify a restorable backup before a production migration. Deploy one application revision against the compatible schema, run readiness probes and synthetic transactions, then increase traffic. If application health fails, return traffic to the preceding immutable image while retaining the forward-compatible schema. Never reverse a migration with ad-hoc destructive SQL. A schema rollback requires a separately reviewed compensating migration and verified backup restoration.

Stop rollout immediately for authorization leakage, signature failure, capacity-counter drift, audit/outbox atomicity failure or migration inconsistency. Preserve audit evidence and correlation references; never copy student payloads into an incident channel.

For a controlled pilot, enable the global or institution kill switch before diagnosis. Pausing preserves accepted records. Cohort expansion is a new draft and must repeat readiness plus maker-checker activation. Pilot migration rollback is append-only and available only before activation; see the pilot operations and migration runbooks.

## Stage 7B execution controls

Apply additive migration `0007_synthetic_pilot_execution.sql` after `0006`. Before deployment, pause synthetic execution exposure, drain or allow worker leases to expire, and retain current checkpoints. Deploy the compatible application and run the migration repeatability check before re-enabling workers.

Rollback uses a forward compensating release or verified database restore. Do not drop immutable execution, command, incident, receipt, evidence or completion tables. If the application must roll back while the additive schema remains, keep new execution capabilities disabled and preserve every recorded version.

## Integrated reference rollout

Migrations `0008_integrated_reference_runtime.sql` and `0009_operational_event_reference_compatibility.sql` are additive. Run the migration and deterministic synthetic seed as one-shot jobs before gateway traffic. The seed is replay-safe; it does not erase operator-created synthetic journeys. Start the gateway, then the independent batch, outbox, notification and pilot workers, and require fresh `BATCH`, `OUTBOX`, `NOTIFICATION` and `PILOT` heartbeats before declaring readiness. The portal starts last.

For application rollback, stop new ingress, allow or expire leases, retain the PostgreSQL volume and redeploy the preceding compatible image. Never edit or delete event-stream rows, receipts or case history. Use `npm run reference:reset` only when intentionally destroying a local synthetic environment; it is not a production recovery procedure.
