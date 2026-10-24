# Implementation roadmap

## Stage 0 — foundation (completed)

Public sources, reference code, licence tracking, product boundaries, architecture decisions, initial contracts, synthetic data and blocker register.

## Stage 1 — executable core

- create the React/TypeScript institution shell and design-system Storybook;
- create the strict TypeScript modular application and PostgreSQL migrations;
- import a synthetic approval snapshot;
- implement versioned CSV upload, receipt, row validation and correction export;
- implement APAAR simulator and adapter contract tests;
- prove idempotency and last-seat concurrency;
- expose institution and reviewer queues with full error/empty/outage states.

Exit condition: a complete upload-to-decision journey runs locally with automated tests and no real data.

## Stage 2 — casework and governance

Conflicts, corrections, cancellations, transfers, appeals, maker-checker, policy versioning, consent/legal-basis records, audit review and purpose-limited verification.

## Stage 3 — authorised integrations

Connect approved AICTE feed, APAAR/API Setu sandbox then production, SSO, notification gateway, existing institutional systems and approved signing service. Each integration gets a simulator, contract test and outage mode.

## Stage 4 — scale and assurance

Peak-load tests using agreed volumes, disaster recovery, penetration test, privacy impact assessment, accessibility audit, multilingual research, supply-chain controls, observability and operational runbooks.

## Stage 5 — controlled rollout

Pilot multiple institution types, measure task completion and data quality, reconcile every result, fix policy gaps, then expand by cohorts. A national launch is a migration programme, not a single deployment.
