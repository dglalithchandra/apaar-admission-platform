# Institution portal

An exercised React/TypeScript workflow for template download, preflight selection, upload receipt, reconciled counts, row filtering, safe correction download and retryable-row action. It uses neutral product styling and synthetic data by default; it is not an official AICTE or APAAR portal.

The screen depends on the `PortalClient` interface. `DemoPortalClient` exists only for local visual and automated testing. It never verifies an identity or accepts an admission. A production HTTP adapter must map the versioned OpenAPI contract after authentication, authorisation and hosting decisions are approved.

Commands:

- `npm run dev -w @apaar-platform/institution-portal`
- `npm run test -w @apaar-platform/institution-portal`
- `npm run storybook -w @apaar-platform/institution-portal`
- `npm run build -w @apaar-platform/institution-portal`

The interaction tests exercise keyboard-addressable semantic controls and error summaries. Formal WCAG 2.2 AA audit with assistive technologies remains Stage 6 assurance work.
