# NiyamSetu | Admission Integrity & Policy Registry

**Verify the record. Apply the rule. Protect the seat.**

Independent software for **Smart India Hackathon 2026, problem statement 26263: APAAR ID-Based Student Data Management & Verification**. NiyamSetu is not a government-owned or officially endorsed product. APAAR identity results and other authority-controlled connections are simulated or disabled until authorised access is available.

This repository is the production-oriented foundation for AICTE problem statement 26263. It is deliberately separate from the earlier research reports and from the unrelated `deposit-assure` project.

The product goal is not merely to collect a spreadsheet. It must make every admission traceable to an approved capacity, verify or safely defer APAAR identity checks, detect conflicts, support correction and appeal, expose purpose-limited verification, and preserve a complete audit trail.

## Run the working prototype

The supported judge path uses Docker so PostgreSQL, migrations, workers, the gateway and the portal start together.

### Prerequisites

- Git;
- Docker Desktop with the Linux/WSL 2 engine running;
- network access on the first start to download pinned images and npm packages;
- Node.js 24+ and npm 11+ only when running the host-side test commands.

```powershell
git clone https://github.com/dglalithchandra/apaar-admission-platform.git
cd apaar-admission-platform
npm run judge:start
```

Open <http://127.0.0.1:5173/>. If that port is occupied, choose another loopback port before starting:

```powershell
$env:NIYAMSETU_PORT = '5175'
npm run judge:start
```

Stop the stack with `npm run judge:stop`. The database remains in the project Compose volume. The ignored `private-inputs/local-signing/` key must stay with that volume if previously issued local signatures need to remain verifiable.

For the exact role-by-role evaluation, use [JUDGE_GUIDE.md](JUDGE_GUIDE.md). It starts with the supplied `contracts/fixtures/synthetic/judge-practice.csv` and explains the expected accepted, invalid and manual-review results. All supplied records are fictional and use `SYNTH-` identifiers.

## Verified submission snapshot

The final documentation/media pass did not change application behavior. The following commands were rerun on 30 October 2026 against the current working tree:

| Verification                        | Actual result                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                     | Passed formatting, lint, production builds, type checking, coverage and contract/schema validation; 347 unit/component tests passed                                                                     |
| `npm run test:integration:postgres` | 17/17 passed against a real disposable PostgreSQL Testcontainer                                                                                                                                         |
| `npm run test:e2e:batch`            | 11/11 passed against PostgreSQL                                                                                                                                                                         |
| `npm run test:e2e:casework`         | 21/21 passed against PostgreSQL                                                                                                                                                                         |
| `npm run test:e2e:gateway`          | 25/25 passed against PostgreSQL                                                                                                                                                                         |
| `npm run test:full-system`          | Passed the connected Compose journey, seven roles, persistence across restart, duplicate rejection, cancellation/readmission, reconciliation, printable record and signature verification after restart |
| `npm audit --audit-level=high`      | 0 vulnerabilities reported                                                                                                                                                                              |
| `npm run security:scan`             | No credential-shaped values found in repository text files                                                                                                                                              |

Coverage is reported per workspace, not as one misleading blended percentage. The admission-domain and casework packages retained 100% statement/branch/function/line coverage; the portal reported 86.25% statements and 87.68% lines. Full output can be reproduced with the commands above. These are local synthetic engineering results, not a production certification, participant study or national-scale benchmark.

The concise [final verification report](docs/assurance/final-submission-verification.md) records the test scope and limitations without committing generated logs or coverage folders.

## Current status

The engineering foundation through the integrated synthetic Stage 7B reference deployment is complete:

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
- an exercised React/Vite institution workspace provides accessible template download, preflight upload, immutable receipt, reconciled totals, row filtering, explanations, correction export and valid retry actions using synthetic local data;
- governed correction, cancellation, transfer and appeal casework is implemented with effective-dated policy, institution isolation, role boundaries, maker-reviewer-checker separation, serializable cancellation/transfer transactions and immutable implementation receipts;
- OpenAPI `0.3.0-draft`, a strict casework schema, synthetic journey fixture, operations runbook and institution/reviewer/checker portal flows describe and exercise the Stage 4 boundary.

Build Stage 4 completed locally on 26 October 2026. The final gate passed 56 casework unit tests with 100% measured coverage, 21/21 real `postgres:17.6-alpine` casework tests, 23/23 portal tests and every earlier Stage 2 and Stage 3 PostgreSQL suite. Browser acceptance passed at 390 × 844 and 1440 × 900, including keyboard-only access to Casework and the complete synthetic institution → reviewer → checker → implementation-receipt journey. The acceptance run found and fixed the hidden narrow-width navigation defect; browser console warnings and errors were empty after the repair.

