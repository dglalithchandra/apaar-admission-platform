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

## Stage 4 — casework and governance (completed)

Conflicts, corrections, cancellations, transfers, appeals, maker-checker, policy versioning, consent/legal-basis records, audit review and purpose-limited verification.

1. **Domain and authorization foundation.** Case types, lifecycle transitions, correction-impact classification, authority blocking, role boundaries and maker-checker findings are covered by the casework unit suite with 100% measured coverage.
2. **PostgreSQL governance foundation.** Migration `0003_admission_casework_governance.sql` migrates after Stages 2 and 3. It protects active effective-dated policies, active-case and appeal uniqueness, lifecycle versions, maker-checker decisions, assignment and appeal history, admission-version lineage and implementation receipts.
3. **Repository and case workflow services.** Serializable, institution-scoped commands cover exact replay/conflict handling, versioned draft changes, withdrawal, assignment/reassignment, conflict declarations, information cycles, correction/evidence/purpose records, recommendations, independent checker decisions, atomic appeals with all four outcomes and filtered stable pagination. Appeal remedies remain a separate implementation command. The real PostgreSQL suite exercises rollback plus audit/outbox atomicity.
4. **Cancellation transactions.** An approved, authority-configured cancellation releases every historical reservation exactly once, appends a cancelled admission version and preserves the original admission and decision. Non-approved, conflicting and failed commands release nothing.
5. **Transfer transactions.** An approved transfer invokes the Stage 2 policy engine inside the same serializable transaction, reserves accepted target capacity before releasing source capacity, appends linked source/target versions and retains exact decision provenance. Failed, same-route, exhausted-capacity and unconfigured cross-institution attempts roll back fully.
6. **Versioned API contracts.** OpenAPI `0.3.0-draft`, the strict casework JSON Schema and schema-validated synthetic journey cover case lifecycle, correction, evidence, appeal, cancellation, transfer, stable problem codes, optimistic versions, idempotency and purpose-limited reads.
7. **Institution, reviewer and checker portal journeys.** The existing React workspace exposes one responsive case queue with role-limited actions: institutions create/submit/respond, reviewers start review, declare conflicts and recommend, and independent checkers decide before a separately confirmed implementation. Policy provenance, optimistic versions, non-destructive copy, empty/error states, immutable receipts and synthetic adapters are covered by 23 portal tests plus three Storybook interaction journeys.
8. **Operations, full regression and browser acceptance.** The final acceptance repaired the narrow-width navigation that previously hid Casework, verified the complete role journey and immutable receipt in the in-app browser at 390 × 844 and 1440 × 900, opened Casework with keyboard-only Tab/Enter navigation, and found no browser console warnings or errors.

Exit condition satisfied on 26 October 2026: `npm run check`, all 43 real-PostgreSQL integration tests across Stages 2–4, the production portal build, Storybook build, contract validation, `npm audit` and `git diff --check` pass. All committed fixtures and browser inputs use synthetic identifiers.

## Stage 5 — authorised integrations

Connect approved AICTE feed, APAAR/API Setu sandbox then production, SSO, notification gateway, existing institutional systems and approved signing service. Each integration gets a simulator, contract test and outage mode.

Local foundation implemented on 26 October 2026: authenticated Node HTTP gateway, deny-by-default role/tenant rules, production-shaped OIDC and APAAR ports, deterministic simulators, digest-checked approval import boundary, retry/dead-letter notification worker, minimal expiring verification receipts, synthetic signing, migration 0004 and portal integration-assurance states. Stage 5 remains **in progress**, because no live provider contract, credential, SSO tenant, authoritative approval feed, notification gateway or signing authority is available. The gateway currently exercises three representative Stage 4 HTTP handoffs; the remaining OpenAPI controller mappings are required before production release.

## Stage 6 — scale and assurance

Peak-load tests using agreed volumes, disaster recovery, penetration test, privacy impact assessment, accessibility audit, multilingual research, supply-chain controls, observability and operational runbooks.

## Stage 7 — controlled rollout

Pilot multiple institution types, measure task completion and data quality, reconcile every result, fix policy gaps, then expand by cohorts. A national launch is a migration programme, not a single deployment.
