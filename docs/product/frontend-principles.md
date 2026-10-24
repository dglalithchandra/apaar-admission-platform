# Frontend principles

The interface should feel like a carefully designed public service and operations product, not a generated dashboard template.

## Visual direction

- restrained neutral surfaces, one primary action colour and semantic status colours;
- strong type hierarchy and compact, readable density;
- square or modestly rounded controls; no glass panels, decorative gradients or floating statistics;
- data source, timestamp, scope and next action visible beside every consequential status;
- charts support a question and link back to records; they never exist as decoration.

## Interaction rules

- common tasks are keyboard-complete and meet WCAG 2.2 AA;
- uploads support drag/drop and file selection, resume, checksums and reuse within the journey;
- file errors state the exact problem: absent, wrong type, too large, empty, infected, password-protected, malformed template or transient failure;
- row errors preserve the uploaded value and show a correction path;
- partial success separates accepted, pending and rejected rows and allows export of only affected rows;
- destructive changes require reason, effective date and preview of consequences;
- all lists have loading, empty, partial, error, stale and permission-denied states;
- low bandwidth is a design condition: avoid unnecessary assets, paginate server-side and keep interrupted work recoverable;
- content is externalised for English and Indian-language translation; IDs and dates remain unambiguous.

## Role-specific home screens

- Institution: tasks, current capacity, submissions requiring action and deadlines.
- AICTE officer: work queues, policy-impact summaries and drill-down—not raw national vanity totals.
- Student: admission/link status, data source, privacy information and dispute route.
- Verifier: purpose selection, consent/legal basis, minimal result and verification receipt.

## Reference lessons

- GOV.UK: direct language, error summaries, retained values, confirmation pages and accessible uploads.
- Cloudscape: operational navigation, filters, tables, property panels and progressive disclosure.
- Primer: audit history, permissions and dense activity presentation.
- Carbon: enterprise data patterns and accessible component behaviour.
- Stripe: API onboarding, request identifiers and precise developer errors.
- Linear: quick navigation and compact work queues.

These are interaction lessons, not permission to reproduce another organisation's brand.
