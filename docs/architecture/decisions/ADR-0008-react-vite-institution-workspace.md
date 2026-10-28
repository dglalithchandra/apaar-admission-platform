# ADR-0008: React and Vite for the institution workspace

- Status: accepted
- Date: 25 October 2026

## Context

The repository had frontend principles but no selected framework. Stage 3 requires one exercised upload-to-results workflow, accessible interaction tests and reusable visual states without creating an empty application shell.

## Decision

Use React with strict TypeScript and Vite. Keep the product boundary behind a `PortalClient` interface so the screen can use deterministic local data now and a generated or hand-written HTTP adapter when the transport service is introduced. Use plain token-based CSS rather than a copied design system. Use Storybook for state review and Testing Library with jsdom for semantic interaction tests.

The UI is neutral “Admission Registry” software and contains no official AICTE or APAAR branding. The default client is explicitly synthetic. It does not claim to be connected to a production identity or admission service.

## Branding follow-up (28 October 2026)

The original decision records the product's neutral name at the time it was made. The current independent product name is **NiyamSetu | Admission Integrity & Policy Registry**. This display-name change does not change the synthetic client, APAAR adapter boundary, AICTE affiliation status or production connectivity.

## Consequences

- The Stage 3 workflow is buildable and testable without inventing authentication or provider credentials.
- Framework and direct dependencies are pinned in the lockfile.
- A later transport adapter can replace the demo client without moving admission rules into the browser.
- Formal assistive-technology testing, multilingual research and organisation authentication remain later assurance/integration work.
