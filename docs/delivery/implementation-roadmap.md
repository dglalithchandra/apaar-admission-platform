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

## Stage 5 — authorised integrations (local engineering complete; authority connections blocked)

Connect approved AICTE feed, APAAR/API Setu sandbox then production, SSO, notification gateway, existing institutional systems and approved signing service. Each integration gets a simulator, contract test and outage mode.

Local engineering completed on 26 October 2026: every recorded OpenAPI operation is inventoried as native or delegated; the local Ed25519 OIDC/JWKS harness covers all seven roles and rotation/error cases; provider retries, jitter and circuit recovery are deterministic; approval integrity and concurrent supersession are guarded; notification leasing prevents duplicate delivery; and receipt lookup/revocation derives active, expired and revoked states after signature verification. Browser/portal states cover operator, administrator, reviewer, checker, auditor and verifier views. Live provider activation remains authority-blocked and is not represented as complete.

## Stage 6 — scale and assurance (local baseline complete)

The executable local baseline now includes hardened digest-pinned containers, secure defaults, identifier-safe metrics and security events, a seven-route k6 regression workload, PostgreSQL backup/restore and least-privilege checks, dependency audit, CycloneDX SBOM, recursive licence inventory, secret scanning, automated multi-role axe checks and deployment/recovery/observability runbooks.

The baseline does not invent national scale or certification. Production SLO/load volumes, RTO/RPO, hosting controls, languages, formal penetration test, privacy impact assessment and assisted accessibility/user research require the accountable inputs recorded in the blocker register.

## Stage 7A — controlled-rollout technical readiness (implemented locally)

The repository now provides immutable cohort configuration, institution/campus membership, effective windows, server-side capability flags, fail-closed kill switches, maker-checker activation, gated pause/resume/expansion/exit, synthetic legacy migration and correction receipts, tenant-safe observability, versioned contracts and institution/AICTE pilot views. PostgreSQL tests exercise concurrent activation, audit/outbox atomicity, membership isolation, migration replay/rollback and recovery after an atomic worker failure.

This is a technical readiness package, not evidence of a real pilot. Live institutions, student data, provider credentials and policy/legal decisions remain blocked.

## Stage 7B — synthetic pilot execution control plane (local engineering complete)

The repository now executes a production-shaped synthetic dress rehearsal with immutable execution versions, deterministic go/no-go, maker-checker approval, stop controls, durable workers, incident/recovery, tenant-safe evidence, controlled expansion and atomic completion reports. The multi-institution fixture includes ready, blocked, degraded and paused participation. Production authority remains `MANUAL_REVIEW`, and all real connections remain disabled.

## Stage 7C — authorised supervised pilot (blocked pending authority)

Obtain accountable approvals and protected inputs, select a representative real cohort, complete privacy/security review, validate production SLOs and run the approved supervised pilot. Reconcile every result, pause on stop conditions and expand only after authority review. A national launch remains a migration programme, not a single deployment.
