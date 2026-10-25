# Local toolchain status

Observed on 25 October 2026:

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

The React/Vite institution workspace was inspected in the local in-app browser at desktop and narrow responsive widths. Template selection, synthetic upload, immutable receipt, mixed results, filtering and the horizontally safe row-results presentation worked without browser console errors. This is development verification, not a formal WCAG or assistive-technology audit.

Docker Desktop was installed for all users with the WSL 2 backend. WSL was repaired in place from 2.6.3.0 to 2.7.14.0 using Microsoft's signed package after the older runtime failed Docker's startup precondition.
