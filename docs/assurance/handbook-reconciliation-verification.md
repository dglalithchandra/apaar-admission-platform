# Handbook reconciliation verification

Verified 29 October 2026. Scope: ADR-0024 and the current handbook/evidence reconciliation. The Git commit containing this report identifies the release revision; a resolved report with the final commit hash is also retained in the private-review folder outside the repository.

## Changes

- Shared source-capacity validator used by admission evaluation, approval service and concrete PostgreSQL import. Supplied 60/5/6 is refused under current rules; the default baseline is 60/3/3.
- Checks cover NRI within ordinary intake, separate TFW, combined FN/OCI/Gulf and subgroup allocation, foreign nationals across routes, lateral capacity and PM-USPY course/institution limits. Existing mode, programme, fill-condition and occupied-seat checks remain exercised.
- Fractional limits and unresolved subgroup transfers require review. Prior-year vacancies exceeding current intake require originating-year evidence review; current intake is not asserted as a statutory ceiling for a different year's vacancies. Authority labels do not activate exceptions.
- CSV VERIFIED remains a declaration and is normalized to pending. Trusted internal category evidence records reviewer, reference, time and method; synthetic assessments are explicitly labelled. Public request schemas exclude the trusted check object. Migration 0017 persists provenance without historic backfill.
- Policy Lab separates proposed current-rule configuration from explicitly unauthorized hypothetical amendments, exposes exact replay inputs and finding codes, and expands all transitions. Default 84-record replay: baseline 65/17/2; proposal 73/9/2 (accepted/rejected/review).
- Reconciled presentation and current screenshots replace current numerical references. Existing recordings and earlier exports are labelled superseded. No new video was produced in this stage.

## Final code checks

`npm run check` passed: formatting, ESLint, production build, workspace type checks, unit coverage and OpenAPI/JSON Schema validation.

319 unit/component tests passed: portal 61; admission application 25; casework 56; admission domain 61; batch ingestion 36; integration gateway 76; policy digital twin 4.

74 unique real PostgreSQL integration tests passed: admission 17, batch 11, casework 21, gateway 25. Gateway includes the pilot suites; these are not counted again. Suites started PostgreSQL 17.6 Alpine Testcontainers and exercised migration 0017, import rejection without partial writes, provenance persistence and simulation without ledger/audit/outbox writes.

Admission-domain statements, branches, functions and lines: 100%. Admission-application statements/lines/functions: 100%, branches 98.55%. Coverage is package-scoped with configured exclusions; this is not a claim of whole-system 100% coverage.

`npm audit --json`: zero vulnerabilities. `npm run security:scan`: no credential-shaped values found. `git diff --check`: passed. Test output is retained under ignored `tmp/reconciliation-final-*` logs.

## Reused evidence and boundaries

The earlier connected full-system smoke passed duplicate prevention, cancellation/readmission, reconciliation, printable records, restart persistence and public-key verification. It predates the final vacancy-review clarification and is not presented as a new final-revision full-system run. Final root and PostgreSQL suites were rerun after that clarification.

Browser checks on the final UI sources confirmed blocking the original invalid configuration, explicit NOT AUTHORIZED amendment text, expansion to all 67 transitions (68 table rows including header), default reset and no page overflow at the 390-pixel viewport with replay inputs expanded. These UI sources were unchanged by the later domain vacancy clarification. Responsive fixes restore the single-column workspace and contain expanded JSON. Earlier console inspection returned no warnings/errors.

The reconciled six-slide PPTX passed package, layout, re-import and native-chart/workbook checks. SHA-256: `6e2a1c5e8dd705e255d7253d715786dc79b67530528806a880a360f7b53a7f56`. Chart and recorded default outputs were independently checked; final exported chart labels and embedded workbook values agree. See `docs/hackathon/CURRENT_EVIDENCE.md`.

## Remaining limitations

No official APAAR integration, authenticated production category-review service, signed rounding configuration or authorized subgroup-transfer feed is claimed. Historic decisions are preserved, not reclassified. Hosting/authentication improvements and new video production remain outside this commit. The immediate submission issue is obtaining a fresh walkthrough that matches the corrected product; old footage must not be submitted as current evidence.
