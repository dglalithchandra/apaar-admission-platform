# Implementation roadmap

## Stage 0 — foundation (completed)

Public sources, reference code, licence tracking, product boundaries, architecture decisions, initial contracts, synthetic data and blocker register.

## Stage 1 — admission-domain kernel (completed)

Strict TypeScript domain types, sourced capacity policy, stable rule codes and complete unit coverage.

## Stage 2 — PostgreSQL application foundation (completed)

- versioned PostgreSQL schema and migration runner;
- effective approval imports and immutable decision provenance;
- idempotent application service and serializable multi-counter reservations;
- append-only audit plus transactional outbox;
- OpenAPI and JSON Schema alignment;
- real PostgreSQL migration, repository, rollback, idempotency and concurrency tests verified through Testcontainers.

Exit condition satisfied on 25 October 2026: `npm run test:integration:postgres` passed 11/11 tests against pinned PostgreSQL 17.6.

## Stage 3 — versioned student batch-ingestion pipeline (completed)

- create the React/TypeScript institution shell and design-system Storybook;
- implement versioned CSV upload, receipt, row validation and correction export;
- implement APAAR simulator and adapter contract tests;
- reuse Stage 2 row idempotency and transactional decisions;
- expose institution and reviewer queues with full error/empty/outage states.

Exit condition satisfied on 25 October 2026: the complete synthetic upload-to-decision journey, portal interaction suite and pinned `postgres:17.6-alpine` batch integration suite pass locally. Receipt replay, bounded validation, provider failures, resumable workers, Stage 2 decision links, concurrent final-seat protection, reconciliation, audit/outbox atomicity and correction-file safety are exercised without real data.

## Stage 4 — casework and governance

Conflicts, corrections, cancellations, transfers, appeals, maker-checker, policy versioning, consent/legal-basis records, audit review and purpose-limited verification.

## Stage 5 — authorised integrations

Connect approved AICTE feed, APAAR/API Setu sandbox then production, SSO, notification gateway, existing institutional systems and approved signing service. Each integration gets a simulator, contract test and outage mode.

## Stage 6 — scale and assurance

Peak-load tests using agreed volumes, disaster recovery, penetration test, privacy impact assessment, accessibility audit, multilingual research, supply-chain controls, observability and operational runbooks.

## Stage 7 — controlled rollout

Pilot multiple institution types, measure task completion and data quality, reconcile every result, fix policy gaps, then expand by cohorts. A national launch is a migration programme, not a single deployment.
