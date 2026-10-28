# Foundation work report

Date: 24 October 2026

## Outcome

The local Git workspace contains the research-to-build foundation for NiyamSetu, an independent admission integrity and policy registry associated with SIH 2026 problem statement 26263. APAAR and other protected integrations remain subject to official access; the project clearly separates verified facts, design assumptions and inputs that require authority.

## Completed without user assistance

### Official/public web verification

- Inspected the public API Setu sandbox guidance.
- Inspected the live ABC/APAAR API catalogue and opened the APAAR collection.
- Confirmed the public APAAR 1.1.0 operations and downloaded the OpenAPI file.
- Inspected Sunbird RC's repository, purpose and MIT licence.
- Inspected Cloudscape's open-source status, operational UI focus and Apache-2.0 licence.
- Inspected current GOV.UK government-service file-upload, error and accessibility guidance.

### Local source and document collection

- Downloaded and hashed the AICTE Approval Process Handbook for 2024-25 to 2026-27.
- Downloaded and hashed the AICTE student-enrolment manual.
- Downloaded and hashed the AICTE PGDM bulk-upload manual.
- Downloaded and hashed the Samarth brochure.
- Downloaded, hashed and linted the public API Setu APAAR 1.1.0 OpenAPI contract.
- Shallow-cloned Sunbird RC, GOV.UK One Login frontend and Cloudscape components at recorded commits.
- Copied their licence notices into the third-party register.

### Product and engineering groundwork

- Defined users, expectations, regulator views and product boundaries.
- Explained IDs, seat categories, admission references, exam numbers and credentials in plain language.
- Selected dependency, container, reference-only and owned-source use modes.
- Chose a modular-monolith first architecture and documented why.
- Defined APAAR adapter isolation, effective-dated approvals, idempotency and last-seat concurrency.
- Defined a privacy/threat baseline and open-source intake policy.
- Created a product-owned OpenAPI draft and validated it with Redocly with zero errors or warnings.
- Created a JSON admission schema plus valid, invalid and capacity synthetic fixtures.
- Created a delivery roadmap and local toolchain report.

## Public retrievals that did not succeed

- The NDEAR report endpoint returned HTTP 503 after retries. Its authoritative URL is recorded for later retry.
- The CERT-In PDF endpoint returned an HTML landing page rather than the document. The response was preserved with an accurate `.html` name and is not treated as evidence.

Neither failure prevents product implementation because the relevant architecture/security requirements are documented from other authoritative material and can be refreshed before assurance review.

## Work intentionally not performed

- No external account, API subscription, key or credential was created.
- No real student or institutional data was collected.
- No official AICTE/APAAR logo or brand was used.
- No source was copied from an unlicensed repository.
- No large technology was forked into the application.
- Java and Docker were not installed system-wide because the granted scope covered this workspace, not operating-system configuration or acceptance of desktop licences.
- No production claim was made for the public sandbox or unauthorised API calls.

## Inputs still requiring authority

The complete list is in `docs/research/external-access-blockers.md`. The critical path is:

1. AICTE approval/capacity source feed and accountable policy definitions.
2. Approved API Setu/APAAR use case, subscription, current cryptographic specification and secrets.
3. Privacy-reviewed sample files from several institution types.
4. Hosting, recovery and scale targets.
5. Branding, language and user-research access.
6. Signing/HSM policy if verifiable academic credentials are in the first release.

## Recommended next executable step

Install or provide JDK 21 and a container runtime, then implement one end-to-end synthetic journey: approval snapshot → CSV upload → receipt → APAAR simulator → capacity decision → correction file → reviewer confirmation. This tests the real regulatory core before investing in national dashboards.
