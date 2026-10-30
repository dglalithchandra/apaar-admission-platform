# Final submission verification

Date: 30 October 2026

Scope: current application source plus final README, project documentation, walkthrough and narration. No runtime code, API contract, dependency, migration or fixture was changed by this submission pass.

## Results

| Command                                     | Result                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run check`                             | Passed formatting, lint, all workspace builds, type checking, coverage and contract/schema validation |
| Unit/component tests inside `npm run check` | 347 passed, 0 failed                                                                                  |
| `npm run test:integration:postgres`         | 17 passed, 0 failed                                                                                   |
| `npm run test:e2e:batch`                    | 11 passed, 0 failed                                                                                   |
| `npm run test:e2e:casework`                 | 21 passed, 0 failed                                                                                   |
| `npm run test:e2e:gateway`                  | 25 passed, 0 failed                                                                                   |
| `npm run test:full-system`                  | Passed                                                                                                |
| `npm audit --audit-level=high`              | 0 vulnerabilities reported                                                                            |
| `npm run security:scan`                     | No credential-shaped values found in repository text files                                            |

The PostgreSQL suites used disposable real PostgreSQL containers. The full-system command rebuilt and started the Compose topology and returned:

- case state `IMPLEMENTED`;
- pilot state `COMPLETED`;
- restart persistence passed;
- fresh-key duplicate rejection passed;
- readmission after cancellation passed;
- capacity reconciliation passed;
- printable record passed;
- public-key verification after restart passed;
- seven roles exercised.

The exact synthetic admission, batch and case identifiers vary by run and are intentionally not treated as stable evidence.

## Coverage scope

The admission-domain and casework workspaces reported 100% statements, branches, functions and lines. Admission application reported 100% statements, functions and lines with 98.55% branches. The portal reported 86.25% statements, 85.66% branches, 85.35% functions and 87.68% lines. Other workspace summaries are emitted by `npm run test:coverage` and remain reproducible from the lockfile.

## Runtime check

After the full-system run, PostgreSQL, gateway, portal and all durable workers reported healthy. The portal and readiness endpoint both returned HTTP 200 on loopback port 5175, the alternate port used on this machine because the default port was occupied.

## Limitations

These are local synthetic engineering tests. They do not prove official APAAR/AICTE connectivity, legal authority, usability with admissions staff, national-scale capacity, formal accessibility certification or production security accreditation. The local reference role explorer must not be publicly exposed.