All locally executable Stage 5 engineering is complete. The gateway maps every recorded OpenAPI operation, exercises all seven roles through a local OIDC/JWKS authority, fails closed on downstream contract/status mismatches, hardens provider retries and circuit recovery, verifies approval-manifest integrity, leases notification delivery, and validates active/expired/revoked verification receipts. Live government, SSO, notification and signing integrations remain disabled pending the authority inputs in the blocker register.

The Stage 6 local assurance baseline is implemented: digest-pinned hardened containers, safe configuration, identifier-free metrics, immutable security events, mixed-route k6 workload, backup/restore drill, licence inventory, CycloneDX SBOM, dependency/secret scanning and automated multi-role accessibility checks. This is strong local evidence, not a claim of national production certification. See the [Stage 6 assurance report](docs/assurance/stage-6-local-assurance.md).

Stage 7A controlled-rollout readiness is implemented locally with immutable pilot configurations, tenant-scoped membership, effective windows, fail-closed capabilities and kill switches, maker-checker activation, readiness gates, synthetic migration/reconciliation receipts, pilot telemetry and accessible institution/AICTE pilot views. No real institution is activated and no real student data is used. See the [pilot operations runbook](docs/operations/pilot-operations-runbook.md).

Stage 7B now adds a production-shaped synthetic execution control plane: immutable lifecycle versions, a 17-check go/no-go package, PostgreSQL worker checkpoints and leases, incident/recovery, tenant-safe evidence, controlled expansion, atomic completion reporting and expanded institution/AICTE views. Production authority deliberately remains `MANUAL_REVIEW`; this is not a claim that a real pilot occurred. See the [Stage 7B assurance report](docs/assurance/stage-7b-synthetic-pilot-execution.md).

The integrated reference deployment now connects the production portal bundle, gateway composition root, PostgreSQL repositories, durable asynchronous work, outbox publication and operational event replay. `npm run test:full-system` exercises one real cross-service synthetic journey and restart persistence. See [ADR-0020](docs/architecture/decisions/ADR-0020-integrated-reference-composition.md) and the [integrated deployment assurance](docs/assurance/stage-7b-integrated-reference-deployment.md).

The advisory Admission Policy Digital Twin supports scenario comparison. AICTE personas can change
three proposed capacity levers and immediately replay the same 84-record synthetic cohort through
the existing policy engine. Baseline/proposal outcomes, access change, protected rejections,
category distribution and explainable decision transitions are shown without writing to the live
ledger. See [ADR-0021](docs/architecture/decisions/ADR-0021-advisory-policy-digital-twin.md).

No real student data, credentials or official AICTE/APAAR branding are present.

## SIH judge pack

- [Judge setup and complete role-by-role walkthrough](JUDGE_GUIDE.md)
- [Current 2:20 NiyamSetu walkthrough](docs/hackathon/ASTRAL_NiyamSetu_Current_Walkthrough.mp4), [natural narration script](docs/hackathon/ASTRAL_NiyamSetu_Current_Video_Script.md) and [caption file](docs/hackathon/ASTRAL_NiyamSetu_Current_Walkthrough.srt)
- [Complete project documentation](docs/hackathon/PROJECT_DOCUMENTATION.md)
- [Legacy plain-language project guide](docs/hackathon/APAAR_Platform_Simple_Guide.pdf) (shows the earlier Admission Registry name)
- [Presentation research and design rationale](docs/hackathon/SIH_PRESENTATION_RESEARCH.md)

The current walkthrough is a captioned edit of captures from the reconciled NiyamSetu application, with a composited pointer highlight. The separate script is ready for human narration; the MP4 has no voice track. It uses only local synthetic records and states the integration boundary on screen: official APAAR, AICTE SSO and external approval services are not connected. Older WebM recordings contain superseded policy values or branding and are retained only as history.

## Current verification improvements

- Stable student-key conflicts are checked across submissions and institutions; potential simultaneous enrolment goes to review rather than being declared unlawful.
- Verification requires a stored scoped grant. Withdrawal and receipt issuance are coordinated in PostgreSQL; independent Ed25519 receipts remain verifiable after restart.
- Capacity oversight compares counters with the reservation/release ledger and provides scoped, paginated reporting.
- Policy Lab exposes occupied seats and ordering sensitivity; its fixed synthetic cohort is scenario evidence, not a forecast.
- [Operator study materials](docs/research/operator-study/README.md) are prepared but no study has been conducted.
- [Synthetic printable admission record](docs/hackathon/NiyamSetu_Synthetic_Admission_Record.html) demonstrates separate student-ID and academic-identity fields.
- `npm run benchmark:postgres` runs a disposable pinned PostgreSQL contention/restart experiment. [Recorded evidence](docs/assurance/evidence/postgres-capacity-benchmark.json) includes the actual conditions and limitations.

