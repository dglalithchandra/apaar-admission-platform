# Deployment and rollback runbook

## Local deployment proof

1. Run `npm ci` and `npm run check`.
2. Run all four existing PostgreSQL integration commands and `npm run test:e2e:pilot`.
3. Run `npm run test:container` and `npm run test:recovery`.
4. Start the isolated stack with `docker compose -f infra/compose/compose.yaml up -d --build --wait`.
5. Confirm `/health`, authenticated `/ready` and auditor-only `/metrics`.
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
