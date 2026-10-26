# Stage 7B synthetic pilot execution assurance

Verified locally on 26 October 2026. This is evidence for a synthetic technical dress rehearsal only. It is not evidence that AICTE or any institution conducted, approved or completed a real pilot.

## Implemented boundary

- immutable execution lifecycle with maker-checker review, schedule gates, optimistic concurrency and exact replay;
- deterministic 17-check go/no-go package with honest production-authority `MANUAL_REVIEW`;
- global, cohort and institution stop controls that preserve accepted records;
- four-institution synthetic journey with migration correction, outage, incident, recovery, expansion and completion;
- PostgreSQL worker checkpoints, expiring leases, bounded batches, retry/backoff, takeover, receipts and dead letters;
- tenant-protected evidence, identifier-safe metrics, incidents/timelines and atomic completion reports;
- OpenAPI `0.5.0-draft`, strict JSON Schema, route inventory and accessible institution/AICTE control-plane views.

## Verification summary

Focused Stage 7B unit tests pass 13/13 with the gateway package at 94.30% statements, 87.82% branches, 98.09% functions and 94.98% lines. The focused Stage 7B PostgreSQL suite passes 8/8 against `postgres:17.6-alpine`. The portal package passes 45 tests at 94.61% statements, 93.63% branches, 92.85% functions and 95.16% lines.

The repository-wide coverage gate passes 259 unit/component tests. All 66 unique real-PostgreSQL integration tests pass: 11 admission, 11 batch, 21 casework and 23 gateway tests, with the gateway total comprising 9 base, 6 Stage 7A and 8 Stage 7B tests. The production and Storybook builds, contract validation and SBOM generation pass. `npm audit` reports zero vulnerabilities, the credential-pattern scan finds no matches, and the licence inventory reports 468 packages with zero undeclared licences.

The digest-pinned container check passes as user `node` with a read-only root filesystem and healthy status. The backup/restore and least-privilege recovery drill passes in 4.344 seconds. In-app Browser acceptance covers the tenant-bounded institution view, the four-institution AICTE checker view, keyboard-only navigation and all 14 presentation states. DOM measurements confirm zero horizontal overflow at 390 × 844, 768 × 1024 and 1440 × 900; the browser console contains no warnings or errors.

## Authority blockers

No real cohort, official approval, legal basis, privacy decision, identity-provider credential, production OIDC mapping, hosting approval, notification sender, signing service or real student data was supplied or used. Every local reference is synthetic and all production adapters remain disabled.