`npm run judge:start` prepares an independent local signing key before starting Docker. For a direct `docker compose ... up`, run `npm run local:keys` first. Keep the ignored `private-inputs/local-signing/` folder with the local database; replacing its key makes earlier signatures unverifiable. This is a local issuer, not an official signing service.

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
12. [Casework operations runbook](docs/operations/casework-operations-runbook.md)

## Repository map

- `apps/` — role-specific web applications and shared frontend packages; Stage 3 includes the exercised institution portal.
- `services/` — owned backend domain modules.
- `contracts/` — API contracts, schemas and synthetic test fixtures.
- `docs/` — product, architecture, security, research and delivery decisions.
- `infra/` — local and deployment infrastructure definitions.
- `reference/` — public documents and separately cloned reference projects; not application dependencies.
- `third_party/` — component inventory and retained licence notices.

## Working assumptions

- NiyamSetu is the independent working product name; the project does not claim official AICTE or APAAR ownership or endorsement.
- The first implementation is a modular monolith with strict domain boundaries, not a fleet of premature microservices.
- APAAR is an external identity authority. Its contract is accessed through a replaceable adapter and a local simulator.
- Approval and capacity data are effective-dated snapshots. Historical admission decisions must remain reproducible.
- All sample identifiers in this repository begin with `SYNTH-` and are intentionally non-production values.
- Search indexes, dashboards and anomaly scores never decide whether a seat is valid; the transactional domain engine does.

## Local prerequisites

Git, Node.js and npm are available on this machine. Docker Desktop uses its WSL 2 Linux engine, and the framework-independent TypeScript domain kernel, application-service tests and PostgreSQL Testcontainers suite run locally. See [local toolchain status](docs/delivery/local-toolchain-status.md).

Use `npm run check` for formatting, linting, types, coverage, contracts and builds. Use `npm run test:integration:postgres` for Stage 2, `npm run test:e2e:batch` for Stage 3, `npm run test:e2e:casework` for Stage 4, `npm run test:e2e:gateway` for the integration boundary, `npm run test:e2e:pilot` for Stage 7A and `npm run test:e2e:pilot-execution` for Stage 7B. `npm run test:full-system` builds the complete compose topology and proves the connected journey. Stage 6 adds `npm run test:container`, `npm run test:recovery`, `npm run security:scan`, `npm run security:licenses` and `npm run security:sbom`; the declared load workload runs against the local compose stack with `npm run load:smoke`. The integrated portal is available at `http://127.0.0.1:5173` after `docker compose -f infra/compose/compose.yaml up --build --wait`.

## Data safety

Do not commit APAAR, Aadhaar, names, dates of birth, mobile numbers, emails, signing keys or production credentials. Put approved redacted inputs under `private-inputs/`, which is ignored by Git. Synthetic fixtures belong under `contracts/fixtures/synthetic/`.

## Current ASTRAL submission material

The [current walkthrough](docs/hackathon/ASTRAL_NiyamSetu_Current_Walkthrough.mp4) and [matching narration](docs/hackathon/ASTRAL_NiyamSetu_Current_Video_Script.md) reflect the source-aligned policy baseline and current institutional interface. The [judge guide](JUDGE_GUIDE.md) gives setup and role-by-role testing steps. The [operator study](docs/research/operator-study/README.md) is prepared for later, with zero sessions completed.

### Policy and evidence reconciliation

The policy engine and transactional approval import now enforce the handbook capacity ceilings. A 60-seat fixture permits at most three ordinary NRI and three separate TFW seats under the current five-percent provisions. Policy Lab separates proposed configurations from explicitly unauthorized regulatory amendments and exposes all replay inputs and transitions. CSV category declarations never establish independent verification. See [ADR-0024](docs/architecture/decisions/ADR-0024-handbook-capacity-and-evidence-boundaries.md).

Earlier recordings, PDFs and legacy presentations predate this correction and must not be used as current numerical evidence. Use the current MP4 and narration linked above.

## Judge usability

The connected Admissions workspace provides tenant-scoped search, pagination, original decision evidence and governed history. A selected registration can prefill a new request. The local verifier example shows its seeded recipient/purpose/grant, independent signing and live receipt-status refresh; unsupported diagnostic simulations are disabled. See [the current judge guide](JUDGE_GUIDE.md) for practice files, correction steps and limitations.

The local profile is loopback-only and must not be published through a tunnel. Safe hosted access is blocked on application authentication and evaluator isolation. If port 5173 belongs to another application, set `NIYAMSETU_PORT=5175` before `npm run judge:start` and use that port. No unrelated application needs to be stopped.
