# Judge-use evidence inventory

This package improves local judge use without changing admission policy, official integrations or authentication architecture.

## Implemented and observable

- **Admissions:** tenant-scoped literal search, 25-record pagination, current governed status, stored decision findings, original ruleset, approval provenance, input/identity assessments, reservations and version history. The detail view does not invent historical counters or claim replay.
- **Requests:** selection prefills a registered admission reference. The browser created/submitted a new synthetic correction request, declared no conflict as reviewer, recommended approval and recorded the checker approval. Approval remained separate from implementation. Stored conflict declarations and opening times now drive the connected read model; the previous hardcoded declaration/date mapping was removed.
- **Upload/correction:** `judge-practice.csv` produced one accepted ordinary row, one missing-field invalid row and one TFW evidence review. `judge-practice-corrected.csv` accepted the corrected ordinary row in a new batch while retaining the original receipt.
- **Verification:** the seeded recipient, purpose, claims and grant scope are explicit. Refresh reads actual persisted receipt status. Unsupported connected preview operations are disabled. Local signatures are accurately described as independent Ed25519 signing.
- **Negative cases:** the verifier UI denied upload; the real full-system HTTP journey denied verifier record browsing and cross-tenant enumeration, and rejected an overlong search. Existing grant-withdrawal semantics remain unchanged.
- **Startup:** optional NIYAMSETU_PORT selects another loopback port and matching origin. Verification used http://127.0.0.1:5175 because the browser's old 5173 origin displayed another product. No other application's data or browser storage was cleared.

## Validation

`npm run check` passed all formatting, lint, build, type, coverage and contract gates. 324 unit/component tests passed: portal 66, application 25, casework 56, domain 61, batch 36, gateway 76, twin 4. Domain coverage remains 100%; coverage is not whole-system 100%.

The final `npm run test:full-system` passed with real Compose PostgreSQL persistence, including the new search/provenance assertions, actor-specific conflict read, HTTP denials, governed cancellation, duplicate prevention, reconciliation, restart persistence and post-restart signature verification. Logs: ignored `tmp/judge-final-system.log`; final root gate: `tmp/judge-verified-root.log`. Contracts were revalidated after optional read-model fields were documented. The previous 74 PostgreSQL Testcontainers tests cover unchanged transaction/migration services; they are retained evidence, not claimed as a new run in this package.

Browser checks exercised the actual connected bundle: upload and corrected upload, admission selection and request prefill, institution/reviewer/checker actions, denial, receipt issuance and status refresh. A 390-pixel viewport with expanded evidence had document width 375 pixels. The narrow check also identified a sticky-navigation overlay; the final layout makes narrow-screen navigation scroll normally rather than cover the evidence. The final narrow recheck confirmed static navigation, 390-pixel viewport and 375-pixel document width. Browser warning/error logs were empty. Current desktop capture: `docs/hackathon/assets/judge-admission-evidence.jpg`.

## Use in PPT/video

Use the actual accepted/invalid/review outcomes and selected stored findings to explain the admission workflow. Show the separate draft/submission/review/checker states, and explain that a checker decision does not itself implement a correction. Use the existing Policy Lab source/context only where relevant. Do not imply government identity verification or real student consent. See CURRENT_EVIDENCE.md for which older artifacts are superseded.

The new practice fixtures and JUDGE_GUIDE.md reproduce the journey. Persisted synthetic browser request: SYNTH-CASE-REFERENCE-AB9CBC85-B2ED-4BE0-9AB7-98D2D4DD5D42. Practice upload receipt: SYNTH-RECEIPT-ADAF70DA-FD8F-46A4-8D54-19D4279656A6. Corrected upload receipt: SYNTH-RECEIPT-C607264C-F306-4A3B-B4B6-358BCB524D46. These references describe this local run, not portable seed records.

## Remaining blockers

There is no verified public hosted release. The synthetic reference-session endpoint and browser role explorer must not be exposed publicly; genuine sessions, server-owned role/tenant membership and isolated evaluator workspaces are required first. Docker remains the supported local launch; a native launcher was not added. The small evidence view intentionally exposes existing stored facts rather than a new replay engine. Verification remains a seeded scoped example: grant creation/withdrawal and service-authorized revocation are not exposed as unrestricted browser actions. Existing PostgreSQL tests cover withdrawal; the browser did not perform grant withdrawal. No new PPT or video was produced in this package.
