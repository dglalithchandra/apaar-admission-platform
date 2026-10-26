# Stage 7A controlled-rollout assurance

Verified locally on 26 October 2026. This report is evidence for synthetic technical readiness only; it is not an AICTE, APAAR, privacy, security or production approval and records no real pilot.

## Implemented boundary

- append-only pilot configuration and readiness/reconciliation history;
- institution/campus membership, effective windows, limits and version compatibility;
- fail-closed server-side capabilities plus global/institution kill switches;
- maker-checker activation, optimistic concurrency, pause/incident/resume, re-gated expansion and zero-drift exit;
- synthetic legacy import with schema validation, duplicate detection, explicit correction output, exact replay/conflict handling, atomic retry and pre-activation rollback;
- stable role/tenant authorization, versioned OpenAPI/JSON Schema and synthetic end-to-end fixture;
- identifier-free rollout metrics and accessible institution/AICTE pilot portal states.

## Verification results

`npm run check` passed formatting, ESLint, strict TypeScript, contracts, builds and 246 unit/component tests across 24 files:

- portal: 45 tests; 94.52% statements, 92.88% branches, 92.76% functions, 95.08% lines;
- admission application: 19 tests; 100% statements/functions/lines and 97.95% branches;
- casework: 56 tests; 100% statements, branches, functions and lines;
- admission domain: 57 tests; 100% statements, branches, functions and lines;
- batch ingestion: 33 tests; 98.16% statements, 91.93% branches, 97.72% functions, 99% lines;
- integration gateway: 36 tests; 94.61% statements, 89.06% branches, 98.01% functions, 95.10% lines.

The 58 unique real-PostgreSQL tests passed against `postgres:17.6-alpine`: Stage 2 11/11, Stage 3 11/11, Stage 4 21/21 and gateway/Stage 7 15/15. The isolated Stage 7 command also passed 6/6. Migration `0006_controlled_pilot_rollout.sql` applies after `0001`–`0005` and repeat migration is a no-op.

Storybook and the production portal built successfully. The hardened container ran as non-root with read-only root filesystem and healthy probe. Backup/restore and least-privilege recovery passed. Secret scanning found no credential-shaped repository values, the licence inventory found 468 packages with zero undeclared licences, CycloneDX 1.5 SBOM generation passed, and `npm audit` found zero vulnerabilities.

## Browser acceptance

Built-in Browser acceptance passed for institution onboarding and AICTE checker administration. Ready, blocked, degraded and paused states rendered the expected explanations. Keyboard-only Tab/Return navigation opened Pilot readiness. At 390 × 844 and 1440 × 900, measured document width did not exceed viewport width. Console warnings/errors were empty.

## PostgreSQL evidence

Tests cover repeatable migration, campus-to-institution isolation, immutable configuration/reconciliation/migration history, readiness, concurrent activation with one winner, audit/outbox atomicity, exact migration replay, conflict, rollback and clean retry after an injected transactional outbox failure. The repository uses an advisory transaction lock plus expected versions for pilot changes; migrations use unique idempotency keys and append-only state history.

## Remaining blockers

Real institution selection, authoritative master data, APAAR/API Setu contract and credentials, production OIDC/notifications/signing, legal basis and consent language, retention, branding, SLO/RTO/RPO, hosting accreditation, named incident/go-no-go authority, penetration testing and user/accessibility research remain in the external blocker register.
