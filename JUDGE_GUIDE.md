# Judge guide

Admission Registry is an executable, synthetic reference platform for Problem Statement 26263. It is built for judges to explore the complete product locally without AICTE, APAAR, API Setu or institutional credentials.

## Important boundary

The portal, admission policy, PostgreSQL persistence, batch processing, casework, audit history, integration contracts, role boundaries, outage handling, and Admission Policy Digital Twin run locally. APAAR identity results, AICTE sign-in, notifications, signing and the external approval feed are represented by replaceable synthetic adapters. No government or third-party service is contacted, and no real student data is included. The platform does not claim official AICTE or APAAR affiliation.

## Start the platform

Requirements: Docker Desktop running with its Linux engine, Git, Node.js 24 or later and npm 11 or later.

From the repository root:

```powershell
npm run judge:start
```

When the command completes, open <http://127.0.0.1:5173>. The compose stack seeds synthetic records on first start and keeps persistent state in its own local Docker volume.

Stop the services and keep the local data:

```powershell
npm run judge:stop
```

To restart after stopping, run `npm run judge:start` again. Judges do not need to run a migration or add credentials.

## Suggested 8-minute exploration

The role selector is a local validation control, not a sign-in system. It lets judges inspect what each account type is allowed to see. Choose the role from the top of the page, then choose a workspace from the left navigation.

1. **AICTE reviewer — Policy Lab (90 seconds).** Open Policy Lab and choose **Winning scenario**. See the synthetic cohort size, access created, excess admissions prevented and cases sent to a person. Change approved intake or a category limit. Outcomes recalculate, and the table explains each changed decision. The live admission ledger is not changed.
2. **Institution operator — Batch upload (90 seconds).** Change the role to Institution operator. Download template 1.0 or use `contracts/fixtures/synthetic/admissions-valid.csv`. Upload and inspect the receipt, row results and reconciliation. The separate `admissions-errors.csv` fixture can be used to inspect safe correction paths.
3. **AICTE reviewer — Casework (90 seconds).** Open the seeded, completed synthetic case. Inspect its state, decision history and evidence. This judge path demonstrates inspection of an existing case; it does not create a new recommendation.
4. **AICTE checker — Casework (60 seconds).** Switch roles and inspect the separate checker view and the same case history. The sample case is already complete, so treat this as an inspection walkthrough rather than a live approval exercise.
5. **Auditor — Integration assurance (60 seconds).** Preview a provider outage, missing access, denied access and verification receipt. The screen states which connections are simulated; no official service is contacted.
6. **Authorized verifier — verification journey (30 seconds).** Inspect a synthetic, purpose-limited verification receipt and its expiry/revocation states.
7. **AICTE reviewer — Pilot execution (60 seconds).** Inspect the seeded readiness checks and synthetic execution record. A local run is not represented as a real institutional pilot.

All committed student, institution, admission, case and policy examples use `SYNTH-` identifiers. Do not replace them with real student data.

## Evidence and regression commands

```powershell
npm run check
npm run test:integration:postgres
npm run test:e2e:batch
npm run test:e2e:casework
npm run test:e2e:gateway
npm run test:e2e:pilot
npm run test:e2e:pilot-execution
npm run test:full-system
npm run test:container
npm run test:recovery
npm run security:scan
npm run security:licenses
```

The full evidence reports are linked from the root README under assurance, operations and architecture. Test runs use only disposable synthetic identifiers. The full-system command recreates its own reference journey and checks persistence across a service restart.

## Troubleshooting

- **Docker is unavailable:** open Docker Desktop and wait for the Linux engine to report ready, then rerun `npm run judge:start`.
- **Port 5173 is already in use:** stop the other local app using that port, then rerun the command.
- **The browser page is blank or stale:** reload `http://127.0.0.1:5173` after Compose reports healthy.
- **You want a clean synthetic environment:** use Docker Desktop to remove the `apaar-platform-local` compose project and its named volume, then rerun `npm run judge:start`. This erases local synthetic journeys only.
- **You need proof without network access:** use `docs/hackathon/APAAR_SIH_2026_walkthrough.webm`, the six-slide PDF, and the committed test fixtures/reports.

## Repository map

- `apps/institution-portal/` — browser workspace and accessible role-specific screens.
- `services/` — admission rules, PostgreSQL application, batch ingestion, case governance, gateway and policy digital twin.
- `contracts/` — OpenAPI contract, schemas and synthetic fixtures.
- `infra/compose/` — local reference deployment.
- `docs/architecture/`, `docs/assurance/`, `docs/operations/` — design decisions, test evidence and runbooks.
- `docs/hackathon/` — SIH research, pitch script, product screenshots and judge materials.
