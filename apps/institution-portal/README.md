# Institution portal

An exercised React/TypeScript workspace for admission batch ingestion and governed casework. The batch journey covers template download, preflight selection, upload receipt, reconciled counts, row filtering, safe correction download and retryable-row action. The casework journey covers institution requests and responses, reviewer conflict declarations and recommendations, independent checker decisions, explicit implementation confirmation and immutable receipts. It uses neutral product styling and synthetic data by default; it is not an official AICTE or APAAR portal.

The batch screen depends on `PortalClient`; casework depends on `CaseworkClient`. `DemoPortalClient` and `DemoCaseworkClient` exist only for local visual, Storybook and automated testing. They never verify a real identity, accept a real admission or call an external service. A production HTTP adapter must map OpenAPI `0.3.0-draft` after authentication, authorisation and hosting decisions are approved. The role selector is explicitly a synthetic preview control and must be replaced by trusted identity claims in production.

Commands:

- `npm run dev -w @apaar-platform/institution-portal`
- `npm run test -w @apaar-platform/institution-portal`
- `npm run storybook -w @apaar-platform/institution-portal`
- `npm run build -w @apaar-platform/institution-portal`

The interaction tests exercise keyboard-addressable semantic controls, loading/error/empty states, role transitions, conflict blocking and destructive-action confirmation. Storybook provides exercised institution, reviewer and checker journeys with the accessibility add-on in error mode.

Stage 4 browser acceptance passed on 26 October 2026 at 390 × 844 and 1440 × 900. It covers keyboard-only entry to Casework and the complete synthetic institution → reviewer → checker → implementation-receipt journey. The acceptance run found and fixed a narrow-width navigation defect; the responsive navigation now remains available below 900 px. Browser console warnings and errors were empty after the repair. A formal WCAG 2.2 AA audit with assistive technologies remains Stage 6 assurance work.

The Stage 5 integration-assurance view uses `IntegrationClient`. Its default demo adapter visibly presents disabled providers, unauthenticated/forbidden states, provider outage and a minimal synthetic verification receipt. `HttpIntegrationClient` targets the local gateway and obtains bearer material only through an injected token provider; it does not store credentials. The role-preview selector and all acceptance receipts remain synthetic.

The AICTE-only Policy Lab is an Admission Policy Digital Twin. It runs an 84-record synthetic
cohort through the unchanged source-confirmed admission engine twice: once against the approved
baseline and once against adjustable proposed capacity. It displays access, safety and category
distribution deltas with row-level explanations. The browser computation is an advisory synthetic
demonstrator; it never changes the admission ledger or claims authority for a proposed policy.
