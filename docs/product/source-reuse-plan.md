# Source reuse plan

## Decision rule

Use a mature project as a maintained dependency or container when it solves a generic infrastructure problem. Study it when it contains valuable patterns but a different domain model. Write the AICTE admission and capacity rules ourselves.

| Area | Selected source | Use mode | What it solves | Why this choice |
|---|---|---|---|---|
| Web application | React + TypeScript | Dependency | Typed, component-based interfaces | Large ecosystem and strong fit for complex operational screens. |
| Accessible primitives | Radix + selectively adopted shadcn source | Dependency / owned component code | Keyboard, focus and overlay behaviour | Lets us own appearance while retaining tested interaction primitives. |
| Data tables | TanStack Table + Virtual | Dependency | Large sortable/filterable work queues | Headless control avoids a generic vendor look. |
| Forms | React Hook Form + Zod | Dependency | Complex field and schema validation | One schema can drive form feedback and contract checks. |
| Server state | TanStack Query | Dependency | Caching, retries and invalidation | Makes partial failure and slow-network states explicit. |
| Charts | Apache ECharts | Dependency | Dense regulatory visualisation | Strong accessibility and large-data support when configured carefully. |
| Component review | Storybook | Development dependency | States, accessibility and visual regression | Forces empty/error/loading/outage states to exist before screen proliferation. |
| Domain backend | Node.js + strict TypeScript | Owned application; framework decision deferred to the first exercised service | Deterministic rules, transactions, validation and integration boundaries | Matches the available production-grade toolchain and shares contract types while keeping the domain framework-independent. |
| Authoritative database | PostgreSQL | Managed service/container | Transactional record, constraints and history | Correctness and concurrency are more important than fashionable storage. |
| Identity and access | Keycloak | Container/dependency | OIDC, federation and role scaffolding | Avoids building passwords and sessions; final government SSO remains pluggable. |
| Long workflows | Temporal | Container/client | Retries, timers and human/external waits | Suitable for corrections and outages; introduce after the first vertical slice proves need. |
| Fine-grained policy | Open Policy Agent | Container/client | Central, testable authorisation decisions | Keeps access policy distinct from admission-domain rules. |
| Events | Kafka + Debezium outbox | Container/client | Reliable downstream integration | Use after transactional writes; never let event publication decide seat allocation. |
| Search | OpenSearch | Container/client | Officer search and analytics exploration | Derived index only, rebuildable from the authoritative store. |
| Observability | OpenTelemetry | Dependency/collector | Traces, metrics and structured telemetry | Vendor-neutral operational evidence. |
| Registry/credentials | Sunbird RC | Reference only | Registry schemas, attestations and credentials | Useful patterns, but not AICTE's approval/admission model. |
| National identity | MOSIP | Reference only | Partner onboarding, audit, resident services | Identity architecture patterns without importing a different identity domain. |
| Civil registry workflow | OpenCRVS | Reference only | Corrections, cases and low-connectivity government workflows | Strong casework ideas; wrong foundation for admission capacity. |
| Government exchange | X-Road | Reference only | Signed, controlled organisation-to-organisation exchange | Valuable for integration governance, not the internal application core. |
| Government frontend | GOV.UK One Login / Design System | Reference only | Accessible forms, errors and confirmations | Evidence-based service patterns, adapted to Indian institutional workflows. |
| Operational UI | Cloudscape | Reference plus selective dependency evaluation | Dense tables, filters, side navigation | Built for large operational consoles; visual tokens must remain ours. |

## Explicitly not copied

Approval snapshots, seat buckets, admission lifecycle, final references, cross-institution conflicts, correction rules, certificate disclosure, reconciliation and regulatory reporting are owned product code. A generic SIS or credential registry cannot supply these rules safely.
