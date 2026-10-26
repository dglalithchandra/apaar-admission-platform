# Local toolchain status

Observed through 26 October 2026:

| Tool                         | Status                        | Effect                                                                                              |
| ---------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Git                          | 2.55.0                        | Repository and shallow reference clones work.                                                       |
| Node.js                      | 24.19.0                       | Application, domain and frontend tooling can run.                                                   |
| npm                          | 11.17.0                       | Package installation can run.                                                                       |
| Java                         | Not found                     | Not required by the current TypeScript application decision in ADR-0005.                            |
| WSL                          | 2.7.14.0; kernel 6.18.33.2-2  | Default version is WSL 2; the `docker-desktop` distribution runs as version 2.                      |
| Docker Desktop               | 4.96.3                        | The Linux container engine starts successfully through the WSL 2 backend.                           |
| Docker client/server         | 29.9.2 / 29.9.2               | The `desktop-linux` context is healthy and a freshly pulled `hello-world` container completes.      |
| PostgreSQL Testcontainer     | 17.6 (`postgres:17.6-alpine`) | The pinned Linux/amd64 image runs the migration and admission persistence suite with 11/11 passing. |
| Standalone PostgreSQL client | Not found                     | Not required locally because migration and repository verification use the pinned Testcontainer.    |

`npm run test:integration:postgres` completed successfully on 25 October 2026. It started the pinned `postgres:17.6-alpine` image and passed all 11 migration, repository, rollback, idempotency and concurrency tests. Unit tests, contract validation, lint, type checking and builds remain separate required checks.

`npm run test:e2e:batch` also completed successfully on 25 October 2026 against a fresh `postgres:17.6-alpine` Testcontainer. All 11 Stage 3 tests passed, including migration over Stage 2 and repeatability, upload/digest idempotency, provider retry exhaustion, lease recovery, concurrent row claims, final-seat competition, immutable decision references, rollback with audit/outbox atomicity, reconciliation and formula-safe correction export.

`npm run test:e2e:casework` completed successfully on 26 October 2026 against a fresh `postgres:17.6-alpine` Testcontainer. All 21 Stage 4 tests pass. They cover migration over Stages 2 and 3, repeatability, independently activated effective policy versions, scoped overlap exclusion, active-case uniqueness, lifecycle and optimistic-version guards, immutable history, exact concurrent replay and idempotency conflict, institution isolation and pagination, correction/evidence/purpose records, assignment/reassignment, conflict handling, information cycles, maker-reviewer-checker separation, appeals, transactional rollback, admission-version lineage, cancellation including multi-bucket release, same- and cross-institution transfer, exhausted target capacity, same-route rejection, authority blocking and one-time implementation receipts.

The React/Vite institution workspace was inspected in the local in-app browser at desktop and narrow responsive widths. Template selection, synthetic upload, immutable receipt, mixed results, filtering and the horizontally safe row-results presentation worked without browser console errors. This is development verification, not a formal WCAG or assistive-technology audit.

On 26 October 2026, the extended role-based casework workspace passed 23/23 portal tests with 94.77% statements, 94.53% branches, 93.51% functions and 95.57% lines. Its production Vite build and Storybook build passed; the Storybook bundle reports the existing non-blocking large-chunk warning. Three Storybook play functions exercise the institution, reviewer and checker entry journeys.

Formal in-app browser acceptance also completed on 26 October 2026. The run found that the only navigation was hidden below 900 px, repaired it as a sticky responsive navigation bar and then verified it at 390 × 844 and 1440 × 900. Keyboard-only Tab/Enter navigation reached and opened Casework. A synthetic case passed through institution creation/submission, reviewer conflict declaration and recommendation, independent checker approval, separately confirmed implementation and visible immutable receipt. Browser console warnings and errors were empty after the repair.

The final Stage 4 regression passed `npm run check`, 11/11 Stage 2 PostgreSQL tests, 11/11 Stage 3 batch tests, 21/21 Stage 4 casework tests, the production portal build, Storybook build, contract validation, `npm audit` with zero vulnerabilities and `git diff --check`.

The Stage 5 local integration foundation was verified on 26 October 2026. The repository-wide coverage run passed 209 tests: 31 portal, 19 admission-application, 56 casework, 57 admission-domain, 33 batch-ingestion and 13 integration-gateway tests. The gateway measured 92.30% statements, 86.16% branches, 98.41% functions and 93.84% lines; the admission-domain and casework packages remain at 100%. All 49 real PostgreSQL tests passed against fresh `postgres:17.6-alpine` Testcontainers: 11 admission, 11 batch, 21 casework and 6 gateway. Gateway persistence exercises repeatable four-stage migration, exact manifest replay, explicit approval supersession, overlap/scope rollback, immutable and revocable verification receipts, audit/outbox atomicity, notification claiming and dead-letter behavior.

Stage 5 in-app browser acceptance passed at 390 × 844, 768 × 1024 and 1440 × 900. The run covered the integration-assurance readiness view; disabled providers; temporary APAAR outage without false invalidation; unauthenticated and forbidden problems; a minimal expiring synthetic verification receipt; institution, reviewer and checker workspaces; and keyboard-only navigation to the new view. A tablet-height navigation stretch was found and repaired. Browser console warnings and errors were empty after the repair.

The final Stage 5 local-foundation regression passed `npm run check`, all four PostgreSQL commands, the production portal build, contract validation, `npm audit` with zero vulnerabilities and `git diff --check`. Live AICTE, APAAR/API Setu, OIDC tenant, notification and signing connections were not tested because no approved contracts or credentials are available; their modes remain disabled and are not completion evidence.

Docker Desktop was installed for all users with the WSL 2 backend. WSL was repaired in place from 2.6.3.0 to 2.7.14.0 using Microsoft's signed package after the older runtime failed Docker's startup precondition.
