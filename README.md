# APAAR Admission Registry and Verification Platform

This repository is the production-oriented foundation for AICTE problem statement 26263. It is deliberately separate from the earlier research reports and from the unrelated `deposit-assure` project.

The product goal is not merely to collect a spreadsheet. It must make every admission traceable to an approved capacity, verify or safely defer APAAR identity checks, detect conflicts, support correction and appeal, expose purpose-limited verification, and preserve a complete audit trail.

## Current status

The foundation through Build Stage 3 is complete:

- authoritative public sources and local copies are indexed;
- the current public APAAR verification contract is saved for adapter work;
- selected reference code is available locally without vendoring it into this repository;
- the product boundary, roles, domain language, architecture decisions, privacy baseline and open-source policy are documented;
- an initial OpenAPI contract and synthetic fixtures are ready;
- external decisions and protected inputs are isolated in one blocker register.
- a strict TypeScript workspace and framework-independent admission-domain kernel implement the first sourced capacity rules with automated tests.
- an exercised admission application service, versioned PostgreSQL migration, explicit `pg` adapter, idempotency, transactional capacity reservations, append-only audit and outbox are present;
- a pinned `postgres:17.6-alpine` Testcontainers suite covers migrations, persistence, rollback, idempotency, scheme-specific counters and the concurrent last seat; all 11 integration tests pass against the real Linux PostgreSQL image.
- product-owned CSV template 1.0, bounded streaming validation, digest/idempotency handling, malware and academic-identity simulator ports, resumable PostgreSQL row workers and row-derived reconciliation are implemented;
- the real PostgreSQL batch journey covers repeatable migration over Stage 2, replay/conflict behavior, worker recovery and concurrency, immutable Stage 2 decision links, final-seat competition, audit/outbox atomicity and correction safety;
- an exercised React/Vite institution workspace provides accessible template download, preflight upload, immutable receipt, reconciled totals, row filtering, explanations, correction export and valid retry actions using synthetic local data.

No real student data, credentials or official AICTE/APAAR branding are present.

## Read first

1. [Product scope](docs/product/system-scope.md)
2. [Domain glossary](docs/product/domain-glossary.md)
3. [Source reuse plan](docs/product/source-reuse-plan.md)
4. [System context](docs/architecture/system-context.md)
5. [Current submission workflow findings](docs/research/current-submission-workflow-findings.md)
6. [Approval-policy fact register](docs/research/approval-policy-fact-register.md)
7. [API Setu onboarding plan](docs/research/apisetu-onboarding-plan.md)
8. [External access blockers](docs/research/external-access-blockers.md)
9. [Delivery plan](docs/delivery/implementation-roadmap.md)
10. [CSV template 1.0](docs/product/csv-template-v1.0.md)
11. [Batch operations runbook](docs/operations/batch-ingestion-runbook.md)

## Repository map

- `apps/` — role-specific web applications and shared frontend packages; Stage 3 includes the exercised institution portal.
- `services/` — owned backend domain modules.
- `contracts/` — API contracts, schemas and synthetic test fixtures.
- `docs/` — product, architecture, security, research and delivery decisions.
- `infra/` — local and deployment infrastructure definitions.
- `reference/` — public documents and separately cloned reference projects; not application dependencies.
- `third_party/` — component inventory and retained licence notices.

## Working assumptions

- The working product name is neutral until branding permission is documented.
- The first implementation is a modular monolith with strict domain boundaries, not a fleet of premature microservices.
- APAAR is an external identity authority. Its contract is accessed through a replaceable adapter and a local simulator.
- Approval and capacity data are effective-dated snapshots. Historical admission decisions must remain reproducible.
- All sample identifiers in this repository begin with `SYNTH-` and are intentionally non-production values.
- Search indexes, dashboards and anomaly scores never decide whether a seat is valid; the transactional domain engine does.

## Local prerequisites

Git, Node.js and npm are available on this machine. Docker Desktop uses its WSL 2 Linux engine, and the framework-independent TypeScript domain kernel, application-service tests and PostgreSQL Testcontainers suite run locally. See [local toolchain status](docs/delivery/local-toolchain-status.md).

Use `npm run check` for formatting, linting, types, coverage, contracts and builds. Use `npm run test:integration:postgres` for the Stage 2 persistence suite and `npm run test:e2e:batch` for the Stage 3 real-PostgreSQL journey. The portal runs locally with `npm run dev -w @apaar-platform/institution-portal`.

## Data safety

Do not commit APAAR, Aadhaar, names, dates of birth, mobile numbers, emails, signing keys or production credentials. Put approved redacted inputs under `private-inputs/`, which is ignored by Git. Synthetic fixtures belong under `contracts/fixtures/synthetic/`.
